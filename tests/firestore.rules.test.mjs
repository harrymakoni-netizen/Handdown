import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
const owner = "rS4BSfSY2Gdc3jw8MNfOYa4zflq1";
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-handdown",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});
after(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});
const db = (uid) =>
  uid
    ? env.authenticatedContext(uid).firestore()
    : env.unauthenticatedContext().firestore();
const member = (uid, role) => ({ uid, role, createdAt: serverTimestamp() });
test("only provisioned owner can create the training workspace", async () => {
  const data = {
    name: "Training workshop",
    ownerUid: owner,
    createdAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(db(), "workspaces/training"), data));
  await assertFails(setDoc(doc(db("stranger"), "workspaces/training"), data));
  await assertSucceeds(setDoc(doc(db(owner), "workspaces/training"), data));
  await assertFails(setDoc(doc(db(owner), "workspaces/another"), data));
  await assertFails(
    setDoc(doc(db(owner), "workspaces/training"), {
      ...data,
      ownerUid: "stranger",
    }),
  );
});
test("owner bootstraps own membership and adds a learner", async () => {
  await assertSucceeds(getDoc(doc(db(owner), "workspaces/training")));
  const ownerDb = db(owner);
  await assertSucceeds(
    runTransaction(ownerDb, async (tx) => {
      const w = doc(ownerDb, "workspaces/training");
      const m = doc(ownerDb, `workspaces/training/members/${owner}`);
      await Promise.all([tx.get(w), tx.get(m)]);
      tx.set(w, {
        name: "Training workshop",
        ownerUid: owner,
        createdAt: serverTimestamp(),
      });
      tx.set(m, member(owner, "owner"));
    }),
  );
  await assertSucceeds(
    setDoc(
      doc(db(owner), "workspaces/training/members/student"),
      member("student", "learner"),
    ),
  );
  await assertSucceeds(
    getDoc(doc(db("student"), "workspaces/training/members/student")),
  );
});
test("users cannot self-enrol, elevate roles or read other memberships", async () => {
  await assertFails(
    setDoc(
      doc(db("stranger"), "workspaces/training/members/stranger"),
      member("stranger", "owner"),
    ),
  );
  await assertFails(getDoc(doc(db(), "workspaces/training/members/student")));
  await assertFails(
    getDoc(doc(db("stranger"), `workspaces/training/members/${owner}`)),
  );
  await assertSucceeds(
    setDoc(
      doc(db(owner), "workspaces/training/members/student"),
      member("student", "learner"),
    ),
  );
  await assertFails(
    setDoc(
      doc(db("student"), "workspaces/training/members/student"),
      member("student", "supervisor"),
    ),
  );
  await assertFails(
    deleteDoc(doc(db("student"), "workspaces/training/members/student")),
  );
});
test("reject malformed membership, second owner and all unimplemented data writes", async () => {
  await assertFails(
    setDoc(
      doc(db(owner), "workspaces/training/members/student"),
      member("student", "owner"),
    ),
  );
  await assertFails(
    setDoc(doc(db(owner), "workspaces/training/members/student"), {
      ...member("student", "learner"),
      admin: true,
    }),
  );
  await assertFails(
    setDoc(
      doc(db(owner), "workspaces/training/members/student"),
      member("wrong", "learner"),
    ),
  );
  await assertFails(
    setDoc(doc(db(owner), "workspaces/training/lessons/example"), {
      title: "Unauthorized publication",
    }),
  );
  await assertFails(
    deleteDoc(doc(db(owner), `workspaces/training/members/${owner}`)),
  );
});
test("business data is role isolated and only callable backends can mutate it", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const d = context.firestore();
    await setDoc(doc(d, "workspaces/training/members/student"), {
      uid: "student",
      role: "learner",
    });
    await setDoc(doc(d, "workspaces/training/members/expert"), {
      uid: "expert",
      role: "supervisor",
    });
    await setDoc(doc(d, "workspaces/training/drafts/stand"), {
      title: "Private draft",
    });
    await setDoc(doc(d, "workspaces/training/lessons/stand"), {
      title: "Published lesson",
    });
    await setDoc(doc(d, "workspaces/training/sessions/private"), {
      uid: "student",
    });
    await setDoc(doc(d, "workspaces/training/reviews/private"), {
      uid: "student",
    });
  });
  await assertSucceeds(
    getDoc(doc(db("student"), "workspaces/training/lessons/stand")),
  );
  await assertFails(
    getDoc(doc(db("stranger"), "workspaces/training/lessons/stand")),
  );
  await assertFails(
    getDoc(doc(db("student"), "workspaces/training/drafts/stand")),
  );
  await assertSucceeds(
    getDoc(doc(db("expert"), "workspaces/training/drafts/stand")),
  );
  await assertSucceeds(
    getDoc(doc(db("student"), "workspaces/training/sessions/private")),
  );
  await assertFails(
    getDoc(doc(db("stranger"), "workspaces/training/sessions/private")),
  );
  await assertSucceeds(
    getDoc(doc(db("expert"), "workspaces/training/reviews/private")),
  );
  for (const path of [
    "drafts/stand",
    "lessons/stand",
    "lessons/stand/versions/v1",
    "sessions/private",
    "reviews/private",
  ])
    await assertFails(
      setDoc(doc(db(owner), `workspaces/training/${path}`), { uid: owner }),
    );
});

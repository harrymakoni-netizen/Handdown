import { readFile } from "node:fs/promises";
import { before, after, beforeEach, test } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { ref, uploadBytes, getBytes } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-handdown",
    storage: { rules: await readFile("storage.rules", "utf8") },
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});
after(async () => await env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (c) => {
    for (const [uid, role] of [
      ["expert", "supervisor"],
      ["student", "learner"],
      ["other", "learner"],
    ])
      await setDoc(doc(c.firestore(), `workspaces/training/members/${uid}`), {
        uid,
        role,
      });
    await setDoc(doc(c.firestore(), "workspaces/training/sessions/s1"), {
      uid: "student",
    });
  });
});
const storage = (uid) => env.authenticatedContext(uid).storage();
const photo = new Uint8Array([137, 80, 78, 71]);
test("only supervisors upload immutable lesson references; members can read them", async () => {
  const path = "lesson-media/expert/reference.png";
  await assertFails(
    uploadBytes(
      ref(storage("student"), "lesson-media/student/reference.png"),
      photo,
      { contentType: "image/png" },
    ),
  );
  await assertSucceeds(
    uploadBytes(ref(storage("expert"), path), photo, {
      contentType: "image/png",
    }),
  );
  await assertFails(
    uploadBytes(ref(storage("expert"), path), photo, {
      contentType: "image/png",
    }),
  );
  await assertSucceeds(getBytes(ref(storage("student"), path)));
  await assertFails(getBytes(ref(storage("stranger"), path)));
  await assertFails(
    uploadBytes(ref(storage("expert"), "lesson-media/expert/file.txt"), photo, {
      contentType: "text/plain",
    }),
  );
});
test("review images are owned by session learner and hidden from other learners", async () => {
  const path = "review-media/student/s1/step/photo.png";
  await assertSucceeds(
    uploadBytes(ref(storage("student"), path), photo, {
      contentType: "image/png",
    }),
  );
  await assertSucceeds(getBytes(ref(storage("expert"), path)));
  await assertSucceeds(getBytes(ref(storage("student"), path)));
  await assertFails(getBytes(ref(storage("other"), path)));
  await assertFails(
    uploadBytes(
      ref(storage("other"), "review-media/other/s1/step/photo.png"),
      photo,
      { contentType: "image/png" },
    ),
  );
});

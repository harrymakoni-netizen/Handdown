import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  "Backend tests require the isolated Firestore emulator.",
);
assert.equal(
  JSON.parse(process.env.FIREBASE_CONFIG).projectId,
  "demo-handdown",
);
const requireFunctions = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const functions = await import("../functions/lib/functions/src/index.js");
const { getFirestore } = requireFunctions("firebase-admin/firestore");
const { getApps, deleteApp } = requireFunctions("firebase-admin/app");
const db = getFirestore(),
  root = db.collection("workspaces").doc("training");
const owner = "rS4BSfSY2Gdc3jw8MNfOYa4zflq1";
const invoke = (name, uid, data) =>
  functions[name].run({
    auth: uid ? { uid, token: { sub: uid } } : undefined,
    app: { appId: "emulator-fixture" },
    data,
  });
const lesson = () => ({
  id: "instruction-lesson",
  title: "Prepare your training pieces",
  description: "Instruction-only test fixture",
  variant: "kit-a",
  minutes: 1,
  steps: [
    {
      id: "prepare",
      title: "Prepare pieces",
      instruction: "Lay out the training pieces.",
      mode: "instruction",
      condition: "",
      view: "",
      correction: "",
      reference: "",
    },
  ],
});
beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-handdown/databases/(default)/documents`,
    { method: "DELETE" },
  );
  for (const [uid, role] of [
    [owner, "owner"],
    ["student", "learner"],
    ["expert", "supervisor"],
  ])
    await root.collection("members").doc(uid).set({ uid, role });
});
after(async () => {
  await Promise.all(getApps().map(deleteApp));
});
test("callable handlers reject missing membership, learner writes and draft conflicts", async () => {
  await assert.rejects(
    invoke("saveDraft", null, { lesson: lesson(), expectedRevision: 0 }),
    (e) => e.code === "unauthenticated",
  );
  await assert.rejects(
    invoke("saveDraft", "stranger", { lesson: lesson(), expectedRevision: 0 }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    invoke("saveDraft", "student", { lesson: lesson(), expectedRevision: 0 }),
    (e) => e.code === "permission-denied",
  );
  await invoke("saveDraft", owner, { lesson: lesson(), expectedRevision: 0 });
  await assert.rejects(
    invoke("saveDraft", owner, { lesson: lesson(), expectedRevision: 0 }),
    (e) => e.code === "aborted",
  );
});
test("publish creates immutable versions and session events are idempotent and owner scoped", async () => {
  await invoke("saveDraft", owner, { lesson: lesson(), expectedRevision: 0 });
  const v1 = await invoke("publishLesson", owner, {
    lessonId: "instruction-lesson",
    approved: true,
  });
  await invoke("reviseLesson", owner, {
    lessonId: "instruction-lesson",
    versionId: "v1",
  });
  const v2 = await invoke("publishLesson", owner, {
    lessonId: "instruction-lesson",
    approved: true,
  });
  assert.equal(v1.versionId, "v1");
  assert.equal(v2.versionId, "v2");
  assert.equal(
    (
      await root
        .collection("lessons")
        .doc("instruction-lesson")
        .collection("versions")
        .doc("v1")
        .get()
    ).data().manifestHash,
    v1.manifestHash,
  );
  await invoke("startSession", "student", {
    sessionId: "session-1",
    lessonId: "instruction-lesson",
    versionId: "v1",
  });
  await assert.rejects(
    invoke("finishSession", "student", { sessionId: "session-1" }),
    (e) => e.code === "failed-precondition",
  );
  const event = { id: "event-1", stepId: "prepare", type: "ACKNOWLEDGED" };
  await assert.rejects(
    invoke("ingestEvent", "expert", { sessionId: "session-1", event }),
    (e) => e.code === "permission-denied",
  );
  await invoke("ingestEvent", "student", { sessionId: "session-1", event });
  await invoke("ingestEvent", "student", { sessionId: "session-1", event });
  assert.equal(
    (
      await root
        .collection("sessions")
        .doc("session-1")
        .collection("events")
        .get()
    ).size,
    1,
  );
  await invoke("finishSession", "student", { sessionId: "session-1" });
  assert.equal(
    (await root.collection("sessions").doc("session-1").get()).data().completed,
    true,
  );
});
test("withdrawal stops new starts and queued completion; unconsented reuse is denied", async () => {
  await invoke("saveDraft", owner, { lesson: lesson(), expectedRevision: 0 });
  await invoke("publishLesson", owner, {
    lessonId: "instruction-lesson",
    approved: true,
  });
  await invoke("startSession", "student", {
    sessionId: "session-1",
    lessonId: "instruction-lesson",
    versionId: "v1",
  });
  await root
    .collection("reviews")
    .doc("case-1")
    .set({ reuse: false, status: "accepted" });
  await assert.rejects(
    invoke("reuseReview", owner, { reviewId: "case-1" }),
    (e) => e.code === "permission-denied",
  );
  await invoke("withdrawLesson", owner, { lessonId: "instruction-lesson" });
  await assert.rejects(
    invoke("startSession", "student", {
      sessionId: "session-2",
      lessonId: "instruction-lesson",
      versionId: "v1",
    }),
    (e) => e.code === "failed-precondition",
  );
  await assert.rejects(
    invoke("ingestEvent", "student", {
      sessionId: "session-1",
      event: { id: "late", stepId: "prepare", type: "ACKNOWLEDGED" },
    }),
    (e) => e.code === "failed-precondition",
  );
});
test("supervisor decisions resolve only linked active checkpoints with a required reason", async () => {
  await invoke("saveDraft", owner, { lesson: lesson(), expectedRevision: 0 });
  await invoke("publishLesson", owner, {
    lessonId: "instruction-lesson",
    approved: true,
  });
  await invoke("startSession", "student", {
    sessionId: "session-1",
    lessonId: "instruction-lesson",
    versionId: "v1",
  });
  const session = (
    await root.collection("sessions").doc("session-1").get()
  ).data();
  await root
    .collection("reviews")
    .doc("case-1")
    .set({
      sessionId: "session-1",
      stepId: "prepare",
      contentHash: session.lesson.contentHash,
      status: "pending",
    });
  await assert.rejects(
    invoke("decideReview", "student", {
      reviewId: "case-1",
      decision: "accepted",
      reason: "okay",
    }),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    invoke("decideReview", "expert", {
      reviewId: "case-1",
      decision: "accepted",
      reason: "",
    }),
    (e) => e.code === "invalid-argument",
  );
  await invoke("decideReview", "expert", {
    reviewId: "case-1",
    decision: "accepted",
    reason: "The selected step is visible.",
  });
  assert.equal(
    (await root.collection("sessions").doc("session-1").get()).data()
      .resolutions.prepare,
    "SUPERVISOR",
  );
  await assert.rejects(
    invoke("decideReview", "expert", {
      reviewId: "case-1",
      decision: "correction",
      reason: "changed",
    }),
    (e) => e.code === "failed-precondition",
  );
});
test("a later failed local observation clears an earlier client-reported pass", async () => {
  const step = {
    id: "visual",
    title: "Visual fixture",
    instruction: "Inspect fixture",
    mode: "visual",
    condition: "Fixture present",
    view: "Front",
    correction: "Correct fixture",
    reference: "lesson-media/expert/fixture.png",
  };
  const fixture = {
    ...lesson(),
    id: "visual-fixture",
    versionId: "v1",
    contentHash: "fixture",
    steps: [step],
  };
  await root
    .collection("lessons")
    .doc("visual-fixture")
    .set({ id: "visual-fixture", versionId: "v1", withdrawn: false });
  await root
    .collection("lessons")
    .doc("visual-fixture")
    .collection("versions")
    .doc("v1")
    .set(fixture);
  await invoke("startSession", "student", {
    sessionId: "session-1",
    lessonId: "visual-fixture",
    versionId: "v1",
  });
  await invoke("ingestEvent", "student", {
    sessionId: "session-1",
    event: {
      id: "pass",
      stepId: "visual",
      type: "LOCAL_CHECK",
      outcome: "PASS",
      source: "ON_DEVICE",
      durationMs: 100,
    },
  });
  assert.equal(
    (await root.collection("sessions").doc("session-1").get()).data()
      .resolutions.visual,
    "LOCAL_CHECK",
  );
  await invoke("ingestEvent", "student", {
    sessionId: "session-1",
    event: {
      id: "failure",
      stepId: "visual",
      type: "LOCAL_CHECK",
      outcome: "FAIL",
      source: "ON_DEVICE",
      durationMs: 100,
    },
  });
  assert.equal(
    (await root.collection("sessions").doc("session-1").get()).data()
      .resolutions.visual,
    undefined,
  );
  await assert.rejects(
    invoke("finishSession", "student", { sessionId: "session-1" }),
    (e) => e.code === "failed-precondition",
  );
});
test("retention task removes expired shared originals while preserving decision metadata", async () => {
  const { getStorage } = requireFunctions("firebase-admin/storage");
  const file = getStorage()
    .bucket()
    .file("review-media/student/session-1/prepare/old.png");
  await file.save(Buffer.from([137, 80, 78, 71]), { contentType: "image/png" });
  await root
    .collection("reviews")
    .doc("expired")
    .set({
      uid: "student",
      status: "accepted",
      reason: "Recorded human decision",
      path: file.name,
      note: "Original learner note",
      expiresAt: new Date(0),
    });
  await functions.purgeExpiredReviewMedia.run({});
  assert.equal((await file.exists())[0], false);
  const review = (await root.collection("reviews").doc("expired").get()).data();
  assert.equal(review.imageExpired, true);
  assert.equal(review.status, "accepted");
  assert.equal(review.note, undefined);
  assert.equal(review.path, undefined);
});

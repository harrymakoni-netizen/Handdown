import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import {
  validateLesson,
  contentOf,
  evaluateReport,
  canonicalJson,
  type Lesson,
  type Event,
  type ValidationReport,
} from "../../shared/domain.js";
initializeApp();
const db = getFirestore();
const bucket = getStorage().bucket();
const root = db.collection("workspaces").doc("training");
const options = {
  region: "africa-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  timeoutSeconds: 120,
  memory: "512MiB" as const,
};
const hash = (v: unknown) =>
  createHash("sha256").update(canonicalJson(v)).digest("hex");
const safeId = (v: unknown) => {
  if (typeof v !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(v))
    throw new HttpsError("invalid-argument", "Invalid identifier.");
  return v;
};
async function member(request: any, supervisor = false) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const m = await root.collection("members").doc(request.auth.uid).get();
  const role = m.data()?.role;
  if (
    !["owner", "supervisor", "learner"].includes(role) ||
    (supervisor && role === "learner")
  )
    throw new HttpsError(
      "permission-denied",
      "Workspace access is not permitted.",
    );
  return request.auth.uid as string;
}
function cleanLesson(v: Lesson): Lesson {
  validateLesson(v);
  return {
    id: safeId(v.id),
    title: v.title.trim(),
    description: v.description,
    variant: v.variant,
    minutes: v.minutes,
    steps: v.steps.map((s) => ({
      id: s.id,
      title: s.title,
      instruction: s.instruction,
      mode: s.mode,
      condition: s.condition,
      view: s.view,
      correction: s.correction,
      reference: s.reference,
    })),
  };
}
async function assetDigests(l: Lesson) {
  const assets: Record<string, string> = {};
  for (const s of l.steps) {
    if (!s.reference) continue;
    if (!/^lesson-media\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(s.reference))
      throw new HttpsError("invalid-argument", "Invalid reference path.");
    const [meta] = await bucket.file(s.reference).getMetadata();
    if (
      Number(meta.size) > 4 * 1024 * 1024 ||
      !["image/jpeg", "image/png"].includes(meta.contentType || "")
    )
      throw new HttpsError("invalid-argument", "Invalid reference image.");
    const [bytes] = await bucket.file(s.reference).download();
    assets[s.reference] = createHash("sha256").update(bytes).digest("hex");
  }
  return assets;
}
async function currentVersion(
  lid: string,
  vid: string,
  allowWithdrawn = false,
) {
  const header = await root.collection("lessons").doc(lid).get();
  if (header.data()?.withdrawn && !allowWithdrawn)
    throw new HttpsError(
      "failed-precondition",
      "This lesson has been withdrawn.",
    );
  const v = await root
    .collection("lessons")
    .doc(lid)
    .collection("versions")
    .doc(vid)
    .get();
  if (!v.exists || (v.data()?.withdrawn && !allowWithdrawn))
    throw new HttpsError("not-found", "Lesson version unavailable.");
  return v.data()!;
}
export const saveDraft = onCall(options, async (request) => {
  const uid = await member(request, true);
  let l: Lesson;
  try {
    l = cleanLesson(request.data.lesson);
  } catch (e) {
    throw new HttpsError(
      "invalid-argument",
      e instanceof Error ? e.message : "Invalid lesson.",
    );
  }
  const digests = await assetDigests(l);
  const contentHash = hash({ ...contentOf(l), assetDigests: digests });
  const ref = root.collection("drafts").doc(l.id);
  let revision = 0;
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if ((old.data()?.revision || 0) !== request.data.expectedRevision)
      throw new HttpsError(
        "aborted",
        "This draft changed on another device. Reload it before saving.",
      );
    revision = (old.data()?.revision || 0) + 1;
    tx.set(ref, {
      ...l,
      authorUid: old.data()?.authorUid || uid,
      sourceReviewId: old.data()?.sourceReviewId || null,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      revision,
      contentHash,
      assetDigests: digests,
    });
  });
  return { revision, contentHash };
});
export const recordValidation = onCall(options, async (request) => {
  const uid = await member(request, true);
  const id = safeId(request.data.lessonId);
  const d = await root.collection("drafts").doc(id).get();
  if (!d.exists) throw new HttpsError("not-found", "Draft missing.");
  const report = request.data.report as ValidationReport;
  if (
    !report ||
    !Array.isArray(report.cases) ||
    report.cases.length > 500 ||
    JSON.stringify(report).length > 600000
  )
    throw new HttpsError("invalid-argument", "Invalid evaluation report.");
  let gate;
  try {
    gate = evaluateReport(d.data() as Lesson, report);
  } catch {
    throw new HttpsError("invalid-argument", "Malformed evaluation evidence.");
  }
  await root
    .collection("drafts")
    .doc(id)
    .collection("validation")
    .doc("latest")
    .set({
      report,
      datasetHash: hash(
        report.cases.map(({ outcome, durationMs, ...source }) => source),
      ),
      gate,
      submittedBy: uid,
      submittedAt: FieldValue.serverTimestamp(),
      source: "client-reported-local-evaluation",
    });
  return gate;
});
export const publishLesson = onCall(options, async (request) => {
  const uid = await member(request, true);
  const id = safeId(request.data.lessonId);
  if (request.data.approved !== true)
    throw new HttpsError(
      "failed-precondition",
      "Review and explicitly approve every instruction and condition.",
    );
  const draftRef = root.collection("drafts").doc(id),
    header = root.collection("lessons").doc(id),
    validation = draftRef.collection("validation").doc("latest");
  let result: any;
  await db.runTransaction(async (tx) => {
    const [d, h, r] = await Promise.all([
      tx.get(draftRef),
      tx.get(header),
      tx.get(validation),
    ]);
    if (!d.exists) throw new HttpsError("not-found", "Draft missing.");
    const l = d.data() as Lesson;
    try {
      validateLesson(l, true);
    } catch (e) {
      throw new HttpsError("failed-precondition", String(e));
    }
    if (l.steps.some((s) => s.mode === "visual")) {
      let gate;
      try {
        gate = evaluateReport(l, r.data()?.report);
      } catch {
        throw new HttpsError(
          "failed-precondition",
          "Record real-device validation first.",
        );
      }
      if (!gate.passed)
        throw new HttpsError("failed-precondition", gate.reasons.join(" "));
    }
    const versionId = `v${(h.data()?.versionNumber || 0) + 1}`;
    const value = {
      ...cleanLesson(l),
      versionId,
      contentHash: l.contentHash,
      assetDigests: d.data()!.assetDigests,
      approvedBy: uid,
      sourceReviewId: d.data()?.sourceReviewId || null,
      approvedAt: new Date().toISOString(),
      validation: r.exists
        ? {
            report: r.data()!.report,
            datasetHash: r.data()!.datasetHash,
            source: "client-reported-local-evaluation",
            submittedBy: r.data()!.submittedBy,
          }
        : null,
      withdrawn: false,
    };
    result = { ...value, manifestHash: hash(value) };
    tx.create(header.collection("versions").doc(versionId), result);
    tx.set(header, {
      id,
      title: l.title,
      description: l.description,
      minutes: l.minutes,
      steps: l.steps.length,
      sequence: l.steps.map((s) => ({ id: s.id, title: s.title })),
      reference: l.steps.find((s) => s.reference)?.reference || "",
      versionNumber: (h.data()?.versionNumber || 0) + 1,
      versionId,
      withdrawn: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(draftRef);
    if (r.exists) tx.delete(validation);
  });
  return result;
});
export const withdrawLesson = onCall(options, async (request) => {
  await member(request, true);
  await root
    .collection("lessons")
    .doc(safeId(request.data.lessonId))
    .update({ withdrawn: true });
  return { ok: true };
});
export const reviseLesson = onCall(options, async (request) => {
  const uid = await member(request, true);
  const id = safeId(request.data.lessonId);
  const v = await currentVersion(id, safeId(request.data.versionId), true);
  const draft = cleanLesson(v as Lesson);
  await db.runTransaction(async (tx) => {
    const ref = root.collection("drafts").doc(id);
    const d = await tx.get(ref);
    if (d.exists)
      throw new HttpsError(
        "already-exists",
        "A draft already exists. Open it to continue.",
      );
    tx.create(ref, {
      ...draft,
      authorUid: uid,
      revision: 1,
      contentHash: v.contentHash,
      assetDigests: v.assetDigests,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id };
});
export const startSession = onCall(options, async (request) => {
  const uid = await member(request);
  const id = safeId(request.data.sessionId);
  const l = await currentVersion(
    safeId(request.data.lessonId),
    safeId(request.data.versionId),
  );
  const ref = root.collection("sessions").doc(id);
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (old.exists) {
      if (
        old.data()?.uid !== uid ||
        old.data()?.lesson.contentHash !== l.contentHash
      )
        throw new HttpsError("permission-denied", "Session ID conflict.");
      return;
    }
    tx.create(ref, {
      uid,
      lesson: l,
      resolutions: {},
      completed: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});
export const ingestEvent = onCall(options, async (request) => {
  const uid = await member(request);
  const sid = safeId(request.data.sessionId),
    event = request.data.event as Event;
  safeId(event.id);
  safeId(event.stepId);
  const session = root.collection("sessions").doc(sid),
    eventRef = session.collection("events").doc(event.id);
  await db.runTransaction(async (tx) => {
    const [s, old] = await Promise.all([tx.get(session), tx.get(eventRef)]);
    if (!s.exists || s.data()?.uid !== uid)
      throw new HttpsError("permission-denied", "Session unavailable.");
    if (old.exists) return;
    const data = s.data()!;
    const header = await tx.get(root.collection("lessons").doc(data.lesson.id));
    if (header.data()?.withdrawn)
      throw new HttpsError(
        "failed-precondition",
        "This lesson was withdrawn. Stop the session and ask for a replacement.",
      );
    if (data.completed)
      throw new HttpsError(
        "failed-precondition",
        "Session is already complete.",
      );
    const steps = data.lesson.steps;
    const index = steps.findIndex((x: any) => x.id === event.stepId);
    if (index < 0)
      throw new HttpsError("invalid-argument", "Checkpoint missing.");
    if (steps.slice(0, index).some((x: any) => !data.resolutions[x.id]))
      throw new HttpsError(
        "failed-precondition",
        "Resolve earlier steps first.",
      );
    const step = steps[index];
    let resolution = "";
    let value: any;
    if (event.type === "ACKNOWLEDGED" && step.mode === "instruction") {
      resolution = "ACKNOWLEDGED";
      value = { id: event.id, stepId: event.stepId, type: event.type };
    } else if (
      event.type === "LOCAL_CHECK" &&
      step.mode === "visual" &&
      event.source === "ON_DEVICE" &&
      ["PASS", "FAIL", "UNKNOWN", "ERROR"].includes(event.outcome || "") &&
      Number.isFinite(event.durationMs) &&
      event.durationMs! >= 0
    ) {
      value = {
        id: event.id,
        stepId: event.stepId,
        type: event.type,
        outcome: event.outcome,
        durationMs: event.durationMs,
        source: "ON_DEVICE",
        attestation: "client-reported",
      };
      if (event.outcome === "PASS") resolution = "LOCAL_CHECK";
    } else
      throw new HttpsError("invalid-argument", "Invalid session observation.");
    tx.create(eventRef, {
      ...value,
      uid,
      receivedAt: FieldValue.serverTimestamp(),
    });
    if (resolution)
      tx.update(session, { [`resolutions.${event.stepId}`]: resolution });
    else if (
      event.type === "LOCAL_CHECK" &&
      data.resolutions[event.stepId] === "LOCAL_CHECK"
    )
      tx.update(session, {
        [`resolutions.${event.stepId}`]: FieldValue.delete(),
      });
  });
  return { ok: true };
});
export const submitReview = onCall(options, async (request) => {
  const uid = await member(request);
  const sid = safeId(request.data.sessionId),
    stepId = safeId(request.data.stepId),
    id = safeId(request.data.id);
  const path = request.data.path;
  if (
    typeof path !== "string" ||
    !path.startsWith(`review-media/${uid}/${sid}/${stepId}/`) ||
    path.includes("..") ||
    !/^review-media\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\/[A-Za-z0-9.-]+$/.test(
      path,
    )
  )
    throw new HttpsError("invalid-argument", "Invalid shared image path.");
  if (
    typeof request.data.note !== "string" ||
    request.data.note.length > 2000 ||
    typeof request.data.reuse !== "boolean"
  )
    throw new HttpsError("invalid-argument", "Invalid sharing consent.");
  const [meta] = await bucket.file(path).getMetadata();
  if (
    Number(meta.size) > 4 * 1024 * 1024 ||
    !["image/png", "image/jpeg"].includes(meta.contentType || "")
  )
    throw new HttpsError("invalid-argument", "Invalid image.");
  const session = root.collection("sessions").doc(sid),
    caseRef = root.collection("reviews").doc(id);
  await db.runTransaction(async (tx) => {
    const [s, old] = await Promise.all([tx.get(session), tx.get(caseRef)]);
    if (!s.exists || s.data()?.uid !== uid || s.data()?.completed)
      throw new HttpsError("permission-denied", "Active session required.");
    const lesson = s.data()!.lesson;
    await currentVersion(lesson.id, lesson.versionId);
    if (!lesson.steps.some((x: any) => x.id === stepId))
      throw new HttpsError("invalid-argument", "Unknown step.");
    if (old.exists) {
      if (old.data()?.uid !== uid)
        throw new HttpsError("permission-denied", "Case ID conflict.");
      return;
    }
    tx.create(caseRef, {
      id,
      uid,
      sessionId: sid,
      stepId,
      lessonId: lesson.id,
      versionId: lesson.versionId,
      contentHash: lesson.contentHash,
      path,
      note: request.data.note,
      reuse: request.data.reuse,
      status: "pending",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});
export const decideReview = onCall(options, async (request) => {
  const uid = await member(request, true),
    id = safeId(request.data.reviewId);
  if (
    !["accepted", "correction", "another-view"].includes(
      request.data.decision,
    ) ||
    typeof request.data.reason !== "string" ||
    !request.data.reason.trim() ||
    request.data.reason.length > 2000
  )
    throw new HttpsError(
      "invalid-argument",
      "Choose a decision and provide a reason.",
    );
  await db.runTransaction(async (tx) => {
    const ref = root.collection("reviews").doc(id);
    const r = await tx.get(ref);
    if (!r.exists || r.data()?.status !== "pending")
      throw new HttpsError(
        "failed-precondition",
        "Review already decided or missing.",
      );
    const c = r.data()!,
      session = root.collection("sessions").doc(c.sessionId);
    const s = await tx.get(session);
    if (
      !s.exists ||
      s.data()?.lesson.contentHash !== c.contentHash ||
      s.data()?.completed
    )
      throw new HttpsError(
        "failed-precondition",
        "Linked session is no longer active.",
      );
    tx.update(ref, {
      status: request.data.decision,
      reason: request.data.reason.trim(),
      decidedBy: uid,
      decidedAt: FieldValue.serverTimestamp(),
    });
    if (request.data.decision === "accepted")
      tx.update(session, { [`resolutions.${c.stepId}`]: "SUPERVISOR" });
  });
  return { ok: true };
});
export const finishSession = onCall(options, async (request) => {
  const uid = await member(request);
  const ref = root.collection("sessions").doc(safeId(request.data.sessionId));
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data()?.uid !== uid)
      throw new HttpsError("permission-denied", "Session unavailable.");
    const d = s.data()!;
    const header = await tx.get(root.collection("lessons").doc(d.lesson.id));
    if (header.data()?.withdrawn)
      throw new HttpsError("failed-precondition", "This lesson was withdrawn.");
    if (d.completed) return;
    if (d.lesson.steps.some((x: any) => !d.resolutions[x.id]))
      throw new HttpsError(
        "failed-precondition",
        "Resolve every required step before completion.",
      );
    tx.update(ref, {
      completed: true,
      completedAt: FieldValue.serverTimestamp(),
      meaning:
        "Records guidance and reported checks; not certification of competence.",
    });
  });
  return { ok: true };
});
export const reuseReview = onCall(options, async (request) => {
  const uid = await member(request, true),
    id = safeId(request.data.reviewId);
  const r = await root.collection("reviews").doc(id).get();
  if (
    !r.exists ||
    r.data()?.reuse !== true ||
    r.data()?.imageExpired === true ||
    r.data()?.status === "pending"
  )
    throw new HttpsError(
      "permission-denied",
      "A decided case with explicit reuse permission is required.",
    );
  const c = r.data()!,
    v = await currentVersion(c.lessonId, c.versionId, true);
  const l = cleanLesson(v as Lesson);
  const [meta] = await bucket.file(c.path).getMetadata();
  const path = `lesson-media/${uid}/${crypto.randomUUID()}.${meta.contentType === "image/png" ? "png" : "jpg"}`;
  await bucket.file(c.path).copy(bucket.file(path));
  const step = l.steps.find((s) => s.id === c.stepId);
  if (!step) throw new HttpsError("not-found", "Checkpoint missing.");
  step.reference = path;
  const digests = await assetDigests(l),
    contentHash = hash({ ...contentOf(l), assetDigests: digests });
  await db.runTransaction(async (tx) => {
    const ref = root.collection("drafts").doc(l.id);
    const old = await tx.get(ref);
    if (old.exists)
      throw new HttpsError(
        "already-exists",
        "A draft already exists. Edit or publish it before creating another revision.",
      );
    tx.create(ref, {
      ...l,
      revision: 1,
      authorUid: uid,
      contentHash,
      assetDigests: digests,
      sourceReviewId: id,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { lessonId: l.id };
});

// Shared originals expire; approved, consented lesson references remain version assets.
export const purgeExpiredReviewMedia = onSchedule(
  // Cloud Scheduler is unavailable in Johannesburg; keep this scheduled job
  // in a supported region while callable Functions stay in africa-south1.
  { schedule: "every 24 hours", region: "europe-west1", timeoutSeconds: 540 },
  async () => {
    const expired = await root
      .collection("reviews")
      .where("expiresAt", "<=", new Date())
      .limit(200)
      .get();
    for (const item of expired.docs) {
      const c = item.data();
      if (typeof c.path === "string")
        await bucket.file(c.path).delete({ ignoreNotFound: true });
      await item.ref.update({
        imageExpired: true,
        path: FieldValue.delete(),
        note: FieldValue.delete(),
        expiresAt: FieldValue.delete(),
      });
    }
    const [videos] = await bucket.getFiles({ prefix: "authoring-media/" });
    for (const video of videos) {
      const created = Date.parse(video.metadata.timeCreated || "");
      if (
        Number.isFinite(created) &&
        Date.now() - created > 24 * 60 * 60 * 1000
      )
        await video.delete({ ignoreNotFound: true });
    }
    const [files] = await bucket.getFiles({ prefix: "review-media/" });
    for (const file of files) {
      const created = Date.parse(file.metadata.timeCreated || "");
      if (
        Number.isFinite(created) &&
        Date.now() - created > 30 * 24 * 60 * 60 * 1000
      )
        await file.delete({ ignoreNotFound: true });
    }
  },
);

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decide,
  parseObservation,
  evaluateReport,
  validateLesson,
  canonicalJson,
  resolved,
} from "../functions/lib/shared/domain.js";
const step = {
  id: "fit",
  title: "Fit support",
  instruction: "Fit the large rear support.",
  mode: "visual",
  condition: "Support is visible behind base.",
  view: "Entire base and support",
  correction: "Fit support as shown.",
  reference: "lesson-media/owner/reference.jpg",
};
const lesson = {
  id: "stand",
  title: "Display stand",
  description: "Harmless kit",
  variant: "kit-a",
  minutes: 8,
  contentHash: "hash",
  steps: [step],
};
const report = () => ({
  contentHash: "hash",
  device: "Test workstation — fixture, not a measured evaluation",
  browser: "Test browser",
  sdk: "13.4.0",
  appCommit: "a".repeat(40),
  modelVersion: "synthetic fixture, not a real device evaluation",
  profile: "current-reference-1024",
  promptRevision: "observe-1",
  recordedAt: "2026-11-20",
  cases: Array.from({ length: 40 }, (_, i) => ({
    id: `case-${i}`,
    stepId: "fit",
    expected: i < 12 ? "correct" : i < 32 ? "incorrect" : "obscured",
    outcome: i < 12 ? "PASS" : i < 32 ? "FAIL" : "UNKNOWN",
    captureGroup: `reset-${i}`,
    split: "holdout",
    labeler: "test fixture",
    imageHash: i.toString(16).padStart(64, "0"),
    durationMs: 100,
  })),
});
test("uncertain or hidden detail never passes", () => {
  assert.equal(
    decide({ view: "insufficient", condition: "met", evidence: "" }),
    "UNKNOWN",
  );
  assert.equal(
    decide({ view: "sufficient", condition: "not_visible", evidence: "" }),
    "UNKNOWN",
  );
  assert.equal(
    decide({ view: "sufficient", condition: "not_met", evidence: "" }),
    "FAIL",
  );
  assert.equal(
    decide({ view: "sufficient", condition: "met", evidence: "" }),
    "PASS",
  );
});
test("malformed, confidence-only and unexpected model outputs are rejected", () => {
  for (const text of [
    "not JSON",
    '{"confidence":0.99}',
    '{"view":"sufficient","condition":"maybe","evidence":"x"}',
  ])
    assert.throws(() => parseObservation(text));
  assert.equal(
    parseObservation(
      '```json\n{"view":"sufficient","condition":"met","evidence":"base visible"}\n```',
    ).condition,
    "met",
  );
});
test("every false approval blocks publication, even when correct acceptance is high", () => {
  const r = report();
  assert.equal(evaluateReport(lesson, r).passed, true);
  r.cases[20].outcome = "PASS";
  assert.equal(evaluateReport(lesson, r).passed, false);
  r.cases[20].outcome = "FAIL";
  r.cases[35].outcome = "PASS";
  assert.equal(evaluateReport(lesson, r).passed, false);
});
test("all-unknown, missing counts, stale prompts and duplicated evidence cannot qualify", () => {
  const r = report();
  r.cases.forEach((c) => (c.outcome = "UNKNOWN"));
  assert.equal(evaluateReport(lesson, r).passed, false);
  for (const mutate of [
    (r) => r.cases.pop(),
    (r) => (r.promptRevision = "changed"),
    (r) => (r.cases[1].imageHash = r.cases[0].imageHash),
    (r) => (r.cases[1].captureGroup = r.cases[0].captureGroup),
    (r) => (r.contentHash = "old"),
  ]) {
    const r = report();
    mutate(r);
    assert.equal(evaluateReport(lesson, r).passed, false);
  }
});
test("development contamination and regression false approvals block publication", () => {
  const r = report();
  r.cases.push({
    ...r.cases[0],
    id: "development",
    imageHash: "a".repeat(64),
    split: "development",
  });
  assert.equal(evaluateReport(lesson, r).passed, false);
  const g = report();
  g.cases.push({
    ...g.cases[20],
    id: "regression",
    imageHash: "b".repeat(64),
    captureGroup: "regression",
    split: "regression",
    outcome: "PASS",
  });
  assert.equal(evaluateReport(lesson, g).passed, false);
});
test("lesson validation requires references for visual publication and bounds the procedure", () => {
  assert.doesNotThrow(() => validateLesson(lesson, true));
  assert.throws(() =>
    validateLesson({ ...lesson, steps: [{ ...step, reference: "" }] }, true),
  );
  assert.throws(() =>
    validateLesson(
      {
        ...lesson,
        steps: Array.from({ length: 6 }, (_, i) => ({ ...step, id: `s${i}` })),
      },
      true,
    ),
  );
});
test("canonical manifest serialization is independent of Firestore field order", () => {
  assert.equal(
    canonicalJson({ b: 2, a: { z: 1, y: [2, 3] } }),
    canonicalJson({ a: { y: [2, 3], z: 1 }, b: 2 }),
  );
});
test("learner acknowledgement cannot resolve a visual checkpoint", () => {
  assert.equal(resolved({ resolutions: { fit: "ACKNOWLEDGED" } }, step), false);
  assert.equal(resolved({ resolutions: { fit: "SUPERVISOR" } }, step), true);
  assert.equal(resolved({ resolutions: { fit: "LOCAL_CHECK" } }, step), true);
});

test("video uploads support ten minutes and 100 MiB with a bounded inline route", async () => {
  const {
    videoMime,
    validateVideoDuration,
    videoTransport,
    MAX_VIDEO_BYTES,
    INLINE_VIDEO_BYTES,
  } = await import("../functions/lib/shared/video.js");
  assert.equal(
    videoMime({ name: "demo.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES }),
    "video/mp4",
  );
  assert.equal(
    videoMime({ name: "ipad.mov", type: "", size: 20 * 1024 * 1024 }),
    "video/quicktime",
  );
  assert.doesNotThrow(() => validateVideoDuration(600));
  assert.doesNotThrow(() => validateVideoDuration(180));
  assert.throws(() => validateVideoDuration(601));
  assert.throws(() => validateVideoDuration(Infinity));
  assert.throws(() =>
    videoMime({
      name: "large.mp4",
      type: "video/mp4",
      size: MAX_VIDEO_BYTES + 1,
    }),
  );
  assert.throws(() =>
    videoMime({ name: "bad.txt", type: "text/plain", size: 100 }),
  );
  assert.equal(videoTransport(INLINE_VIDEO_BYTES), "inline");
  assert.equal(videoTransport(INLINE_VIDEO_BYTES + 1), "storage");
});

export const PROMPT_REVISION = "observe-1";
export const POLICY_REVISION = "policy-1";
export const PROFILE = "current-reference-1024";
export type Outcome = "PASS" | "FAIL" | "UNKNOWN" | "ERROR";
export type Step = {
  id: string;
  title: string;
  instruction: string;
  mode: "instruction" | "visual";
  condition: string;
  view: string;
  correction: string;
  reference: string;
};
export type Lesson = {
  id: string;
  title: string;
  description: string;
  variant: string;
  minutes: number;
  steps: Step[];
  authorUid?: string;
  versionId?: string;
  contentHash?: string;
  withdrawn?: boolean;
  source?: string;
  validation?: ValidationReport;
};
export type Observation = {
  view: "sufficient" | "insufficient";
  condition: "met" | "not_met" | "not_visible";
  evidence: string;
};
export type CheckResult = {
  outcome: Outcome;
  message: string;
  durationMs: number;
  source: "ON_DEVICE";
  promptRevision: string;
  profile: string;
};
export type EvaluationCase = {
  id: string;
  stepId: string;
  expected: "correct" | "incorrect" | "obscured";
  captureGroup: string;
  split: "development" | "holdout" | "regression";
  labeler: string;
  imageHash: string;
  outcome: Outcome;
  durationMs: number;
};
export type ValidationReport = {
  contentHash: string;
  device: string;
  browser: string;
  sdk: string;
  appCommit: string;
  modelVersion: string;
  profile: string;
  promptRevision: string;
  cases: EvaluationCase[];
  recordedAt: string;
};
export type Event = {
  id: string;
  stepId: string;
  type: "LOCAL_CHECK" | "ACKNOWLEDGED";
  outcome?: Outcome;
  durationMs?: number;
  source?: "ON_DEVICE";
};
export type Session = {
  id: string;
  uid: string;
  lesson: Lesson;
  index: number;
  events: Event[];
  resolutions: Record<string, "LOCAL_CHECK" | "ACKNOWLEDGED" | "SUPERVISOR">;
  completed: boolean;
  createdAt: string;
  serverStarted: boolean;
  synced: boolean;
};
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function validateLesson(value: unknown, forPublish = false): Lesson {
  const v = value as Lesson;
  assert(v && typeof v === "object", "Invalid lesson");
  assert(
    typeof v.title === "string" &&
      v.title.trim().length > 2 &&
      v.title.length <= 160,
    "Enter a lesson title (3–160 characters).",
  );
  assert(
    typeof v.description === "string" && v.description.length <= 2000,
    "Description is too long.",
  );
  assert(
    typeof v.variant === "string" &&
      v.variant.length > 0 &&
      v.variant.length <= 100,
    "Specify the allowed training kit.",
  );
  assert(
    Number.isFinite(v.minutes) && v.minutes > 0 && v.minutes <= 120,
    "Duration must be between 1 and 120 minutes.",
  );
  assert(
    Array.isArray(v.steps) && v.steps.length > 0 && v.steps.length <= 5,
    "A lesson needs 1–5 steps.",
  );
  assert(
    v.steps.filter((s) => s.mode === "visual").length <= 3,
    "Use at most three visual checkpoints.",
  );
  assert(
    v.steps.filter((s) => s.mode === "instruction").length <= 2,
    "Use at most two instruction-only steps.",
  );
  const ids = new Set<string>();
  for (const s of v.steps) {
    assert(s && typeof s === "object", "Invalid step");
    assert(
      typeof s.id === "string" &&
        /^[a-zA-Z0-9-]{1,80}$/.test(s.id) &&
        !ids.has(s.id),
      "Step IDs must be unique.",
    );
    ids.add(s.id);
    assert(
      s.mode === "instruction" || s.mode === "visual",
      "Invalid step mode",
    );
    for (const field of [
      "title",
      "instruction",
      "condition",
      "view",
      "correction",
      "reference",
    ] as const)
      assert(
        typeof s[field] === "string" && s[field].length <= 3000,
        `Invalid step ${field}`,
      );
    assert(
      s.title.trim() && s.instruction.trim(),
      "Each step needs a title and instruction.",
    );
    if (s.mode === "visual") {
      assert(
        s.condition.trim() && s.view.trim() && s.correction.trim(),
        "Visual checks need an observable condition, view and correction.",
      );
      if (forPublish)
        assert(
          /^lesson-media\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(s.reference),
          "Each visual checkpoint needs an uploaded reference image.",
        );
    }
  }
  return v;
}
export function parseObservation(text: string): Observation {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  const v = JSON.parse(clean);
  assert(
    v &&
      ["sufficient", "insufficient"].includes(v.view) &&
      ["met", "not_met", "not_visible"].includes(v.condition) &&
      typeof v.evidence === "string" &&
      v.evidence.length <= 1000,
    "The local model returned invalid structured output.",
  );
  return v;
}
export function decide(v: Observation): Outcome {
  return v.view === "insufficient" || v.condition === "not_visible"
    ? "UNKNOWN"
    : v.condition === "not_met"
      ? "FAIL"
      : "PASS";
}
export function contentOf(l: Lesson) {
  return {
    title: l.title,
    description: l.description,
    variant: l.variant,
    minutes: l.minutes,
    steps: l.steps,
    promptRevision: PROMPT_REVISION,
    policyRevision: POLICY_REVISION,
    profile: PROFILE,
  };
}
export function evaluateReport(
  lesson: Lesson,
  report: ValidationReport,
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (
    !report ||
    report.contentHash !== lesson.contentHash ||
    report.profile !== PROFILE ||
    report.promptRevision !== PROMPT_REVISION ||
    report.sdk !== "13.4.0" ||
    !/^[a-f0-9]{40}$/.test(report.appCommit || "") ||
    !report.modelVersion?.trim() ||
    !report.device.trim() ||
    !report.browser.trim()
  )
    return {
      passed: false,
      reasons: [
        "Evaluation must match the current lesson, prompt, SDK and device profile.",
      ],
    };
  const ids = new Set<string>(),
    hashes = new Set<string>();
  for (const c of report.cases) {
    if (ids.has(c.id) || hashes.has(c.imageHash))
      reasons.push("Duplicate evaluation case or image.");
    ids.add(c.id);
    hashes.add(c.imageHash);
    if (
      !c.labeler.trim() ||
      !c.captureGroup.trim() ||
      !/^[a-f0-9]{64}$/.test(c.imageHash) ||
      !["PASS", "FAIL", "UNKNOWN", "ERROR"].includes(c.outcome) ||
      !["correct", "incorrect", "obscured"].includes(c.expected) ||
      !["development", "holdout", "regression"].includes(c.split) ||
      !Number.isFinite(c.durationMs) ||
      c.durationMs < 0
    )
      reasons.push("Invalid evaluation evidence.");
  }
  const holdoutGroups = new Set(
    report.cases
      .filter((c) => c.split === "holdout")
      .map((c) => c.captureGroup),
  );
  if (
    report.cases.some(
      (c) => c.split !== "holdout" && holdoutGroups.has(c.captureGroup),
    )
  )
    reasons.push(
      "Holdout capture groups overlap development or regression cases.",
    );
  for (const s of lesson.steps.filter((s) => s.mode === "visual")) {
    const cs = report.cases.filter(
      (c) => c.stepId === s.id && c.split === "holdout",
    );
    const group = (label: string) => cs.filter((c) => c.expected === label);
    if (new Set(cs.map((c) => c.captureGroup)).size !== cs.length)
      reasons.push(
        `${s.title}: use a separate assembly reset for every holdout image.`,
      );
    if (
      group("correct").length !== 12 ||
      group("incorrect").length !== 20 ||
      group("obscured").length !== 8
    )
      reasons.push(
        `${s.title}: needs 12 correct, 20 incorrect and 8 obscured fresh holdout cases.`,
      );
    if (group("correct").filter((c) => c.outcome === "PASS").length < 10)
      reasons.push(`${s.title}: fewer than 10 correct assemblies accepted.`);
    if (cs.some((c) => c.expected !== "correct" && c.outcome === "PASS"))
      reasons.push(`${s.title}: false approval blocks publication.`);
    if (
      report.cases.some(
        (c) =>
          c.stepId === s.id &&
          c.split === "regression" &&
          c.expected !== "correct" &&
          c.outcome === "PASS",
      )
    )
      reasons.push(`${s.title}: regression false approval blocks publication.`);
  }
  return { passed: reasons.length === 0, reasons };
}
export function resolved(session: Session, step: Step) {
  return step.mode === "instruction"
    ? session.resolutions[step.id] === "ACKNOWLEDGED" ||
        session.resolutions[step.id] === "SUPERVISOR"
    : session.resolutions[step.id] === "LOCAL_CHECK" ||
        session.resolutions[step.id] === "SUPERVISOR";
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  return (
    "{" +
    Object.keys(value as object)
      .filter((k) => (value as any)[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonicalJson((value as any)[k]))
      .join(",") +
    "}"
  );
}

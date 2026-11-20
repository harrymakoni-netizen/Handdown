import React, { useEffect, useState, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../firebase/workspace";
import { call, problem, uploadImage, fetchImage } from "../firebase/api";
import { draftFromVideo } from "../ai/cloudAuthor";
import { prepareLocal, checkLocal } from "../ai/localVerifier";
import { digest } from "../offline/store";
import {
  validateLesson,
  evaluateReport,
  PROFILE,
  PROMPT_REVISION,
  type Lesson,
  type Step,
  type EvaluationCase,
  type ValidationReport,
} from "../../shared/domain";
import { Reference } from "./Reference";
const blankStep = (): Step => ({
  id: crypto.randomUUID(),
  title: "New step",
  instruction: "",
  mode: "instruction",
  condition: "",
  view: "Show the entire assembly.",
  correction: "Compare your work with the reference.",
  reference: "",
});
const blank = (): Lesson => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
  variant: "training-kit-a",
  minutes: 8,
  steps: [blankStep()],
});
export function Editor({
  id,
  onClose,
  onPublished,
}: {
  id?: string;
  onClose: () => void;
  onPublished: () => void;
}) {
  const [lesson, setLesson] = useState<Lesson>(blank),
    [revision, setRevision] = useState(0),
    [hash, setHash] = useState(""),
    [active, setActive] = useState(0),
    [video, setVideo] = useState<File | null>(null),
    [videoUrl, setVideoUrl] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [loaded, setLoaded] = useState(!id),
    [dirty, setDirty] = useState(false),
    [approved, setApproved] = useState(false),
    [validation, setValidation] = useState(false);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, "workspaces", "training", "drafts", id),
      (s) => {
        if (s.exists() && !loaded) {
          setLesson(s.data() as Lesson);
          setRevision(s.data().revision);
          setHash(s.data().contentHash);
          setLoaded(true);
        }
      },
      (e) => setMessage(problem(e)),
    );
  }, [id, loaded]);
  useEffect(() => {
    if (!video) {
      setVideoUrl("");
      return;
    }
    const url = URL.createObjectURL(video);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);
  const edit = (patch: Partial<Lesson>) => {
    setLesson((l) => ({ ...l, ...patch }));
    setDirty(true);
    setApproved(false);
  };
  const editStep = (patch: Partial<Step>) =>
    edit({
      steps: lesson.steps.map((s, i) =>
        i === active ? { ...s, ...patch } : s,
      ),
    });
  async function save() {
    validateLesson(lesson);
    const data = await call<{ revision: number; contentHash: string }>(
      "saveDraft",
      { lesson, expectedRevision: revision },
    );
    setRevision(data.revision);
    setHash(data.contentHash);
    setDirty(false);
    setMessage("Draft saved to the workspace.");
    return { ...lesson, contentHash: data.contentHash };
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(problem(e));
    } finally {
      setBusy(false);
    }
  }
  if (!loaded)
    return (
      <section className="panel">
        <h2>Opening draft…</h2>
        <p role="status">{message || "Loading workspace draft."}</p>
        <button onClick={onClose}>Back to lessons</button>
      </section>
    );
  if (validation)
    return (
      <Validation
        lesson={{ ...lesson, contentHash: hash }}
        onClose={() => setValidation(false)}
      />
    );
  const step = lesson.steps[active];
  return (
    <section className="editor-page">
      <div className="section-title">
        <div>
          <h2>{revision ? "Edit lesson draft" : "Create a lesson"}</h2>
          <p className="muted">
            Review every instruction and observable condition before
            publication.
          </p>
        </div>
        <button
          onClick={() => {
            if (
              !dirty ||
              confirm("Leave this editor? Unsaved edits will be lost.")
            )
              onClose();
          }}
          disabled={busy}
        >
          Back to lessons
        </button>
      </div>
      <div className="editor-grid">
        <section className="panel">
          <h3>Expert demonstration</h3>
          <label>
            Lesson title
            <input
              required
              value={lesson.title}
              onChange={(e) => edit({ title: e.target.value })}
            />
          </label>
          <label>
            Task and boundaries
            <textarea
              value={lesson.description}
              onChange={(e) => edit({ description: e.target.value })}
            />
          </label>
          <label>
            Allowed training kit
            <input
              value={lesson.variant}
              onChange={(e) => edit({ variant: e.target.value })}
            />
          </label>
          <label>
            Expected minutes
            <input
              type="number"
              min="1"
              max="120"
              value={lesson.minutes}
              onChange={(e) => edit({ minutes: Number(e.target.value) })}
            />
          </label>
          <label>
            Demonstration video · MP4/MOV/WebM, 10 minutes, 100 MiB
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mov"
              disabled={busy}
              onChange={(e) => setVideo(e.target.files?.[0] || null)}
            />
          </label>
          {videoUrl && (
            <video id="source-demonstration" src={videoUrl} controls />
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Send this selected video to cloud Gemini; files over 12 MiB upload
            privately for Agent Platform processing
          </label>
          <button
            disabled={busy || !video || !consent || !lesson.title.trim()}
            onClick={() =>
              action(async () => {
                const next = await draftFromVideo(
                  video!,
                  lesson.title,
                  consent,
                  setMessage,
                );
                edit({ ...next, id: lesson.id });
                setActive(0);
                setMessage(
                  "Cloud draft generated. Review and correct every step; no references or checks are automatically approved.",
                );
              })
            }
          >
            {busy ? "Working…" : "Generate draft from video"}
          </button>
          <p className="muted">
            The source video stays in this tab until you confirm cloud
            processing. Files over 12 MiB require Agent Platform Gemini API
            enabled in Firebase AI Logic. Larger files upload privately and are
            deleted after the request when possible. The cleanup job removes
            abandoned originals older than 24 hours. Failed requests are never
            automatically resent.
          </p>
        </section>
        <section className="panel">
          <h3>Step sequence</h3>
          <div className="step-tabs">
            {lesson.steps.map((s, i) => (
              <button
                key={s.id}
                className={active === i ? "primary" : ""}
                onClick={() => setActive(i)}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={lesson.steps.length >= 5 || busy}
              onClick={() => {
                edit({ steps: [...lesson.steps, blankStep()] });
                setActive(lesson.steps.length);
              }}
            >
              + Step
            </button>
          </div>
          <label>
            Step title
            <input
              value={step.title}
              onChange={(e) => editStep({ title: e.target.value })}
            />
          </label>
          <label>
            Instruction
            <textarea
              value={step.instruction}
              onChange={(e) => editStep({ instruction: e.target.value })}
            />
          </label>
          <label>
            Checkpoint type
            <select
              value={step.mode}
              onChange={(e) =>
                editStep({ mode: e.target.value as Step["mode"] })
              }
            >
              <option value="instruction">Learner acknowledgement</option>
              <option value="visual">Local visual check</option>
            </select>
          </label>
          {step.mode === "visual" && (
            <>
              <label>
                One visible condition
                <textarea
                  value={step.condition}
                  onChange={(e) => editStep({ condition: e.target.value })}
                />
              </label>
              <label>
                Required camera view
                <input
                  value={step.view}
                  onChange={(e) => editStep({ view: e.target.value })}
                />
              </label>
              <label>
                Approved correction
                <textarea
                  value={step.correction}
                  onChange={(e) => editStep({ correction: e.target.value })}
                />
              </label>
            </>
          )}
          {videoUrl && (
            <button
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const video = document.getElementById(
                    "source-demonstration",
                  ) as HTMLVideoElement;
                  if (!video.videoWidth)
                    throw new Error(
                      "Wait for the demonstration to load, then pause at the required frame.",
                    );
                  const canvas = document.createElement("canvas");
                  const scale = Math.min(
                    1,
                    1024 / Math.max(video.videoWidth, video.videoHeight),
                  );
                  canvas.width = Math.round(video.videoWidth * scale);
                  canvas.height = Math.round(video.videoHeight * scale);
                  canvas
                    .getContext("2d")!
                    .drawImage(video, 0, 0, canvas.width, canvas.height);
                  const blob = await new Promise<Blob>((resolve, reject) =>
                    canvas.toBlob(
                      (b) =>
                        b
                          ? resolve(b)
                          : reject(
                              new Error("Cannot capture the selected frame."),
                            ),
                      "image/jpeg",
                      0.9,
                    ),
                  );
                  const path = `lesson-media/${auth.currentUser!.uid}/${crypto.randomUUID()}.jpg`;
                  await uploadImage(path, blob);
                  editStep({ reference: path });
                  setMessage(
                    "The selected video frame is now this step’s reference. Review it before validation.",
                  );
                })
              }
            >
              Use paused demonstration frame as reference
            </button>
          )}
          <label>
            Reference photograph · PNG/JPEG, up to 4 MiB
            <input
              type="file"
              accept="image/jpeg,image/png"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  action(async () => {
                    const path = `lesson-media/${auth.currentUser!.uid}/${crypto.randomUUID()}.${f.type === "image/png" ? "png" : "jpg"}`;
                    await uploadImage(path, f);
                    editStep({ reference: path });
                    setMessage("Reference uploaded to the private workspace.");
                  });
              }}
            />
          </label>
          {step.reference && (
            <Reference
              path={step.reference}
              alt="Supervisor-selected reference"
            />
          )}
          <button
            disabled={busy || lesson.steps.length === 1}
            onClick={() => {
              edit({ steps: lesson.steps.filter((_, i) => i !== active) });
              setActive(Math.max(0, active - 1));
            }}
          >
            Remove step
          </button>
        </section>
      </div>
      <section className="panel publish-controls">
        <div role="status" className="notice-box">
          {message ||
            "Save your draft before validation. Visual publication requires real-device holdout evidence for each checkpoint."}
        </div>
        <div className="action-row">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await save();
              })
            }
          >
            {busy ? "Working…" : "Save draft"}
          </button>
          <button
            disabled={busy || dirty || !revision}
            onClick={() => setValidation(true)}
          >
            Validate visual checks
          </button>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />
          I reviewed every instruction, reference, condition and task boundary.
        </label>
        <button
          disabled={busy || !approved || dirty || !revision}
          onClick={() =>
            action(async () => {
              await call("publishLesson", {
                lessonId: lesson.id,
                approved: true,
              });
              onPublished();
            })
          }
        >
          Publish approved version
        </button>
      </section>
    </section>
  );
}
function Validation({
  lesson,
  onClose,
}: {
  lesson: Lesson;
  onClose: () => void;
}) {
  type Item = {
    id: string;
    stepId: string;
    expected: "correct" | "incorrect" | "obscured";
    captureGroup: string;
    split: "development" | "holdout" | "regression";
    labeler: string;
    file: File;
    result?: EvaluationCase;
  };
  const cancelled = useRef(false);
  const [items, setItems] = useState<Item[]>([]),
    [stepId, setStepId] = useState(
      lesson.steps.find((s) => s.mode === "visual")?.id || "",
    ),
    [device, setDevice] = useState(""),
    [browser, setBrowser] = useState(navigator.userAgent),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [frozen, setFrozen] = useState(false);
  const report = (): ValidationReport => ({
    contentHash: lesson.contentHash!,
    device,
    browser,
    sdk: "13.4.0",
    appCommit: __APP_COMMIT__,
    modelVersion:
      "Browser-managed local model; version not exposed to this application",
    profile: PROFILE,
    promptRevision: PROMPT_REVISION,
    cases: items.flatMap((i) => (i.result ? [i.result] : [])),
    recordedAt: new Date().toISOString(),
  });
  const gate = evaluateReport(lesson, report());
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Real-device checkpoint validation</h2>
        <button onClick={onClose} disabled={busy}>
          Back to editor
        </button>
      </div>
      <p>
        For each checkpoint, label 40 fresh holdout images before inference: 12
        correct, 20 incorrect and 8 obscured. At least 10 correct must pass; no
        incorrect or obscured example may pass. Keep development and regression
        captures separate. Record Gate A screening first, then fresh Gate B
        holdouts. Publication records are client-reported evaluation evidence,
        not independent certification.
      </p>
      <label>
        Device hardware and operating system
        <input
          value={device}
          disabled={frozen || busy}
          onChange={(e) => setDevice(e.target.value)}
        />
      </label>
      <label>
        Chrome version / browser profile
        <input
          value={browser}
          disabled={frozen || busy}
          onChange={(e) => setBrowser(e.target.value)}
        />
      </label>
      <label>
        Checkpoint
        <select
          value={stepId}
          disabled={busy}
          onChange={(e) => setStepId(e.target.value)}
        >
          {lesson.steps
            .filter((s) => s.mode === "visual")
            .map((s) => (
              <option value={s.id} key={s.id}>
                {s.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        Add labelled dataset photographs
        <input
          type="file"
          accept="image/jpeg,image/png"
          multiple
          disabled={frozen || busy || !stepId}
          onChange={(e) =>
            setItems((v) => [
              ...v,
              ...Array.from(e.target.files || []).map((file) => ({
                id: crypto.randomUUID(),
                stepId,
                expected: "incorrect" as const,
                captureGroup: "",
                split: "holdout" as const,
                labeler: "",
                file,
              })),
            ])
          }
        />
      </label>
      <div className="evaluation-list">
        {items.map((item, i) => (
          <div className="evaluation-row" key={item.id}>
            <strong>{item.file.name}</strong>
            <label>
              Label
              <select
                disabled={frozen || busy}
                value={item.expected}
                onChange={(e) =>
                  setItems((v) =>
                    v.map((x, j) =>
                      i === j
                        ? { ...x, expected: e.target.value as Item["expected"] }
                        : x,
                    ),
                  )
                }
              >
                <option value="correct">Correct</option>
                <option value="incorrect">Incorrect</option>
                <option value="obscured">Obscured</option>
              </select>
            </label>
            <label>
              Split
              <select
                disabled={frozen || busy}
                value={item.split}
                onChange={(e) =>
                  setItems((v) =>
                    v.map((x, j) =>
                      i === j
                        ? { ...x, split: e.target.value as Item["split"] }
                        : x,
                    ),
                  )
                }
              >
                <option value="holdout">Fresh holdout</option>
                <option value="development">Development</option>
                <option value="regression">Regression</option>
              </select>
            </label>
            <label>
              Capture group
              <input
                disabled={frozen || busy}
                value={item.captureGroup}
                onChange={(e) =>
                  setItems((v) =>
                    v.map((x, j) =>
                      i === j ? { ...x, captureGroup: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Labeler
              <input
                disabled={frozen || busy}
                value={item.labeler}
                onChange={(e) =>
                  setItems((v) =>
                    v.map((x, j) =>
                      i === j ? { ...x, labeler: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <span>{item.result?.outcome || "Not run"}</span>
          </div>
        ))}
      </div>
      <div className="evaluation-metrics">
        <h3>Measured outcomes in this dataset</h3>
        {lesson.steps
          .filter((s) => s.mode === "visual")
          .map((s) => {
            const cases = items
              .flatMap((i) => (i.result && i.stepId === s.id ? [i.result] : []))
              .filter((c) => c.split === "holdout");
            const count = (label: string) =>
              cases.filter((c) => c.expected === label);
            const timings = cases
              .map((c) => c.durationMs)
              .sort((a, b) => a - b);
            return (
              <div key={s.id}>
                <h4>{s.title}</h4>
                <p>
                  Correct accepted:{" "}
                  {count("correct").filter((c) => c.outcome === "PASS").length}/
                  {count("correct").length} · Incorrect approved:{" "}
                  {
                    count("incorrect").filter((c) => c.outcome === "PASS")
                      .length
                  }
                  /{count("incorrect").length} · Obscured approved:{" "}
                  {count("obscured").filter((c) => c.outcome === "PASS").length}
                  /{count("obscured").length}
                </p>
                <p>
                  Unknown: {cases.filter((c) => c.outcome === "UNKNOWN").length}
                  /{cases.length} · Errors/timeouts:{" "}
                  {cases.filter((c) => c.outcome === "ERROR").length}/
                  {cases.length} · Median:{" "}
                  {timings.length
                    ? timings[Math.floor(timings.length / 2)] + " ms"
                    : "Not measured"}{" "}
                  · p95:{" "}
                  {timings.length
                    ? timings[Math.ceil(timings.length * 0.95) - 1] + " ms"
                    : "Not measured"}
                </p>
              </div>
            );
          })}
      </div>
      <div className="action-row">
        <button
          className="primary"
          disabled={
            busy ||
            (frozen && items.every((i) => i.result)) ||
            !device.trim() ||
            !browser.trim() ||
            !items.length ||
            items.some((i) => !i.captureGroup.trim() || !i.labeler.trim())
          }
          onClick={async () => {
            setBusy(true);
            cancelled.current = false;
            setMessage("Preparing local model…");
            try {
              await prepareLocal((p) =>
                setMessage(`Model preparation ${Math.round(p * 100)}%`),
              );
              setFrozen(true);
              const results = [...items];
              for (let i = 0; i < results.length; i++) {
                if (cancelled.current) break;
                if (results[i].result) continue;
                const item = results[i],
                  step = lesson.steps.find((s) => s.id === item.stepId)!;
                setMessage(`Checking ${i + 1} of ${results.length} locally`);
                const reference = await fetchImage(step.reference),
                  r = await checkLocal(step, item.file, reference);
                item.result = {
                  id: item.id,
                  stepId: item.stepId,
                  expected: item.expected,
                  captureGroup: item.captureGroup,
                  split: item.split,
                  labeler: item.labeler,
                  imageHash: await digest(item.file),
                  outcome: r.outcome,
                  durationMs: r.durationMs,
                };
                setItems([...results]);
              }
              setMessage(
                "Local evaluation finished. Review every outcome, then save the report.",
              );
            } catch (e) {
              setMessage(problem(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {frozen ? "Run remaining local cases" : "Freeze labels & run locally"}
        </button>
        {busy && (
          <button
            onClick={() => {
              cancelled.current = true;
              setMessage("Stopping after the current local request…");
            }}
          >
            Stop after current check
          </button>
        )}
        <button
          disabled={busy || !frozen}
          onClick={async () => {
            setBusy(true);
            try {
              const g = await call<any>("recordValidation", {
                lessonId: lesson.id,
                report: report(),
              });
              setMessage(
                g.passed
                  ? "Validation gate passed. Return to the editor to approve and publish."
                  : g.reasons.join(" "),
              );
            } catch (e) {
              setMessage(problem(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save evaluation report
        </button>
        <button
          disabled={busy}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(report(), null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "handdown-evaluation.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export evidence
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setItems([]);
            setFrozen(false);
          }}
        >
          Start a fresh dataset
        </button>
      </div>
      <p role="status">{message}</p>
      <div className="notice-box">
        {gate.passed
          ? "Current report meets the publication gate."
          : gate.reasons.join(" ")}
      </div>
    </section>
  );
}

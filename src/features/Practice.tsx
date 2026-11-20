import React, { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import type { Lesson, Session, CheckResult } from "../../shared/domain";
import { resolved } from "../../shared/domain";
import { auth, db } from "../firebase/workspace";
import { problem } from "../firebase/api";
import {
  local,
  getPackage,
  storeSession,
  queue,
  addEvent,
  syncOutbox,
} from "../offline/store";
import { checkLocal, prepareLocal } from "../ai/localVerifier";
import { Modal } from "./Modal";
import { Reference } from "./Reference";
export function Practice({
  initial,
  onClose,
}: {
  initial: Session;
  onClose: () => void;
}) {
  const [session, setSession] = useState(initial),
    [assets, setAssets] = useState<Record<string, Blob>>({}),
    [photo, setPhoto] = useState<Blob>(),
    [result, setResult] = useState<CheckResult>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [sharing, setSharing] = useState(false),
    [note, setNote] = useState(""),
    [reuse, setReuse] = useState(false),
    [modelReady, setModelReady] = useState(false),
    [summary, setSummary] = useState(initial.completed),
    [withdrawn, setWithdrawn] = useState(false);
  const alive = useRef(true);
  const step = session.lesson.steps[session.index];
  useEffect(() => {
    alive.current = true;
    getPackage(session.uid, session.lesson).then((p) => {
      if (alive.current) setAssets(p?.assets || {});
    });
    return () => {
      alive.current = false;
    };
  }, [session.uid, session.lesson]);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "workspaces", "training", "lessons", session.lesson.id),
        (s) => {
          if (s.metadata.fromCache) return;
          if (s.data()?.withdrawn) setWithdrawn(true);
        },
        () => {},
      ),
    [session.lesson.id],
  );
  useEffect(
    () =>
      onSnapshot(
        doc(db, "workspaces", "training", "sessions", session.id),
        (s) => {
          if (!s.exists() || s.metadata.fromCache) return;
          setSession((current) => {
            const next = {
              ...current,
              resolutions: { ...current.resolutions, ...s.data().resolutions },
              serverStarted: true,
              synced: s.data().completed === true,
            };
            void storeSession(next);
            return next;
          });
        },
        () => {},
      ),
    [session.id],
  );
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) setMessage(problem(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function advance() {
    if (!resolved(session, step)) return;
    const next = {
      ...session,
      index: Math.min(session.index + 1, session.lesson.steps.length - 1),
    };
    if (session.index === session.lesson.steps.length - 1) {
      next.completed = true;
      await queue(
        "finishSession",
        { sessionId: session.id },
        undefined,
        undefined,
        session.uid,
      );
      setSummary(true);
    }
    await storeSession(next);
    setSession(next);
    setPhoto(undefined);
    setResult(undefined);
    void syncOutbox();
  }
  if (summary)
    return (
      <section className="panel">
        <h2>Your practice record</h2>
        <p>
          {session.lesson.title} · {session.lesson.versionId}
        </p>
        <ul className="summary-list">
          {session.lesson.steps.map((s) => (
            <li key={s.id}>
              <span>{s.title}</span>
              <strong>
                {session.resolutions[s.id] === "LOCAL_CHECK"
                  ? "Local visual check (client-reported)"
                  : session.resolutions[s.id] === "SUPERVISOR"
                    ? "Supervisor reviewed"
                    : session.resolutions[s.id] === "ACKNOWLEDGED"
                      ? "Learner acknowledged"
                      : "Unresolved"}
              </strong>
            </li>
          ))}
        </ul>
        <div className="notice-box">
          {session.synced
            ? "Completion record synchronised."
            : "Saved on this device; completion synchronisation is pending. Keep the outbox until it is acknowledged."}{" "}
          This records the lesson followed and checks attempted. It is not a
          certification of competence or proof that every physical action
          occurred.
        </div>
        <button className="primary" onClick={onClose}>
          Back to lessons
        </button>
      </section>
    );
  return (
    <section className="panel practice-page">
      <div className="section-title">
        <div>
          <h2>{session.lesson.title}</h2>
          <p className="muted">
            {session.lesson.versionId} · Session stays pinned to this version
          </p>
        </div>
        <button onClick={onClose} disabled={busy}>
          Save & exit
        </button>
      </div>
      {withdrawn && (
        <div role="alert" className="notice-box">
          This lesson was withdrawn. Stop this session and ask your supervisor
          for a replacement version.
        </div>
      )}
      <div className="practice-layout">
        <ol>
          {session.lesson.steps.map((s, i) => (
            <li key={s.id} className={i === session.index ? "current" : ""}>
              <span>{session.resolutions[s.id] ? "✓" : i + 1}</span>
              {s.title}
            </li>
          ))}
        </ol>
        <section>
          <p className="muted">
            Step {session.index + 1} of {session.lesson.steps.length}
          </p>
          <h3>{step.instruction}</h3>
          <Reference
            path={assets[step.reference] ? undefined : step.reference}
            blob={assets[step.reference]}
          />
          <p>{step.view}</p>
          {step.mode === "visual" && (
            <div className="notice-box">
              <strong>Visible condition</strong>
              <p>{step.condition}</p>
            </div>
          )}
        </section>
        <section className="capture">
          <h3>Your work</h3>
          <Capture
            photo={photo}
            onPhoto={(b) => {
              setPhoto(b);
              setResult(undefined);
            }}
            disabled={busy || withdrawn}
          />
          {step.mode === "visual" && !modelReady && (
            <button
              disabled={busy || withdrawn}
              onClick={() =>
                action(async () => {
                  await prepareLocal((p) =>
                    setMessage(
                      `Preparing on-device model: ${Math.round(p * 100)}%`,
                    ),
                  );
                  setModelReady(true);
                  setMessage(
                    "Local model prepared. This is not a passed checkpoint.",
                  );
                })
              }
            >
              Prepare local model
            </button>
          )}
          {step.mode === "visual" ? (
            <button
              className="primary"
              disabled={busy || withdrawn || !photo || !modelReady}
              onClick={() =>
                action(async () => {
                  const reference = assets[step.reference];
                  if (!reference)
                    throw new Error(
                      "Download the complete lesson before checking.",
                    );
                  const r = await checkLocal(step, photo!, reference);
                  if (!alive.current) return;
                  setResult(r);
                  const next = {
                    ...session,
                    events: [...session.events],
                    resolutions: { ...session.resolutions },
                  };
                  await addEvent(next, {
                    id: crypto.randomUUID(),
                    stepId: step.id,
                    type: "LOCAL_CHECK",
                    outcome: r.outcome,
                    source: "ON_DEVICE",
                    durationMs: r.durationMs,
                  });
                  setSession(next);
                  void syncOutbox();
                  document.getElementById("check-result")?.focus();
                })
              }
            >
              {busy ? "Checking…" : "Check this step"}
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || withdrawn || resolved(session, step)}
              onClick={() =>
                action(async () => {
                  const next = {
                    ...session,
                    events: [...session.events],
                    resolutions: { ...session.resolutions },
                  };
                  await addEvent(next, {
                    id: crypto.randomUUID(),
                    stepId: step.id,
                    type: "ACKNOWLEDGED",
                  });
                  setSession(next);
                  void syncOutbox();
                })
              }
            >
              Acknowledge instruction
            </button>
          )}
          {result && (
            <div
              id="check-result"
              tabIndex={-1}
              role="status"
              className={"check-result " + result.outcome}
            >
              <h3>{result.message}</h3>
              <p>
                Checked on this device ·{" "}
                {Math.round(result.durationMs / 100) / 10}s
              </p>
            </div>
          )}
          {session.resolutions[step.id] === "SUPERVISOR" && (
            <p role="status">
              Supervisor accepted this step. The human decision is recorded
              separately.
            </p>
          )}
          <button
            disabled={busy || !photo || withdrawn}
            onClick={() => {
              setSharing(true);
              setNote("");
              setReuse(false);
            }}
          >
            Ask supervisor
          </button>
          <button
            disabled={busy || withdrawn || !resolved(session, step)}
            onClick={() => action(advance)}
          >
            Continue{" "}
            {session.index === session.lesson.steps.length - 1
              ? "to record"
              : "to next step"}
          </button>
          <p className="muted">
            Visual steps require a local pass or a supervisor decision. No
            photograph is automatically uploaded.
          </p>
          <p role="status">{message}</p>
        </section>
      </div>
      {sharing && (
        <Modal
          label="Share a review case"
          onClose={() => {
            if (!busy) setSharing(false);
          }}
        >
          <h2>Choose what to share</h2>
          <p>
            {step.title} · {session.lesson.versionId}
          </p>
          <Reference
            blob={photo}
            alt="Exact photograph selected for supervisor review"
          />
          <label>
            Note
            <textarea
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={reuse}
              onChange={(e) => setReuse(e.target.checked)}
            />
            Allow this photograph to be reused in workspace lesson examples
          </label>
          <p>
            This selected photo and note will be uploaded to the private
            workspace when connected. Supervisors can view them. Other practice
            photographs stay on this device.
          </p>
          <div className="action-row">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const id = crypto.randomUUID(),
                    path = `review-media/${session.uid}/${session.id}/${step.id}/${id}.${photo!.type === "image/png" ? "png" : "jpg"}`;
                  await queue(
                    "submitReview",
                    {
                      id,
                      sessionId: session.id,
                      stepId: step.id,
                      path,
                      note,
                      reuse,
                    },
                    photo,
                    path,
                    session.uid,
                  );
                  setSharing(false);
                  setMessage(
                    "Review queued on this device. It is not delivered until the server acknowledges it.",
                  );
                  void syncOutbox();
                })
              }
            >
              Confirm sharing
            </button>
            <button disabled={busy} onClick={() => setSharing(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function Capture({
  photo,
  onPhoto,
  disabled,
}: {
  photo?: Blob;
  onPhoto: (blob: Blob) => void;
  disabled: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | undefined>(undefined),
    [camera, setCamera] = useState(false),
    [error, setError] = useState(""),
    [facing, setFacing] = useState<"environment" | "user">("environment");
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = undefined;
    setCamera(false);
  }
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function start() {
    stop();
    setError("");
    try {
      if (!navigator.mediaDevices)
        throw new Error("Camera unavailable. Use the photo upload fallback.");
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      stream.current = s;
      setCamera(true);
      if (video.current) video.current.srcObject = s;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (camera && video.current)
      video.current.srcObject = stream.current || null;
  }, [camera]);
  return (
    <>
      <video ref={video} autoPlay playsInline muted hidden={!camera} />
      {photo && !camera && (
        <Reference
          blob={photo}
          alt="Current learner photograph, kept locally"
        />
      )}
      {!camera && !photo && (
        <div className="camera-placeholder">
          Capture or upload a checkpoint photograph.
        </div>
      )}
      <div className="action-row">
        <button disabled={disabled} onClick={start}>
          {photo ? "Retake with camera" : "Start camera"}
        </button>
        {camera && (
          <>
            <button
              disabled={disabled}
              onClick={() => {
                const v = video.current!;
                const canvas = document.createElement("canvas");
                canvas.width = Math.min(1024, v.videoWidth);
                canvas.height = Math.round(
                  (v.videoHeight * canvas.width) / v.videoWidth,
                );
                canvas
                  .getContext("2d")!
                  .drawImage(v, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                  (b) => {
                    if (b) onPhoto(b);
                  },
                  "image/jpeg",
                  0.9,
                );
                stop();
              }}
            >
              Capture photo
            </button>
            <button onClick={stop}>Stop camera</button>
          </>
        )}
        <button
          disabled={camera || disabled}
          onClick={() =>
            setFacing(facing === "environment" ? "user" : "environment")
          }
        >
          Camera: {facing === "environment" ? "rear" : "front"}
        </button>
      </div>
      <label>
        Upload photo fallback
        <input
          type="file"
          accept="image/jpeg,image/png"
          disabled={disabled}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (file.size > 4 * 1024 * 1024) {
                setError("Choose a JPEG or PNG under 4 MiB.");
                return;
              }
              stop();
              onPhoto(file);
              setError("");
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

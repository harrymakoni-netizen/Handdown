import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, doc } from "firebase/firestore";
import { db } from "../firebase/workspace";
import type { Identity } from "../firebase/AuthGate";
import { call, problem, fetchImage, uploadImage } from "../firebase/api";
import { Reference } from "./Reference";
export function Reviews({ identity }: { identity: Identity }) {
  const [cases, setCases] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(),
    [lesson, setLesson] = useState<any>(),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const supervisor = identity.role !== "learner";
  useEffect(
    () =>
      onSnapshot(
        supervisor
          ? collection(db, "workspaces", "training", "reviews")
          : query(
              collection(db, "workspaces", "training", "reviews"),
              where("uid", "==", identity.user.uid),
            ),
        (s) => setCases(s.docs.map((d) => ({ ...d.data(), id: d.id }))),
        (e) => setMessage(problem(e)),
      ),
    [identity.user.uid, supervisor],
  );
  useEffect(() => {
    if (!selected) return;
    setLesson(undefined);
    return onSnapshot(
      doc(
        db,
        "workspaces",
        "training",
        "lessons",
        selected.lessonId,
        "versions",
        selected.versionId,
      ),
      (s) => setLesson(s.data()),
      (e) => setMessage(problem(e)),
    );
  }, [selected]);
  const active = selected && cases.find((c) => c.id === selected.id);
  const step = lesson?.steps.find((s: any) => s.id === selected?.stepId);
  return (
    <section className="panel">
      <h2>
        {supervisor ? "Supervisor review queue" : "Your shared review cases"}
      </h2>
      <p>
        Only server-acknowledged uploads appear here. Queued photographs are
        listed in Synchronisation until delivered.
      </p>
      <p role="status">{message}</p>
      {!cases.length && (
        <div className="big-empty">
          <h3>No shared cases yet</h3>
          <p>
            Learners explicitly choose a photograph and note when requesting
            help.
          </p>
        </div>
      )}
      {cases.map((c) => (
        <div className="review-row" key={c.id}>
          <div>
            <h3>
              {c.lessonId} · {c.stepId}
            </h3>
            <p>
              {c.note || "No note"} · {c.versionId}
            </p>
            <span className="badge draft">
              {c.status === "pending"
                ? "Waiting for supervisor"
                : c.status === "accepted"
                  ? "Supervisor accepted"
                  : c.status === "correction"
                    ? "Needs correction"
                    : "Need another view"}
            </span>
          </div>
          <button
            onClick={() => {
              setSelected(c);
              setReason("");
              setMessage("");
            }}
          >
            Open case
          </button>
        </div>
      ))}
      {active && (
        <section className="review-detail">
          <div className="section-title">
            <h2>{step?.title || "Review case"}</h2>
            <button onClick={() => setSelected(undefined)}>Close case</button>
          </div>
          <p>
            Exact version: {active.versionId} · {active.contentHash}
          </p>
          <div className="review-images">
            <div>
              <h3>Shared learner photograph</h3>
              {active.imageExpired ? (
                <p>Original shared image removed after its retention period.</p>
              ) : (
                <Reference path={active.path} />
              )}
            </div>
            <div>
              <h3>Approved reference</h3>
              {step && <Reference path={step.reference} />}
            </div>
          </div>
          <p>{step?.condition}</p>
          <p>Learner note: {active.note || "None"}</p>
          <p>
            Reuse permission:{" "}
            {active.reuse ? "Granted for lesson examples" : "Not granted"}
          </p>
          {supervisor && active.status === "pending" && (
            <>
              <label>
                Required decision reason
                <textarea
                  value={reason}
                  maxLength={2000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="action-row">
                {[
                  ["accepted", "Accept this step"],
                  ["correction", "Needs correction"],
                  ["another-view", "Need another view"],
                ].map(([decision, label]) => (
                  <button
                    disabled={busy || !reason.trim()}
                    key={decision}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await call("decideReview", {
                          reviewId: active.id,
                          decision,
                          reason,
                        });
                        setMessage(
                          "Supervisor decision recorded for this session and checkpoint.",
                        );
                      } catch (e) {
                        setMessage(problem(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {active.status !== "pending" && (
            <p>
              Decision reason: {active.reason} · Supervisor: {active.decidedBy}
            </p>
          )}
          {supervisor &&
            active.reuse &&
            !active.imageExpired &&
            active.status !== "pending" && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await call("reuseReview", { reviewId: active.id });
                    setMessage(
                      "Revision draft created with the consented case photograph attached to its checkpoint. Open Drafts, review the instruction and rerun validation before publishing. Existing versions and sessions stay unchanged.",
                    );
                  } catch (e) {
                    setMessage(problem(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Create a revision from this consented case
              </button>
            )}
        </section>
      )}
    </section>
  );
}

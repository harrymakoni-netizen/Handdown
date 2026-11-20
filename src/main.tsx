import "./firebase/client";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import {
  BookOpen,
  ClipboardCheck,
  Monitor,
  Settings,
  UserRound,
  PanelLeft,
  Plus,
  Search,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import {
  AuthGate,
  AccountPanel,
  AppCheckDiagnostic,
  type Identity,
} from "./firebase/AuthGate";
import { db } from "./firebase/workspace";
import { call, problem } from "./firebase/api";
import {
  local,
  downloaded,
  downloadLesson,
  getPackage,
  queue,
  storeSession,
  syncOutbox,
} from "./offline/store";
import { prepareLocal } from "./ai/localVerifier";
import { Editor } from "./features/Editor";
import { Practice } from "./features/Practice";
import { Reviews } from "./features/Reviews";
import { Reference } from "./features/Reference";
import { Modal } from "./features/Modal";
import { UpdateNotice } from "./features/UpdateNotice";
import type { Lesson, Session } from "../shared/domain";
import "./style.css";

type Route =
  | "Lessons"
  | "Review queue"
  | "Device readiness"
  | "Synchronisation"
  | "Your account";
function App({ identity }: { identity: Identity }) {
  const [route, setRoute] = useState<Route>("Lessons"),
    [headers, setHeaders] = useState<any[]>([]),
    [drafts, setDrafts] = useState<any[]>([]),
    [packages, setPackages] = useState<any[]>([]),
    [sessions, setSessions] = useState<Session[]>([]),
    [jobs, setJobs] = useState<any[]>([]),
    [editor, setEditor] = useState<{ id?: string } | null>(null),
    [practice, setPractice] = useState<Session | null>(null),
    [selected, setSelected] = useState<Lesson | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("Published"),
    [online, setOnline] = useState(navigator.onLine),
    [model, setModel] = useState("Not prepared"),
    [opening, setOpening] = useState(false);
  const supervisor = identity.role !== "learner";
  async function refreshLocal() {
    const uid = identity.user.uid;
    const [p, s, j] = await Promise.all([
      downloaded(uid),
      local.sessions.where("uid").equals(uid).toArray(),
      local.outbox.where("uid").equals(uid).toArray(),
    ]);
    setPackages(p);
    setSessions(s);
    setJobs(j);
  }
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      void syncOutbox().finally(refreshLocal);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const interval = setInterval(
      () => void syncOutbox().finally(refreshLocal),
      10000,
    );
    void refreshLocal();
    void syncOutbox();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(interval);
    };
  }, [identity.user.uid]);
  useEffect(
    () =>
      onSnapshot(
        collection(db, "workspaces", "training", "lessons"),
        (s) => setHeaders(s.docs.map((d) => d.data())),
        (e) => setMessage(problem(e)),
      ),
    [],
  );
  useEffect(() => {
    if (!supervisor) return;
    return onSnapshot(
      collection(db, "workspaces", "training", "drafts"),
      (s) => setDrafts(s.docs.map((d) => d.data())),
      (e) => setMessage(problem(e)),
    );
  }, [supervisor]);
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
  async function openVersion(header: any) {
    if (!online) {
      const p = packages.find((p) => p.lesson.id === header.id);
      if (!p)
        throw new Error("Download the complete lesson while online first.");
      setSelected(p.lesson);
      return;
    }
    const d = await getDoc(
      doc(
        db,
        "workspaces",
        "training",
        "lessons",
        header.id,
        "versions",
        header.versionId,
      ),
    );
    if (!d.exists()) throw new Error("This lesson version is unavailable.");
    setSelected(d.data() as Lesson);
  }
  async function start(lesson: Lesson) {
    const pack = await getPackage(identity.user.uid, lesson);
    if (!pack)
      throw new Error("Download and verify this lesson before starting.");
    if (headers.find((h) => h.id === lesson.id)?.withdrawn)
      throw new Error("This lesson has been withdrawn. Ask for a replacement.");
    const session: Session = {
      id: crypto.randomUUID(),
      uid: identity.user.uid,
      lesson: pack.lesson,
      index: 0,
      events: [],
      resolutions: {},
      completed: false,
      createdAt: new Date().toISOString(),
      serverStarted: false,
      synced: false,
    };
    await storeSession(session);
    await queue(
      "startSession",
      {
        sessionId: session.id,
        lessonId: lesson.id,
        versionId: lesson.versionId,
      },
      undefined,
      undefined,
      identity.user.uid,
    );
    await syncOutbox();
    setPractice(session);
    setSelected(null);
    await refreshLocal();
  }
  function navigate(next: Route) {
    setRoute(next);
    setEditor(null);
    setPractice(null);
    setSelected(null);
    setMessage("");
    void refreshLocal();
  }
  async function template() {
    const id = crypto.randomUUID();
    const base = (
      title: string,
      instruction: string,
      mode: "visual" | "instruction",
      condition = "",
    ) => ({
      id: crypto.randomUUID(),
      title,
      instruction,
      mode,
      condition,
      view: "Show the entire base and support from the front.",
      correction: "Arrange the pieces as in the approved reference.",
      reference: "",
    });
    const l: Lesson = {
      id,
      title: "Assemble a tabletop display stand",
      description:
        "Harmless training-kit assembly. Visual appearance only; no claims about strength, hidden tightness or competence.",
      variant: "training-kit-a",
      minutes: 8,
      steps: [
        base(
          "Get the pieces ready",
          "Lay out the base, rear support and display panel.",
          "instruction",
        ),
        base(
          "Place the base",
          "Place the rectangular base flat with its slot facing up.",
          "visual",
          "The rectangular base is fully visible on the tabletop.",
        ),
        base(
          "Fit the rear support",
          "Fit the large support behind the base.",
          "visual",
          "The large support is visible behind the base.",
        ),
        base(
          "Attach the display panel",
          "Place the display panel into the base slot, facing forward.",
          "visual",
          "The display panel is visibly present in the base slot.",
        ),
        base(
          "Review your work",
          "Compare the complete arrangement with the reference and ask for help if uncertain.",
          "instruction",
        ),
      ],
    };
    await call("saveDraft", { lesson: l, expectedRevision: 0 });
    setEditor({ id });
  }
  const visibleHeaders = (
    online
      ? headers.filter((h) => !h.withdrawn)
      : packages.map((p) => ({
          ...p.lesson,
          sequence: p.lesson.steps.map((s: any) => ({
            id: s.id,
            title: s.title,
          })),
          steps: p.lesson.steps.length,
        }))
  ).filter((h) => h.title?.toLowerCase().includes(query.toLowerCase()));
  const visibleDrafts = drafts.filter((l) =>
    l.title?.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="shell">
      <UpdateNotice />
      <aside>
        <a className="brand" onClick={() => navigate("Lessons")}>
          <span className="mark">
            <PanelLeft />
          </span>
          handdown<span className="brand-dot">.</span>
        </a>
        <button className="workspace" onClick={() => navigate("Your account")}>
          <span className="workspace-icon">T</span>
          <span>
            <b>Training workshop</b>
            <small>{identity.role}</small>
          </span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            [BookOpen, "Lessons"],
            [ClipboardCheck, "Review queue"],
            [Monitor, "Device readiness"],
            [RefreshCw, "Synchronisation"],
          ].map(([Icon, label]: any) => (
            <button
              key={label}
              aria-label={label}
              title={label}
              className={route === label ? "active" : ""}
              onClick={() => navigate(label)}
            >
              <Icon size={19} />
              {label}
              {label === "Synchronisation" && jobs.length > 0 && (
                <span className="count">{jobs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <div className="help-card">
            <b>
              A little guidance.
              <br />A lasting skill.
            </b>
          </div>
          <button className="profile" onClick={() => navigate("Your account")}>
            <span className="avatar">
              {identity.user.email?.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <b>{identity.user.email}</b>
              <small>{identity.role}</small>
            </span>
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <div>
            Workspace <strong>{route}</strong>
          </div>
          <div className="header-right">
            <span className="online">
              <i />
              {online ? "Connected" : "Offline · cached membership"}
            </span>
            <button
              aria-label="Your account"
              title="Your account"
              onClick={() => navigate("Your account")}
            >
              <UserRound size={20} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-title">
            <div className="heading-row">
              <div>
                <h1>
                  {route === "Lessons"
                    ? "Your lessons"
                    : route === "Review queue"
                      ? "Another pair of eyes."
                      : route === "Device readiness"
                        ? "Prepare your bench."
                        : route === "Synchronisation"
                          ? "Saved here. Shared deliberately."
                          : "Your account"}
                </h1>
                <p>
                  {route === "Lessons"
                    ? "The right method. Ready for the next pair of hands."
                    : route === "Review queue"
                      ? "Resolve one visible detail, then pass the learning on."
                      : route === "Device readiness"
                        ? "Local checks use your device. Shared actions use Firebase."
                        : route === "Synchronisation"
                          ? "Queued is different from delivered."
                          : "Workspace permissions are tied to your signed-in identity."}
                </p>
              </div>
              {route === "Lessons" && supervisor && !editor && !practice && (
                <button
                  className="primary"
                  disabled={!online || busy}
                  onClick={() => setEditor({})}
                >
                  <Plus size={18} />
                  New lesson
                </button>
              )}
            </div>
          </div>
          {message && !selected && (
            <div role="status" className="notice-box">
              {message}
            </div>
          )}
          {editor ? (
            <Editor
              id={editor.id}
              onClose={() => setEditor(null)}
              onPublished={() => {
                setEditor(null);
                setMessage(
                  "Approved immutable lesson version published. New sessions can download it.",
                );
              }}
            />
          ) : practice ? (
            <Practice
              initial={practice}
              onClose={() => {
                setPractice(null);
                void refreshLocal();
              }}
            />
          ) : route === "Lessons" ? (
            <>
              <div className="workspace-note">
                <span>
                  <BookOpen size={18} />
                  Approved knowledge, one version at a time.
                </span>
                <span>
                  {packages.length} verified downloads on this account
                </span>
              </div>
              <section className="library">
                <div className="toolbar">
                  <div className="tabs">
                    {[
                      "Published",
                      ...(supervisor ? ["Drafts"] : []),
                      "Downloaded",
                      "Sessions",
                    ].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "selected" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search lessons"
                      placeholder="Search lessons…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                {filter === "Published" && (
                  <div className="lesson-grid">
                    {visibleHeaders.map((h) => (
                      <article className="lesson-card" key={h.id}>
                        <div className="lesson-image">
                          <Reference
                            path={
                              packages
                                .find((p) => p.lesson.id === h.id)
                                ?.lesson.steps.find((s: any) => s.reference)
                                ?.reference || h.reference
                            }
                            blob={(() => {
                              const p = packages.find(
                                (p) => p.lesson.id === h.id,
                              );
                              const path = p?.lesson.steps.find(
                                (s: any) => s.reference,
                              )?.reference;
                              return p?.assets[path];
                            })()}
                          />
                        </div>
                        <div className="lesson-content">
                          <h2>{h.title}</h2>
                          <p>{h.description}</p>
                          <div className="lesson-meta">
                            <span>{h.versionId} · Supervisor approved</span>
                            <span>{h.steps} steps</span>
                            <span>{h.minutes} minutes</span>
                          </div>
                          {h.sequence?.length > 0 && (
                            <ol className="card-sequence">
                              {h.sequence
                                .slice(0, 3)
                                .map((s: any, i: number) => (
                                  <li key={s.id}>
                                    <span>{i + 1}</span>
                                    {s.title}
                                  </li>
                                ))}
                              {h.steps > 3 && (
                                <li className="remaining-steps">
                                  + {h.steps - 3} more steps
                                </li>
                              )}
                            </ol>
                          )}
                          <button
                            className="open-lesson"
                            disabled={busy}
                            onClick={() => action(() => openVersion(h))}
                          >
                            View lesson <ArrowRight size={17} />
                          </button>
                        </div>
                      </article>
                    ))}
                    {!visibleHeaders.length && (
                      <div className="panel">
                        <h2>No approved lessons yet</h2>
                        <p>
                          {online
                            ? "Create a draft, add references, validate visual checks and publish an approved version."
                            : "No downloaded lesson matches this search. Reconnect to download an approved lesson."}
                        </p>
                        {supervisor && (
                          <button
                            disabled={busy || !online}
                            onClick={() => action(template)}
                          >
                            Start from the display stand template
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {filter === "Drafts" && supervisor && (
                  <section className="panel">
                    {visibleDrafts.map((l) => (
                      <div className="review-row" key={l.id}>
                        <div>
                          <h3>{l.title}</h3>
                          <p>
                            Revision {l.revision} · {l.steps.length} steps
                          </p>
                        </div>
                        <button
                          disabled={!online}
                          onClick={() => setEditor({ id: l.id })}
                        >
                          Edit draft
                        </button>
                      </div>
                    ))}
                    {!visibleDrafts.length && <p>No shared drafts yet.</p>}
                  </section>
                )}
                {filter === "Downloaded" && (
                  <section className="panel">
                    <h2>Verified offline packages</h2>
                    {packages.map((p) => (
                      <div className="review-row" key={p.key}>
                        <div>
                          <h3>{p.lesson.title}</h3>
                          <p>
                            {p.lesson.versionId} · All references verified ·{" "}
                            {new Date(p.downloadedAt).toLocaleString(
                              undefined,
                              { dateStyle: "medium", timeStyle: "short" },
                            )}
                          </p>
                        </div>
                        <button
                          disabled={
                            busy ||
                            headers.find((h) => h.id === p.lesson.id)?.withdrawn
                          }
                          onClick={() => action(() => start(p.lesson))}
                        >
                          Start practice
                        </button>
                        <button
                          onClick={async () => {
                            await local.packages.delete(p.key);
                            await refreshLocal();
                          }}
                        >
                          Remove download
                        </button>
                      </div>
                    ))}
                    {!packages.length && (
                      <p>
                        Download a published lesson to practise after losing
                        connectivity.
                      </p>
                    )}
                    <p className="muted">
                      Offline devices cannot learn of a withdrawal immediately.
                      On-device checking also requires a previously prepared
                      browser model.
                    </p>
                  </section>
                )}
                {filter === "Sessions" && (
                  <section className="panel">
                    <h2>Your local session records</h2>
                    {sessions.map((s) => (
                      <div className="review-row" key={s.id}>
                        <div>
                          <h3>{s.lesson.title}</h3>
                          <p>
                            {s.lesson.versionId} ·{" "}
                            {s.completed
                              ? s.synced
                                ? "Completed & synchronised"
                                : "Completed locally · sync pending"
                              : "In progress"}
                          </p>
                        </div>
                        <button onClick={() => setPractice(s)}>
                          {s.completed ? "View record" : "Resume"}
                        </button>
                      </div>
                    ))}
                    {!sessions.length && (
                      <p>
                        Start an approved downloaded lesson to create a session.
                      </p>
                    )}
                  </section>
                )}
              </section>
            </>
          ) : route === "Review queue" ? (
            <Reviews identity={identity} />
          ) : route === "Device readiness" ? (
            <section className="panel">
              <h2>Workstation checks</h2>
              <AppCheckDiagnostic />
              <div className="readiness">
                <Monitor />
                <div>
                  <b>Local image model</b>
                  <p role="status">{model}</p>
                </div>
                <button
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      setModel("Preparing…");
                      try {
                        await prepareLocal((p) =>
                          setModel(`Preparing ${Math.round(p * 100)}%`),
                        );
                        setModel(
                          "Prepared · perform checkpoint evaluation on this device",
                        );
                      } catch (e) {
                        setModel("Unavailable · use supported desktop Chrome");
                        throw e;
                      }
                    })
                  }
                >
                  Prepare local model
                </button>
              </div>
              <p>
                On-device image inference requires supported desktop Chrome
                (139+) and eligible hardware. iPad Safari can author and review,
                but does not provide this local vision path. The SDK is
                configured for on-device-only practice; there is no cloud photo
                fallback.
              </p>
              <div className="notice-box">
                Model preparation is not proof that a checkpoint is reliable.
                Each visual checkpoint must meet its real-device validation gate
                before publication.
              </div>
            </section>
          ) : route === "Synchronisation" ? (
            <section className="panel">
              <h2>Account outbox</h2>
              <p>
                Events are submitted in sequence with stable IDs. Photographs
                are uploaded only after explicit sharing consent. Keep this
                browser’s storage until delivery is acknowledged.
              </p>
              <button
                disabled={busy || !online}
                onClick={() =>
                  action(async () => {
                    await syncOutbox();
                    await refreshLocal();
                  })
                }
              >
                Retry synchronisation
              </button>
              {jobs.map((j) => (
                <div className="review-row" key={j.id}>
                  <div>
                    <h3>
                      {j.name === "submitReview"
                        ? "Selected photo & review request"
                        : j.name}
                    </h3>
                    <p>{j.error || "Queued on this device; not delivered"}</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (
                        confirm(
                          "Remove local retries for this session? This cannot undo actions already received by the server. Keep the session record for reference.",
                        )
                      ) {
                        const sid = j.data.sessionId;
                        const pending = await local.outbox
                          .where("uid")
                          .equals(identity.user.uid)
                          .toArray();
                        await local.outbox.bulkDelete(
                          pending
                            .filter((x) =>
                              sid ? x.data.sessionId === sid : x.id === j.id,
                            )
                            .map((x) => x.seq!),
                        );
                        await refreshLocal();
                      }
                    }}
                  >
                    Abandon local retries
                  </button>
                </div>
              ))}
              {!jobs.length && (
                <p role="status">
                  No pending uploads or events for this account.
                </p>
              )}
            </section>
          ) : (
            <section className="panel">
              <AccountPanel identity={identity} />
              <p>
                Lesson drafts are shared through Firestore. Routine practice
                photos and downloaded packages stay on this device. Shared
                review images are available only to the learner and workspace
                supervisors.
              </p>
              <button
                onClick={async () => {
                  const data = {
                    sessions: await local.sessions
                      .where("uid")
                      .equals(identity.user.uid)
                      .toArray(),
                    packages: packages.map((p) => ({
                      lesson: p.lesson,
                      downloadedAt: p.downloadedAt,
                    })),
                    pending: jobs.map(({ blob, ...j }) => j),
                  };
                  const u = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = u;
                  a.download = "handdown-account-records.json";
                  a.click();
                  URL.revokeObjectURL(u);
                }}
              >
                Export account records
              </button>
            </section>
          )}
          <footer>
            <span>Handdown · Training workshop</span>
            <span>
              {online ? "Connected" : "Offline"} · {jobs.length} pending actions
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <Modal
          label="Lesson overview"
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <button
            className="close"
            onClick={() => setSelected(null)}
            aria-label="Close overview"
          >
            ×
          </button>
          <h2>{selected.title}</h2>
          <p>{selected.description}</p>
          <p>
            {selected.versionId} · {selected.minutes} minutes ·{" "}
            {selected.variant}
          </p>
          <ol className="overview-steps">
            {selected.steps.map((s) => (
              <li key={s.id}>
                {s.title} —{" "}
                {s.mode === "visual"
                  ? "Local visual checkpoint"
                  : "Learner acknowledgement"}
              </li>
            ))}
          </ol>
          <div className="notice-box">
            This lesson covers visible conditions only. It is not a
            certification of competence or a guarantee of product quality.
          </div>
          <div className="action-row">
            <button
              disabled={busy || !online}
              onClick={() =>
                action(async () => {
                  await downloadLesson(selected);
                  await refreshLocal();
                  setMessage(
                    "Lesson manifest and reference images verified. Offline package saved.",
                  );
                })
              }
            >
              Download & verify
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                !packages.some(
                  (p) =>
                    p.lesson.id === selected.id &&
                    p.lesson.versionId === selected.versionId,
                )
              }
              onClick={() => action(() => start(selected))}
            >
              Start practice
            </button>
            {supervisor && (
              <>
                <button
                  disabled={busy || !online}
                  onClick={() =>
                    action(async () => {
                      await call("reviseLesson", {
                        lessonId: selected.id,
                        versionId: selected.versionId,
                      });
                      setEditor({ id: selected.id });
                      setSelected(null);
                    })
                  }
                >
                  Create revision
                </button>
                <button
                  disabled={busy || !online}
                  onClick={() =>
                    action(async () => {
                      if (
                        confirm(
                          "Withdraw this lesson from new sessions? Offline devices receive this notice when connected.",
                        )
                      ) {
                        await call("withdrawLesson", { lessonId: selected.id });
                        setSelected(null);
                      }
                    })
                  }
                >
                  Withdraw lesson
                </button>
              </>
            )}
          </div>
          {message && <p role="status">{message}</p>}
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <AuthGate>
    {(identity) => <App key={identity.user.uid} identity={identity} />}
  </AuthGate>,
);

import React, { useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import { onSnapshot } from "firebase/firestore";
import { getToken } from "firebase/app-check";
import { appCheck } from "./client";
import { downloaded } from "../offline/store";
import {
  auth,
  bootstrapOwner,
  memberRef,
  addWorkspaceMember,
  type WorkspaceRole,
} from "./workspace";

export type Identity = { user: User; role: WorkspaceRole };
function errorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  )
    return "Sign-in failed. Check your email and password.";
  if (code === "auth/too-many-requests")
    return "Too many attempts. Wait a moment before trying again.";
  if (code === "auth/network-request-failed" || code === "unavailable")
    return "Cannot reach Firebase. Check your connection and try again.";
  if (code === "permission-denied")
    return "Workspace access was denied. Confirm the Firestore rules have been deployed and your account has membership.";
  if (code?.startsWith("appCheck/"))
    return "Device verification failed. Open the Firebase-hosted Handdown site and retry; confirm its domain is registered for App Check.";
  if (code === "auth/invalid-api-key")
    return "Firebase rejected the web API key. Check the registered web app configuration.";
  return code
    ? `Firebase could not complete this request (${code}). Try again.`
    : "Could not complete the request. Check your connection and retry.";
}

export function AuthGate({
  children,
}: {
  children: (identity: Identity) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(
    () =>
      onAuthStateChanged(
        auth,
        (current) => {
          setUser(current);
          setRole(null);
          setError("");
          setLoading(Boolean(current));
        },
        (e) => {
          setError(errorMessage(e));
          setLoading(false);
        },
      ),
    [],
  );
  useEffect(() => {
    if (!user) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    setLoading(true);
    setError("");
    if (!navigator.onLine) {
      downloaded(user.uid).then((packages) => {
        if (!alive) return;
        try {
          const cached = JSON.parse(
            localStorage.getItem(`hd-membership:${user.uid}`) || "null",
          );
          if (
            !packages.length ||
            !cached ||
            Date.now() - cached.confirmedAt > 24 * 60 * 60 * 1000 ||
            !["owner", "supervisor", "learner"].includes(cached.role)
          )
            throw new Error();
          setRole(cached.role);
          setLoading(false);
        } catch {
          setError(
            "Offline access needs a verified download and membership confirmed within the last 24 hours. Reconnect to sign in.",
          );
          setLoading(false);
        }
      });
      return () => {
        alive = false;
      };
    }
    const timeout = window.setTimeout(() => {
      if (alive) {
        setError(
          "Workspace access is taking too long. Check your connection, then retry.",
        );
        setLoading(false);
      }
    }, 20000);
    bootstrapOwner(user.uid)
      .then(() => {
        if (!alive) return;
        unsubscribe = onSnapshot(
          memberRef(user.uid),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!alive || snapshot.metadata.fromCache) return;
            clearTimeout(timeout);
            const value = snapshot.data()?.role;
            setRole(
              ["owner", "supervisor", "learner"].includes(value) ? value : null,
            );
            try {
              if (["owner", "supervisor", "learner"].includes(value))
                localStorage.setItem(
                  `hd-membership:${user.uid}`,
                  JSON.stringify({ role: value, confirmedAt: Date.now() }),
                );
              else localStorage.removeItem(`hd-membership:${user.uid}`);
            } catch {
              /* Storage denied: online membership still works. */
            }
            setError("");
            setLoading(false);
          },
          (e) => {
            if (alive) {
              clearTimeout(timeout);
              setError(errorMessage(e));
              setLoading(false);
            }
          },
        );
      })
      .catch((e) => {
        if (alive) {
          clearTimeout(timeout);
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      clearTimeout(timeout);
      unsubscribe?.();
    };
  }, [user, retry]);
  if (!user && !loading) return <SignIn initialError={error} />;
  if (user && role && !loading && !error)
    return <>{children({ user, role })}</>;
  return (
    <div className="auth-screen">
      <section className="auth-panel">
        <span className="auth-brand">handdown.</span>
        <h1>
          {loading
            ? "Opening your workspace…"
            : error
              ? "Workspace unavailable"
              : "Membership required"}
        </h1>
        <p role="status">
          {loading
            ? "Checking your signed-in account and workspace membership."
            : error ||
              "Your account is signed in, but the workspace owner needs to add your Firebase User UID."}
        </p>
        {user && !loading && (
          <>
            <label>
              Your User UID
              <input
                readOnly
                value={user.uid}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <AppCheckDiagnostic />
            <button className="primary" onClick={() => setRetry((v) => v + 1)}>
              Retry workspace access
            </button>
            <button
              onClick={() =>
                signOut(auth).catch((e) => setError(errorMessage(e)))
              }
            >
              Sign out
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function SignIn({ initialError }: { initialError: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage(
        "If this address has an eligible account, a password reset email will arrive shortly.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-screen">
      <section className="auth-panel">
        <span className="auth-brand">handdown.</span>
        <h1>Good work starts here.</h1>
        <p>Sign in to your training workshop.</p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input
              autoFocus
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Please wait…" : "Sign in"}
          </button>
          <button type="button" onClick={reset} disabled={busy}>
            Reset password
          </button>
        </form>
        <p className="auth-footnote">
          Use the account created by your workspace owner. Published lessons and
          supervisor decisions are shared through your workspace. Routine
          practice photographs stay on this device.
        </p>
      </section>
    </div>
  );
}

export function AccountPanel({ identity }: { identity: Identity }) {
  const [uid, setUid] = useState("");
  const [role, setRole] = useState<"learner" | "supervisor">("learner");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h2>Your account</h2>
      <p>{identity.user.email}</p>
      <p>
        Workspace role: <strong>{identity.role}</strong>
      </p>
      <p className="muted">
        Your role is read from Firestore membership and enforced by database
        rules.
      </p>
      {identity.role === "owner" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await addWorkspaceMember(uid, role);
              setMessage(
                "Workspace membership saved. That account can now sign in.",
              );
              setUid("");
            } catch (e) {
              setMessage(
                e instanceof Error && !("code" in e)
                  ? e.message
                  : errorMessage(e),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Add a workspace member</h3>
          <label>
            Firebase Authentication User UID
            <input
              required
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              maxLength={128}
              disabled={busy}
            />
          </label>
          <label>
            Role
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "learner" | "supervisor")
              }
              disabled={busy}
            >
              <option value="learner">Learner</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save membership"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <button
        onClick={() => signOut(auth).catch((e) => setMessage(errorMessage(e)))}
      >
        Sign out
      </button>
    </>
  );
}

export function AppCheckDiagnostic() {
  const [status, setStatus] = useState("Not tested");
  const [busy, setBusy] = useState(false);
  return (
    <div className="readiness">
      <div>
        <b>Firebase App Check</b>
        <p role="status">{status}</p>
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setStatus("Requesting device verification…");
          try {
            if (!appCheck) throw new Error("App Check unavailable");
            await getToken(appCheck, true);
            setStatus("Verified — Firebase issued an App Check token.");
          } catch (e) {
            setStatus(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : "Verify App Check"}
      </button>
    </div>
  );
}

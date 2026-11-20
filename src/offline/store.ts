import Dexie, { type Table } from "dexie";
import type { Lesson, Session, Event } from "../../shared/domain";
import { canonicalJson } from "../../shared/domain";
import { auth } from "../firebase/workspace";
import { call, fetchImage, uploadImage } from "../firebase/api";
type Package = {
  key: string;
  uid: string;
  lesson: Lesson;
  assets: Record<string, Blob>;
  downloadedAt: string;
};
type Job = {
  seq?: number;
  id: string;
  uid: string;
  name: string;
  data: any;
  blob?: Blob;
  path?: string;
  error?: string;
  createdAt: number;
};
class OfflineDB extends Dexie {
  packages!: Table<Package, string>;
  sessions!: Table<Session & { uid: string }, string>;
  outbox!: Table<Job, number>;
  constructor() {
    super("handdown-v2");
    this.version(1).stores({
      packages: "key,uid",
      sessions: "id,uid",
      outbox: "++seq,&id,uid,createdAt",
    });
  }
}
export const local = new OfflineDB();
export const digest = async (blob: Blob | string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof blob === "string"
          ? new TextEncoder().encode(blob)
          : await blob.arrayBuffer(),
      ),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
export async function downloadLesson(lesson: any) {
  const uid = auth.currentUser!.uid;
  const { manifestHash, ...body } = lesson;
  if (!manifestHash || (await digest(canonicalJson(body))) !== manifestHash)
    throw new Error(
      "Lesson manifest integrity check failed. Download it again.",
    );
  const assets: Record<string, Blob> = {};
  for (const [path, expected] of Object.entries(lesson.assetDigests || {})) {
    const blob = await fetchImage(path);
    if ((await digest(blob)) !== expected)
      throw new Error("A reference image failed its integrity check.");
    assets[path] = blob;
  }
  await local.packages.put({
    key: `${uid}:${lesson.id}:${lesson.versionId}`,
    uid,
    lesson,
    assets,
    downloadedAt: new Date().toISOString(),
  });
}
export const downloaded = async (uid: string) =>
  local.packages.where("uid").equals(uid).toArray();
export async function getPackage(uid: string, l: Lesson) {
  return local.packages.get(`${uid}:${l.id}:${l.versionId}`);
}
export async function storeSession(s: Session) {
  await local.sessions.put(s);
}
export async function queue(
  name: string,
  data: any,
  blob?: Blob,
  path?: string,
  expectedUid = auth.currentUser?.uid,
) {
  if (!expectedUid || auth.currentUser?.uid !== expectedUid)
    throw new Error(
      "Your signed-in account changed. Reopen the session in its original account.",
    );
  const uid = expectedUid;
  await local.outbox.put({
    id: crypto.randomUUID(),
    uid,
    name,
    data,
    ...(blob ? { blob } : {}),
    ...(path ? { path } : {}),
    createdAt: Date.now(),
  });
}
export async function addEvent(s: Session, event: Event) {
  s.events.push(event);
  if (event.type === "ACKNOWLEDGED")
    s.resolutions[event.stepId] = "ACKNOWLEDGED";
  if (event.type === "LOCAL_CHECK") {
    if (event.outcome === "PASS") s.resolutions[event.stepId] = "LOCAL_CHECK";
    else if (s.resolutions[event.stepId] === "LOCAL_CHECK")
      delete s.resolutions[event.stepId];
  }
  s.synced = false;
  await storeSession(s);
  await queue(
    "ingestEvent",
    { sessionId: s.id, event },
    undefined,
    undefined,
    s.uid,
  );
}
let syncing = false;
export async function syncOutbox() {
  if (syncing || !navigator.onLine || !auth.currentUser) return;
  syncing = true;
  try {
    const uid = auth.currentUser.uid;
    const jobs = (await local.outbox.where("uid").equals(uid).toArray()).sort(
      (a, b) => (a.seq || 0) - (b.seq || 0),
    );
    for (const job of jobs) {
      if (auth.currentUser?.uid !== uid) break;
      try {
        if (job.blob && job.path) {
          try {
            await uploadImage(job.path, job.blob);
          } catch (error) {
            const existing = await fetchImage(job.path).catch(() => null);
            if (
              !existing ||
              (await digest(existing)) !== (await digest(job.blob))
            )
              throw error;
          }
        }
        if (auth.currentUser?.uid !== uid) break;
        await call(job.name, job.data);
        await local.outbox.delete(job.seq!);
        if (job.name === "startSession")
          await local.sessions.update(job.data.sessionId, {
            serverStarted: true,
          });
        if (job.name === "finishSession")
          await local.sessions.update(job.data.sessionId, { synced: true });
      } catch (e) {
        await local.outbox.update(job.seq!, {
          error: (e as Error).message || "Sync failed",
        });
        break;
      }
    }
  } finally {
    syncing = false;
  }
}

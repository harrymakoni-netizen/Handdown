import { getAuth } from 'firebase/auth';
import { doc, getFirestore, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseApp } from './client';

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const workspaceId = 'training';
export const ownerUid = 'rS4BSfSY2Gdc3jw8MNfOYa4zflq1';
export type WorkspaceRole = 'owner' | 'supervisor' | 'learner';
export const memberRef = (uid: string) => doc(db, 'workspaces', workspaceId, 'members', uid);

// Firestore rules independently enforce the pinned owner UID and exact schema.
export async function bootstrapOwner(uid: string) {
  if (uid !== ownerUid) return;
  await runTransaction(db, async tx => {
    const workspace = doc(db, 'workspaces', workspaceId);
    const member = memberRef(uid);
    const [w, m] = await Promise.all([tx.get(workspace), tx.get(member)]);
    if (!w.exists()) tx.set(workspace, {name: 'Training workshop', ownerUid, createdAt: serverTimestamp()});
    if (!m.exists()) tx.set(member, {uid, role: 'owner', createdAt: serverTimestamp()});
  });
}

export async function addWorkspaceMember(uid: string, role: 'supervisor' | 'learner') {
  const cleanUid = uid.trim();
  if (!cleanUid || cleanUid.includes('/') || cleanUid.length > 128 || cleanUid === ownerUid) {
    throw new Error('Enter the learner or supervisor UID from Firebase Authentication.');
  }
  await setDoc(memberRef(cleanUid), {uid: cleanUid, role, createdAt: serverTimestamp()});
}

export const scoped = (key: string) => `hd:v1:${workspaceId}:${auth.currentUser?.uid ?? 'signed-out'}:${key}`;

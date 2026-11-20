import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import {
  connectStorageEmulator,
  getStorage,
  ref,
  uploadBytes,
  getBlob,
} from "firebase/storage";
import { firebaseApp, useEmulators } from "./client";
const functions = getFunctions(firebaseApp, "africa-south1");
const storage = getStorage(firebaseApp);
if (useEmulators) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
export async function call<T = any>(name: string, data: unknown): Promise<T> {
  if (!navigator.onLine)
    throw new Error(
      "This action needs a connection. Your work is saved locally.",
    );
  const response = await httpsCallable<unknown, T>(functions, name)(data);
  return response.data;
}
export function problem(error: unknown) {
  const message =
    (error as { message?: string })?.message ||
    "The request failed. Retry when connected.";
  return message.replace(/^Firebase: /, "").slice(0, 1200);
}
export async function uploadImage(path: string, blob: Blob) {
  if (
    blob.size > 4 * 1024 * 1024 ||
    !["image/png", "image/jpeg"].includes(blob.type)
  )
    throw new Error("Use a PNG or JPEG image under 4 MiB.");
  await uploadBytes(ref(storage, path), blob, { contentType: blob.type });
  return path;
}
export async function fetchImage(path: string) {
  return getBlob(ref(storage, path), 4 * 1024 * 1024);
}

export async function uploadAuthoringVideo(
  file: File,
  mime: string,
  progress: (value: number) => void,
) {
  const { uploadBytesResumable } = await import("firebase/storage");
  const { auth } = await import("./workspace");
  if (!auth.currentUser)
    throw new Error("Sign in before uploading a demonstration.");
  const extension =
    mime === "video/quicktime" ? "mov" : mime === "video/webm" ? "webm" : "mp4";
  const object = ref(
    storage,
    `authoring-media/${auth.currentUser.uid}/${crypto.randomUUID()}.${extension}`,
  );
  const task = uploadBytesResumable(object, file, { contentType: mime });
  await new Promise<void>((resolve, reject) =>
    task.on(
      "state_changed",
      (s) => progress(s.bytesTransferred / s.totalBytes),
      reject,
      () => resolve(),
    ),
  );
  return { path: object.fullPath, uri: object.toString() };
}
export async function deleteAuthoringVideo(path: string) {
  const { deleteObject } = await import("firebase/storage");
  await deleteObject(ref(storage, path));
}

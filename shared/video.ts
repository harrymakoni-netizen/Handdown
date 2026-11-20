export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 10 * 60;
export const INLINE_VIDEO_BYTES = 12 * 1024 * 1024;
export function videoMime(file: { type: string; name: string; size: number }) {
  const mime =
    file.type ||
    (/\.mp4$/i.test(file.name)
      ? "video/mp4"
      : /\.mov$/i.test(file.name)
        ? "video/quicktime"
        : /\.webm$/i.test(file.name)
          ? "video/webm"
          : "");
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(mime))
    throw new Error("Choose an MP4, MOV or WebM demonstration.");
  if (file.size <= 0 || file.size > MAX_VIDEO_BYTES)
    throw new Error("Choose a video no larger than 100 MiB.");
  return mime;
}
export function validateVideoDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_VIDEO_SECONDS)
    throw new Error("Use a demonstration no longer than 10 minutes.");
}
export function videoTransport(size: number) {
  return size > INLINE_VIDEO_BYTES ? "storage" : "inline";
}

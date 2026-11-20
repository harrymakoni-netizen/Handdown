import React, { useEffect, useState } from "react";
import { fetchImage } from "../firebase/api";
import { Art } from "./Diagram";
export function Reference({
  path,
  blob,
  alt = "Approved reference",
}: {
  path?: string;
  blob?: Blob;
  alt?: string;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      objectUrl = "";
    setUrl("");
    setError("");
    if (!path && !blob) return;
    Promise.resolve(blob || fetchImage(path!))
      .then((b) => {
        if (alive) {
          objectUrl = URL.createObjectURL(b);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (alive)
          setError(
            "Image unavailable. Reconnect or download the complete lesson.",
          );
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, blob]);
  return url ? (
    <img className="reference-photo" src={url} alt={alt} />
  ) : error ? (
    <div className="notice-box" role="alert">
      {error}
    </div>
  ) : path || blob ? (
    <p>Loading reference…</p>
  ) : (
    <>
      <Art />
      <p className="muted">
        Illustrative training kit — not an approved checkpoint photograph.
      </p>
    </>
  );
}

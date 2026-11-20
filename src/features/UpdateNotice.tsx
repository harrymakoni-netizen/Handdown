import React, { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
export function UpdateNotice() {
  const [available, setAvailable] = useState(false),
    [update, setUpdate] = useState<(reload?: boolean) => Promise<void>>();
  useEffect(() => {
    const apply = registerSW({
      onNeedRefresh() {
        setAvailable(true);
      },
    });
    setUpdate(() => apply);
  }, []);
  return available ? (
    <div className="update-notice" role="status">
      <span>A Handdown update is ready. Save your work before reloading.</span>
      <button onClick={() => void update?.(true)}>Reload update</button>
      <button onClick={() => setAvailable(false)}>Later</button>
    </div>
  ) : null;
}

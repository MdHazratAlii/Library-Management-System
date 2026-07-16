import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div className="lp-offline-pill" role="status" aria-live="polite">
      <span className="lp-offline-dot" aria-hidden="true">
        <i className="fa-solid fa-wifi-slash" />
      </span>
      <span>You&rsquo;re offline &mdash; showing cached data</span>
    </div>
  );
}
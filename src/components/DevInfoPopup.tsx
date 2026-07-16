import { useEffect, useState } from "react";

type DevInfo = {
  appName: string;
  version: string;
  environment: string;
  userAgent: string;
  platform: string;
  language: string;
  screen: string;
  viewport: string;
  online: boolean;
  url: string;
  timestamp: string;
};

function collect(): DevInfo {
  return {
    appName: "Library Pro",
    version: (import.meta.env.VITE_APP_VERSION as string) || "1.0.0",
    environment: import.meta.env.MODE,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screen: `${window.screen.width}×${window.screen.height}`,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    online: navigator.onLine,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };
}

export function DevInfoPopup() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<DevInfo | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setInfo(collect());
  }, [open]);

  if (!open || !info) return null;

  const rows: Array<[string, string | boolean]> = [
    ["App", info.appName],
    ["Version", info.version],
    ["Environment", info.environment],
    ["URL", info.url],
    ["Platform", info.platform],
    ["Language", info.language],
    ["Screen", info.screen],
    ["Viewport", info.viewport],
    ["Online", info.online],
    ["User Agent", info.userAgent],
    ["Timestamp", info.timestamp],
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        rows.map(([k, v]) => `${k}: ${v}`).join("\n"),
      );
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Developer info"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "hsl(var(--background, 0 0% 100%))",
          color: "hsl(var(--foreground, 0 0% 10%))",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          width: "min(560px, 100%)",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(127,127,127,0.2)",
          }}
        >
          <strong style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
            Developer Info
          </strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={copy}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(127,127,127,0.3)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Copy
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(127,127,127,0.3)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Close
            </button>
          </div>
        </div>
        <div style={{ padding: "12px 16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td
                    style={{
                      padding: "6px 8px 6px 0",
                      opacity: 0.7,
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {k}
                  </td>
                  <td style={{ padding: "6px 0", wordBreak: "break-all" }}>
                    {String(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 12, opacity: 0.6, fontSize: 11 }}>
            Toggle with Ctrl/Cmd + Shift + D · Press Esc to close
          </p>
        </div>
      </div>
    </div>
  );
}
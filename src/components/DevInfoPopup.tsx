import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

const DEV_INFO = {
  appName: "Library Pro",
  description: "A modern, offline-capable Library Management System.",
  version: "1.0.0",
  lastUpdate: "16 July 2026",
  developer: "John Doe",
  email: "developer@gmail.com",
  website: "developer.com",
};

export function DevInfoPopup() {
  const [visible, setVisible] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    const isTrigger = (e: KeyboardEvent) =>
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      (e.key === "D" || e.key === "d");

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTrigger(e)) {
        e.preventDefault();
        setVisible(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Close as soon as any part of the combo is released
      if (
        e.key === "Control" ||
        e.key === "Meta" ||
        e.key === "Shift" ||
        e.key === "D" ||
        e.key === "d"
      ) {
        setVisible(false);
      }
    };
    const onBlur = () => setVisible(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!visible) return null;

  const url = typeof window !== "undefined" ? window.location.href : "";

  const rows: Array<[string, React.ReactNode]> = [
    [t("dev_app_name"), DEV_INFO.appName],
    [t("dev_description"), DEV_INFO.description],
    [t("dev_version"), DEV_INFO.version],
    [t("dev_last_update"), DEV_INFO.lastUpdate],
    [t("dev_url"), url],
    [t("dev_developer"), DEV_INFO.developer],
    [t("dev_email"), DEV_INFO.email],
    [t("dev_website"), DEV_INFO.website],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Developer info"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          color: "#0f172a",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          width: "min(520px, 100%)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <strong style={{ fontSize: 16 }}>{t("dev_info_title")}</strong>
        </div>
        <div style={{ padding: "12px 18px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td
                    style={{
                      padding: "8px 12px 8px 0",
                      color: "#64748b",
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                      fontWeight: 500,
                    }}
                  >
                    {k}
                  </td>
                  <td
                    style={{
                      padding: "8px 0",
                      wordBreak: "break-all",
                      color: "#0f172a",
                    }}
                  >
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 10, color: "#94a3b8", fontSize: 11 }}>
            {t("dev_info_hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
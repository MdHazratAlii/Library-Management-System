// Small header chip: shows online/offline + pending outbox count.
import { useEffect, useState } from "react";
import { onLocalChange, isBrowser } from "@/lib/db/schema";
import { outboxCount } from "@/lib/db/repo";
import { kickSync } from "@/lib/db/sync";
import { useLang } from "@/lib/i18n";

export function SyncStatus() {
  const { t } = useLang();
  const [online, setOnline] = useState<boolean>(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [pending, setPending] = useState<number>(0);

  useEffect(() => {
    if (!isBrowser()) return;
    const refresh = async () => setPending(await outboxCount());
    refresh();
    const off = onLocalChange(refresh);
    const onOnline = () => { setOnline(true); refresh(); };
    const onOffline = () => { setOnline(false); refresh(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const int = setInterval(refresh, 5000);
    return () => { off(); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); clearInterval(int); };
  }, []);

  const label = !online
    ? (pending > 0 ? t("sync_offline_pending", { n: pending }) : t("sync_offline"))
    : (pending > 0 ? t("sync_pending", { n: pending }) : t("sync_synced"));

  const dotColor = !online ? "#f0b100" : (pending > 0 ? "#18f0bf" : "#89ff75");
  const bg = !online ? "#fff7db" : (pending > 0 ? "#e6fff8" : "#eefff0");
  const border = !online ? "#f0d982" : (pending > 0 ? "#a4ecd6" : "#b9edb3");

  return (
    <button
      type="button"
      onClick={() => kickSync()}
      title={t("sync_click_retry")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 100,
        background: bg, border: `1px solid ${border}`,
        color: "#181e15", fontSize: 12, fontWeight: 600,
        cursor: "pointer", fontFamily: "Inter, sans-serif",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 100, background: dotColor, display: "inline-block" }} />
      {label}
    </button>
  );
}
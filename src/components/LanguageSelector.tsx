import { useEffect, useRef, useState } from "react";
import { LANGUAGES, useLang, type LangCode } from "@/lib/i18n";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (code: LangCode) => { setLang(code); setOpen(false); };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language")}
        title={t("language")}
        style={{
          height: 44,
          padding: compact ? "0 12px" : "0 14px",
          borderRadius: 100,
          border: "1px solid var(--lp-border)",
          background: "#fff",
          cursor: "pointer",
          color: "#181e15",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "Inter, sans-serif",
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>{current.flag}</span>
        {!compact && <span>{current.native}</span>}
        <i className="fa-solid fa-chevron-down" style={{ fontSize: 10, color: "#6c6e79" }} />
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 220,
            background: "#fff",
            border: "1px solid var(--lp-border)",
            borderRadius: 16,
            boxShadow: "0 20px 40px -18px rgba(24, 30, 21, 0.25), 0 8px 24px -12px rgba(24, 240, 191, 0.25)",
            padding: 6,
            zIndex: 60,
            maxHeight: 360,
            overflowY: "auto",
          }}
        >
          {LANGUAGES.map((l) => {
            const active = l.code === lang;
            return (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pick(l.code)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "none",
                  background: active ? "linear-gradient(135deg, rgba(24,240,191,0.18), rgba(193,144,255,0.18))" : "transparent",
                  color: "#181e15",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "Inter, sans-serif",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f4f7f6"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>{l.flag}</span>
                <span style={{ flex: 1 }}>{l.native}</span>
                <span style={{ fontSize: 11, color: "#6c6e79", textTransform: "uppercase", letterSpacing: 0.5 }}>{l.code}</span>
                {active && <i className="fa-solid fa-check" style={{ color: "#18f0bf", fontSize: 12 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
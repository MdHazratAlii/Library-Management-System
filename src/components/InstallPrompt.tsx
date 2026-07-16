import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "lp-install-dismissed-at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const recentlyDismissed = dismissedAt && Date.now() - dismissedAt < DISMISS_MS;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      if (!recentlyDismissed) setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no beforeinstallprompt — show a hint after a short delay.
    if (isIOS() && !recentlyDismissed) {
      const t = setTimeout(() => {
        setIosHint(true);
        setVisible(true);
      }, 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBIP);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "dismissed") {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
    } catch {
      /* noop */
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  };

  return (
    <div className="lp-install-card" role="dialog" aria-label="Install Library Pro">
      <div className="lp-install-icon" aria-hidden="true">
        <img src="/icon-192.png" alt="" width={40} height={40} />
      </div>
      <div className="lp-install-body">
        <div className="lp-install-title">Install Library Pro</div>
        {iosHint ? (
          <div className="lp-install-desc">
            Tap <i className="fa-solid fa-arrow-up-from-bracket" /> Share, then{" "}
            <strong>Add to Home Screen</strong>.
          </div>
        ) : (
          <div className="lp-install-desc">
            Add to your home screen for a faster, full-screen experience.
          </div>
        )}
      </div>
      <div className="lp-install-actions">
        {!iosHint && deferred && (
          <button type="button" className="lp-install-btn primary" onClick={install}>
            Install
          </button>
        )}
        <button
          type="button"
          className="lp-install-btn ghost"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          {iosHint ? "Got it" : "Not now"}
        </button>
      </div>
    </div>
  );
}
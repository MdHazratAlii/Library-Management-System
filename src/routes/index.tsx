import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthPage } from "./auth";
import { Dashboard } from "./_authenticated/dashboard";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Library Pro — Library Management System" }] }),
  component: Index,
});

type Status = "loading" | "auth" | "admin";

function Index() {
  const [status, setStatus] = useState<Status>("loading");
  const [denied, setDenied] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [displayed, setDisplayed] = useState<Status>("loading");
  const [transitioning, setTransitioning] = useState(false);
  const prevRef = useRef<Status>("loading");

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (prevRef.current === status) {
      setDisplayed(status);
      return;
    }
    setTransitioning(true);
    const t = setTimeout(() => {
      setDisplayed(status);
      prevRef.current = status;
      requestAnimationFrame(() => setTransitioning(false));
    }, 220);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      // Use local session first — works offline (reads from localStorage).
      const { data: sess } = await supabase.auth.getSession();
      if (!alive) return;
      const user = sess.session?.user;
      if (!user) { setStatus("auth"); return; }
      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      const cachedAdminKey = `lp-admin-${user.id}`;
      const cachedAdmin = typeof localStorage !== "undefined" && localStorage.getItem(cachedAdminKey) === "1";
      if (!online) {
        // Offline: trust cached admin flag; if unknown, allow through to avoid signing out.
        setDenied(false);
        setStatus("admin");
        return;
      }
      try {
        const { data: roleRow, error } = await supabase
          .from("user_roles").select("role")
          .eq("user_id", user.id).eq("role", "admin").maybeSingle();
        if (!alive) return;
        if (error) {
          // Network hiccup — fall back to cached flag if present.
          if (cachedAdmin) { setDenied(false); setStatus("admin"); return; }
          throw error;
        }
        if (roleRow) {
          try { localStorage.setItem(cachedAdminKey, "1"); } catch { /* ignore */ }
          setDenied(false); setStatus("admin");
        } else {
          try { localStorage.removeItem(cachedAdminKey); } catch { /* ignore */ }
          await supabase.auth.signOut();
          setDenied(true);
          setStatus("auth");
        }
      } catch {
        if (cachedAdmin) { setDenied(false); setStatus("admin"); }
        else { setStatus("auth"); }
      }
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <>
      {!splashDone && <Splash />}
      <div
        key={displayed}
        className="lp-view-swap"
        data-leaving={transitioning ? "true" : "false"}
        style={{ animation: "lpAppIn .5s ease-out both" }}
      >
        {displayed === "admin" ? <Dashboard /> : <AuthPage denied={denied} />}
      </div>
    </>
  );
}

function Splash() {
  return (
    <div className="lp-splash" role="status" aria-label="Loading Library Pro">
      <div className="lp-splash-inner">
        <div className="lp-splash-logo">
          <i className="fa-solid fa-book" />
        </div>
        <div className="lp-splash-title">Library Pro</div>
        <div className="lp-splash-bar"><span /></div>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  beforeLoad: () => { throw redirect({ to: "/" }); },
  component: () => null,
});

export function AuthPage({ denied }: { denied?: boolean } = {}) {
  const navigate = useNavigate();
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(
    denied ? "Access denied. Your account is not authorized as an admin." : null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.rpc("has_any_admin" as never).then(({ data, error }) => {
      if (error) { setAdminExists(true); return; }
      setAdminExists(Boolean(data));
    });
  }, []);

  const mode: "signin" | "signup" = adminExists === false ? "signup" : "signin";

  // Auth state changes are handled by the parent index route.

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: name, display_name: name },
          },
        });
        if (error) throw error;
        // In case email confirmation is disabled, session may already exist.
        // Otherwise sign in immediately so we can bootstrap the admin role.
        const { data: after } = await supabase.auth.getUser();
        if (!after.user) {
          const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
          if (siErr) throw siErr;
        }
        // Claim the librarian role (only succeeds if no admin exists yet).
        await supabase.rpc("bootstrap_admin" as never);
      }
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: roleRow } = await supabase
          .from("user_roles").select("role")
          .eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
        if (!roleRow) {
          await supabase.auth.signOut();
          setErr("Access denied. Your account is not authorized as an admin.");
          return;
        }
      }
      navigate({ to: "/", replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="lp-app"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(1200px 600px at 15% 10%, #dceeeb 0%, transparent 60%), radial-gradient(1000px 500px at 85% 90%, #eee9ff 0%, transparent 60%), #f7fbfa",
        padding: 20,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          maxWidth: 440,
          width: "100%",
          borderRadius: 24,
          boxShadow:
            "0 20px 60px -20px rgba(24, 240, 191, 0.25), 0 10px 40px -15px rgba(193, 144, 255, 0.25)",
          padding: 40,
          border: "1px solid var(--lp-border)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              background: "linear-gradient(135deg, #18f0bf 0%, #c190ff 100%)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#181e15",
              fontSize: 26,
              marginBottom: 18,
              boxShadow: "0 10px 30px -8px rgba(24, 240, 191, 0.5)",
            }}
          >
            <i className="fa-solid fa-book" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--lp-text-dark)", margin: 0, letterSpacing: "-0.02em" }}>
            {mode === "signin" ? "Welcome back" : "Create librarian account"}
          </h1>
          <p style={{ fontSize: 14, color: "var(--lp-text-light)", marginTop: 8 }}>
            {mode === "signin"
              ? "Sign in to Library Pro"
              : "Set up the first librarian for Library Pro"}
          </p>
        </div>

        {err && (
          <div
            style={{
              background: "#fff0f0",
              color: "var(--lp-danger)",
              padding: "12px 16px",
              borderRadius: 14,
              fontSize: 13,
              marginBottom: 16,
              border: "1px solid #ffd6d8",
            }}
          >
            {err}
          </div>
        )}

        <form onSubmit={submit}>
          {mode === "signup" && (
            <div className="lp-input-group" style={{ position: "relative" }}>
              <label>Name</label>
              <i className="fa-solid fa-user" style={{ position: "absolute", left: 16, top: 42, color: "var(--lp-text-light)", fontSize: 13 }} />
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} style={{ paddingLeft: 42, borderRadius: 100 }} placeholder="Librarian name" />
            </div>
          )}
          <div className="lp-input-group" style={{ position: "relative" }}>
            <label>Email</label>
            <i className="fa-solid fa-envelope" style={{ position: "absolute", left: 16, top: 42, color: "var(--lp-text-light)", fontSize: 13 }} />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ paddingLeft: 42, borderRadius: 100 }} placeholder="you@example.com" />
          </div>
          <div className="lp-input-group" style={{ position: "relative" }}>
            <label>Password</label>
            <i className="fa-solid fa-lock" style={{ position: "absolute", left: 16, top: 42, color: "var(--lp-text-light)", fontSize: 13 }} />
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingLeft: 42, borderRadius: 100 }} placeholder="••••••••" />
          </div>
          <button
            type="submit"
            disabled={loading || adminExists === null}
            className="lp-btn lp-btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "14px",
              marginTop: 12,
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "0 10px 24px -10px rgba(24, 240, 191, 0.6)",
            }}
          >
            {loading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign In"
                : "Create Librarian"}
          </button>
        </form>

      </div>
    </div>
  );
}
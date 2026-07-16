import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { getSettings, saveSettings, loadLogoDataUrl, DEFAULT_SETTINGS, type LibrarySettings } from "@/lib/library-settings";
import { uploadTitledImage } from "@/lib/image-upload";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => { throw redirect({ to: "/" }); },
  component: () => null,
});

type Category = { id: number; name: string; descr: string };
type Book = { id: number; title: string; isbn: string; cat_id: number | null; pub_year: number; qty: number; available: number; cover_url?: string };
type Student = { id: number; name: string; student_id: string; email: string; phone: string; image_url: string; address?: string };
type Issue = { id: number; book_id: number; student_id: number; issue_date: string; due_date: string; status: string; return_date?: string | null };
type Fine = { id: number; issue_id: number; student_id: number; amount: number; status: string };

type ViewKey = "dashboard" | "books" | "categories" | "students" | "issues" | "overdue" | "fines" | "reports" | "settings";

const PIE_COLORS = ["#18f0bf", "#c190ff", "#89ff75", "#181e15", "#dceeeb", "#6c6e79"];

// Design-system chart tokens (aqua / mint / lavender)
const CHART_TOKENS = {
  aqua: "#18f0bf",
  lavender: "#c190ff",
  mint: "#89ff75",
  ink: "#181e15",
  border: "#dceeeb",
  muted: "#6c6e79",
};
const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#ffffff",
    border: `1px solid ${CHART_TOKENS.border}`,
    borderRadius: 16,
    boxShadow: "0 12px 30px -12px rgba(24, 240, 191, 0.35)",
    padding: "10px 14px",
    fontFamily: "Inter, sans-serif",
    fontSize: 12,
  } as React.CSSProperties,
  labelStyle: { color: CHART_TOKENS.ink, fontWeight: 600, marginBottom: 4 } as React.CSSProperties,
  itemStyle: { color: CHART_TOKENS.muted, fontSize: 12 } as React.CSSProperties,
  cursor: { fill: "rgba(24, 240, 191, 0.12)" },
};
const LEGEND_STYLE: React.CSSProperties = {
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  color: CHART_TOKENS.ink,
};
const AXIS_TICK = { fill: CHART_TOKENS.muted, fontSize: 11, fontFamily: "Inter, sans-serif" };

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysBetween(dueISO: string) {
  const due = new Date(dueISO).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - due) / 86400000));
}

export function Dashboard() {
  const navigate = useNavigate();
  const validViews: ViewKey[] = ["dashboard", "books", "categories", "students", "issues", "overdue", "fines", "reports", "settings"];
  const [view, setViewState] = useState<ViewKey>(() => {
    if (typeof window === "undefined") return "dashboard";
    const saved = window.localStorage.getItem("lp-view") as ViewKey | null;
    return saved && validViews.includes(saved) ? saved : "dashboard";
  });
  const mainRef = useRef<HTMLElement | null>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const setView = useCallback((next: ViewKey) => {
    if (mainRef.current) scrollPositions.current[view] = mainRef.current.scrollTop;
    setViewState(next);
  }, [view]);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("lp-view", view);
  }, [view]);
  useLayoutEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = scrollPositions.current[view] ?? 0;
  }, [view]);
  const [username, setUsername] = useState("Librarian");
  const [librarianPhoto, setLibrarianPhoto] = useState<string>("");
  useEffect(() => {
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") setLibrarianPhoto(detail);
    };
    window.addEventListener("lp-librarian-photo-change", onLocal);
    return () => window.removeEventListener("lp-librarian-photo-change", onLocal);
  }, []);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("lp-sidebar-collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lp-sidebar-collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (!isMobile) setMobileOpen(false); }, [isMobile]);

  const [books, setBooks] = useState<Book[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [fines, setFines] = useState<Fine[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [b, c, s, i, f] = await Promise.all([
      supabase.from("books").select("*").order("id", { ascending: false }),
      supabase.from("categories").select("*").order("id", { ascending: false }),
      supabase.from("students").select("*").order("id", { ascending: false }),
      supabase.from("book_issues").select("*").order("id", { ascending: false }),
      supabase.from("fines").select("*").order("id", { ascending: false }),
    ]);
    if (b.data) setBooks(b.data as Book[]);
    if (c.data) setCats(c.data as Category[]);
    if (s.data) setStudents(s.data as Student[]);
    if (i.data) setIssues(i.data as Issue[]);
    if (f.data) setFines(f.data as Fine[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const applyUser = (user: { email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
      if (!user) return;
      const meta = user.user_metadata || {};
      const display = (meta.display_name as string) || (meta.full_name as string) || (meta.name as string) || "";
      if (display) setUsername(display);
      else if (user.email) setUsername(user.email.split("@")[0]);
      const photo = (meta.librarian_photo_url as string) || "";
      setLibrarianPhoto(photo);
    };
    supabase.auth.getUser().then(({ data }) => applyUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => applyUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const catMap = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c.name])), [cats]);
  const bookMap = useMemo(() => Object.fromEntries(books.map((b) => [b.id, b])), [books]);
  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const issueMap = useMemo(() => Object.fromEntries(issues.map((i) => [i.id, i])), [issues]);

  // Global + per-view search state
  const [globalQ, setGlobalQ] = useState("");
  const [qBooks, setQBooks] = useState("");
  const [catFilter, setCatFilter] = useState<number | "all">("all");
  const [qCats, setQCats] = useState("");
  const [qStudents, setQStudents] = useState("");
  const [qIssues, setQIssues] = useState("");
  const [issueStatus, setIssueStatus] = useState<"all" | "Issued" | "Returned" | "Overdue">("all");
  const [qOverdue, setQOverdue] = useState("");
  const [qFines, setQFines] = useState("");
  const [fineStatus, setFineStatus] = useState<"all" | "Paid" | "Unpaid">("all");

  const norm = (v: unknown) => String(v ?? "").toLowerCase();
  const matches = (needle: string, ...fields: unknown[]) => {
    const q = needle.trim().toLowerCase();
    if (!q) return true;
    return fields.some((f) => norm(f).includes(q));
  };

  const filteredBooks = useMemo(() => books.filter((b) =>
    (catFilter === "all" || b.cat_id === catFilter) &&
    matches(globalQ, b.title, b.isbn, catMap[b.cat_id || 0]) &&
    matches(qBooks, b.title, b.isbn, catMap[b.cat_id || 0], b.pub_year)
  ), [books, catFilter, globalQ, qBooks, catMap]);

  const filteredCats = useMemo(() => cats.filter((c) =>
    matches(globalQ, c.name, c.descr) && matches(qCats, c.name, c.descr)
  ), [cats, globalQ, qCats]);

  const filteredStudents = useMemo(() => students.filter((s) =>
    matches(globalQ, s.name, s.student_id, s.email, s.phone) &&
    matches(qStudents, s.name, s.student_id, s.email, s.phone)
  ), [students, globalQ, qStudents]);

  const issueMatches = (i: Issue, q: string) => {
    const b = bookMap[i.book_id]; const s = studentMap[i.student_id];
    return matches(q, b?.title, b?.isbn, s?.name, s?.student_id, s?.email, i.issue_date, i.due_date, i.status);
  };
  const isOverdue = (i: Issue) => i.status === "Issued" && daysBetween(i.due_date) > 0;
  const filteredIssues = useMemo(() => issues.filter((i) => {
    if (issueStatus === "Overdue" ? !isOverdue(i) : issueStatus !== "all" && i.status !== issueStatus) return false;
    return issueMatches(i, globalQ) && issueMatches(i, qIssues);
  }), [issues, issueStatus, globalQ, qIssues, bookMap, studentMap]);

  const filteredOverdue = useMemo(() => issues.filter((i) => isOverdue(i) && issueMatches(i, globalQ) && issueMatches(i, qOverdue)), [issues, globalQ, qOverdue, bookMap, studentMap]);

  const filteredFines = useMemo(() => fines.filter((f) => {
    if (fineStatus !== "all" && f.status !== fineStatus) return false;
    const s = studentMap[f.student_id];
    const iss = issueMap[f.issue_id];
    const bk = iss ? bookMap[iss.book_id] : null;
    return matches(globalQ, s?.name, s?.student_id, bk?.title, f.amount, f.status) &&
           matches(qFines, s?.name, s?.student_id, bk?.title, f.amount, f.status);
  }), [fines, fineStatus, globalQ, qFines, studentMap, issueMap, bookMap]);

  // Pagination state
  const PAGE_SIZE = 10;
  const [pgBooks, setPgBooks] = useState(1);
  const [pgCats, setPgCats] = useState(1);
  const [pgStudents, setPgStudents] = useState(1);
  const [pgIssues, setPgIssues] = useState(1);
  useEffect(() => { setPgBooks(1); }, [qBooks, catFilter, globalQ]);
  useEffect(() => { setPgCats(1); }, [qCats, globalQ]);
  useEffect(() => { setPgStudents(1); }, [qStudents, globalQ]);
  useEffect(() => { setPgIssues(1); }, [qIssues, issueStatus, globalQ]);
  const paginate = <T,>(arr: T[], page: number) => arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedBooks = paginate(filteredBooks, pgBooks);
  const pagedCats = paginate(filteredCats, pgCats);
  const pagedStudents = paginate(filteredStudents, pgStudents);
  const pagedIssues = paginate(filteredIssues, pgIssues);

  const stat_b = books.reduce((a, b) => a + (b.qty || 0), 0);
  const stat_i = issues.filter((x) => x.status === "Issued").length;
  const stat_r = issues.filter((x) => x.status === "Returned").length;
  const stat_o = issues.filter((x) => x.status === "Issued" && x.due_date < todayISO()).length;
  const stat_f = fines.filter((f) => f.status === "Paid").reduce((a, f) => a + Number(f.amount || 0), 0);
  const stat_u = fines.filter((f) => f.status !== "Paid").reduce((a, f) => a + Number(f.amount || 0), 0);

  const catCounts = cats.map((c) => ({ name: c.name, count: books.filter((b) => b.cat_id === c.id).length }));

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  // Modal state
  const [modal, setModal] = useState<null | "book" | "category" | "student" | "student-view" | "issue" | "issue-edit" | "fine">(null);
  const [editData, setEditData] = useState<Record<string, unknown> | null>(null);

  const openBook = (d: Book | null = null) => { setEditData(d as never); setModal("book"); };
  const openCat = (d: Category | null = null) => { setEditData(d as never); setModal("category"); };
  const openStudent = (d: Student | null = null) => { setEditData(d as never); setModal("student"); };
  const viewStudent = (d: Student) => { setEditData(d as never); setModal("student-view"); };
  const openIssue = () => { setEditData(null); setModal("issue"); };
  const openIssueEdit = (i: Issue) => { setEditData(i as never); setModal("issue-edit"); };
  const openFine = (f: Fine | null = null) => { setEditData(f as never); setModal("fine"); };
  const close = () => { setModal(null); setEditData(null); };

  const saveBook = async (form: Book & { id?: number }) => {
    if (form.id) {
      const old = bookMap[form.id];
      const newAvail = Math.max(0, (old?.available || 0) + (form.qty - (old?.qty || 0)));
      await supabase.from("books").update({
        title: form.title, isbn: form.isbn, cat_id: form.cat_id, pub_year: form.pub_year, qty: form.qty, available: newAvail,
        cover_url: form.cover_url ?? "",
      } as never).eq("id", form.id);
    } else {
      await supabase.from("books").insert({
        title: form.title, isbn: form.isbn, cat_id: form.cat_id, pub_year: form.pub_year, qty: form.qty, available: form.qty,
        cover_url: form.cover_url ?? "",
      } as never);
    }
    close(); loadAll();
  };

  const saveCat = async (form: Category & { id?: number }) => {
    if (form.id) await supabase.from("categories").update({ name: form.name, descr: form.descr }).eq("id", form.id);
    else await supabase.from("categories").insert({ name: form.name, descr: form.descr });
    close(); loadAll();
  };

  const saveStudent = async (form: Student & { id?: number }) => {
    const image_url = form.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name)}&background=ff6b00&color=fff`;
    const { id, ...rest } = form;
    if (id) await supabase.from("students").update({ ...rest, image_url }).eq("id", id);
    else await supabase.from("students").insert({ ...rest, image_url });
    close(); loadAll();
  };

  const saveIssue = async (form: { book_id: number; student_id: number; due_date: string }) => {
    if (form.book_id == null || form.student_id == null || Number.isNaN(form.book_id) || Number.isNaN(form.student_id)) { alert("Select a book and a student."); return; }
    const b = bookMap[form.book_id];
    if (!b || (b.available ?? 0) <= 0) { alert("Book not available"); return; }
    const maxIssues = getSettings().maxIssuesPerStudent;
    const activeCount = issues.filter((i) => i.student_id === form.student_id && i.status === "Issued").length;
    if (activeCount >= maxIssues) {
      alert(`This student already has ${activeCount} active issue(s). Maximum allowed is ${maxIssues}.`);
      return;
    }
    const ins = await supabase
      .from("book_issues")
      .insert({ book_id: form.book_id, student_id: form.student_id, due_date: form.due_date, status: "Issued", issue_date: todayISO() });
    if (ins.error) {
      alert(`Could not issue book: ${ins.error.message}\n\nMake sure your account has the admin role (run bootstrap_admin from the auth page).`);
      return;
    }
    const upd = await supabase.from("books").update({ available: (b.available ?? 0) - 1 }).eq("id", b.id);
    if (upd.error) alert(`Issued, but stock update failed: ${upd.error.message}`);
    close(); loadAll();
  };

  const del = async (table: "books" | "categories" | "students", id: number) => {
    if (table === "books") {
      const b = bookMap[id]; if (!b) return;
      if (b.qty !== b.available) { alert("Cannot delete: some copies are issued."); return; }
    }
    if (table === "categories") {
      if (books.some((b) => b.cat_id === id)) { alert("Cannot delete: books are using this category."); return; }
    }
    if (table === "students") {
      if (issues.some((i) => i.student_id === id && i.status === "Issued")) { alert("Cannot delete: student has active issues."); return; }
    }
    if (!confirm("Delete this item?")) return;
    await supabase.from(table).delete().eq("id", id);
    loadAll();
  };

  const returnIssue = async (iss: Issue) => {
    if (iss.status === "Returned") return;
    const late = daysBetween(iss.due_date);
    if (late > 0) {
      await supabase.from("fines").insert({ issue_id: iss.id, student_id: iss.student_id, amount: late * getSettings().fineRate, status: "Unpaid" });
    }
    await supabase.from("book_issues").update({ status: "Returned", return_date: todayISO() } as never).eq("id", iss.id);
    const b = bookMap[iss.book_id];
    if (b) await supabase.from("books").update({ available: b.available + 1 }).eq("id", b.id);
    loadAll();
  };

  const payFine = async (id: number) => {
    if (!confirm("Mark this fine as paid?")) return;
    await supabase.from("fines").update({ status: "Paid" }).eq("id", id);
    loadAll();
  };

  const saveIssueEdit = async (form: Issue) => {
    const old = issueMap[form.id];
    await supabase.from("book_issues").update({ due_date: form.due_date, status: form.status }).eq("id", form.id);
    if (old && old.status !== form.status) {
      const b = bookMap[old.book_id];
      if (b) {
        if (old.status === "Issued" && form.status === "Returned") {
          await supabase.from("books").update({ available: b.available + 1 }).eq("id", b.id);
        } else if (old.status === "Returned" && form.status === "Issued") {
          await supabase.from("books").update({ available: Math.max(0, b.available - 1) }).eq("id", b.id);
        }
      }
    }
    close(); loadAll();
  };

  const delIssue = async (i: Issue) => {
    if (!confirm("Delete this issue record? Related fines will also be removed.")) return;
    await supabase.from("fines").delete().eq("issue_id", i.id);
    await supabase.from("book_issues").delete().eq("id", i.id);
    if (i.status === "Issued") {
      const b = bookMap[i.book_id];
      if (b) await supabase.from("books").update({ available: b.available + 1 }).eq("id", b.id);
    }
    loadAll();
  };

  const saveFine = async (form: Fine) => {
    if (form.id) {
      await supabase.from("fines").update({ amount: form.amount, status: form.status, issue_id: form.issue_id, student_id: form.student_id }).eq("id", form.id);
    } else {
      await supabase.from("fines").insert({ amount: form.amount, status: form.status, issue_id: form.issue_id, student_id: form.student_id });
    }
    close(); loadAll();
  };

  const delFine = async (id: number) => {
    if (!confirm("Delete this fine?")) return;
    await supabase.from("fines").delete().eq("id", id);
    loadAll();
  };

  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const NavItem = ({ id, icon, label }: { id: ViewKey; icon: string; label: string }) => (
    <div
      className={`lp-nav-item ${view === id ? "active" : ""}`}
      onClick={() => { setView(id); if (isMobile) setMobileOpen(false); }}
      title={desktopCollapsed ? label : undefined}
      aria-label={desktopCollapsed ? label : undefined}
      style={desktopCollapsed ? { justifyContent: "center", position: "relative" } : { position: "relative" }}
    >
      <i className={`fa-solid ${icon}`} style={{ width: 18, textAlign: "center" }} />
      <span
        style={{
          overflow: "hidden",
          whiteSpace: "nowrap",
          opacity: desktopCollapsed ? 0 : 1,
          maxWidth: desktopCollapsed ? 0 : 200,
          marginLeft: desktopCollapsed ? 0 : 0,
          transition: "opacity 160ms ease, max-width 220ms ease",
          pointerEvents: desktopCollapsed ? "none" : "auto",
        }}
      >
        {label}
      </span>
      {desktopCollapsed && (
        <span className="lp-tip" role="tooltip">
          {label}
        </span>
      )}
    </div>
  );

  const desktopCollapsed = collapsed && !isMobile;
  const sidebarWidth = desktopCollapsed ? 76 : 230;
  const SectionLabel = ({ children }: { children: string }) => (
    <div style={{ padding: desktopCollapsed ? "18px 0 6px" : "20px 20px 6px", fontSize: 10, textTransform: "uppercase", color: "#6c6e79", letterSpacing: 1.2, fontWeight: 700, textAlign: desktopCollapsed ? "center" : "left", transition: "padding 220ms ease" }}>
      <span style={{ display: "inline-block", position: "relative", height: 12, lineHeight: "12px", width: desktopCollapsed ? 24 : "auto", transition: "width 220ms ease" }}>
        <span style={{ opacity: desktopCollapsed ? 0 : 1, transition: "opacity 140ms ease", whiteSpace: "nowrap" }}>{children}</span>
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "#c8d5d2", opacity: desktopCollapsed ? 1 : 0, transition: "opacity 200ms ease" }} />
      </span>
    </div>
  );

  return (
    <div className="lp-app" style={{ display: "flex", height: "100vh", background: "#f7fbfa", overflow: "hidden" }}>
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(24,30,21,0.45)", zIndex: 40 }}
          aria-hidden
        />
      )}
      {/* Sidebar */}
      <aside
        style={
          isMobile
            ? {
                width: 280,
                background: "linear-gradient(180deg,#dceeeb 0%,#eee9ff 100%)",
                color: "#181e15",
                position: "fixed",
                top: 0,
                left: 0,
                height: "100vh",
                overflowY: "auto",
                borderRight: "1px solid #dceeeb",
                zIndex: 50,
                transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 220ms ease",
                boxShadow: mobileOpen ? "0 20px 60px rgba(24,30,21,0.25)" : "none",
              }
            : { width: sidebarWidth, background: "linear-gradient(180deg,#dceeeb 0%,#eee9ff 100%)", flexShrink: 0, color: "#181e15", position: "sticky", top: 0, height: "100vh", overflowY: desktopCollapsed ? "visible" : "auto", overflowX: desktopCollapsed ? "visible" : "hidden", borderRight: "1px solid #dceeeb", transition: "width 260ms cubic-bezier(0.4, 0, 0.2, 1)", willChange: "width", zIndex: desktopCollapsed ? 30 : "auto" }
        }
      >
        <div style={{ padding: desktopCollapsed ? "22px 0" : "22px 20px", display: "flex", alignItems: "center", gap: 12, justifyContent: desktopCollapsed ? "center" : "space-between", transition: "padding 220ms ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 100, background: "#18f0bf", display: "flex", alignItems: "center", justifyContent: "center", color: "#181e15" }}>
            <i className="fa-solid fa-book" />
          </div>
          <div
            style={{
              overflow: "hidden",
              opacity: desktopCollapsed ? 0 : 1,
              maxWidth: desktopCollapsed ? 0 : 200,
              transition: "opacity 160ms ease, max-width 240ms ease",
              pointerEvents: desktopCollapsed ? "none" : "auto",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>Library Pro</div>
            <div style={{ fontSize: 11, color: "#6c6e79", whiteSpace: "nowrap" }}>Management System</div>
          </div>
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              style={{ width: 36, height: 36, borderRadius: 100, border: "1px solid #c8d5d2", background: "#fff", cursor: "pointer", color: "#181e15", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>

        <NavItem id="dashboard" icon="fa-gauge-high" label="Dashboard" />

        <SectionLabel>Library</SectionLabel>
        <NavItem id="books" icon="fa-book" label="Books" />
        <NavItem id="categories" icon="fa-tags" label="Categories" />

        <SectionLabel>Circulation</SectionLabel>
        <NavItem id="issues" icon="fa-right-left" label="Book Issues" />
        <NavItem id="overdue" icon="fa-triangle-exclamation" label="Overdue" />
        <NavItem id="fines" icon="fa-money-bill" label="Fines" />

        <SectionLabel>Users & Reports</SectionLabel>
        <NavItem id="students" icon="fa-user-graduate" label="Students" />
        <NavItem id="reports" icon="fa-chart-line" label="Reports" />
        <NavItem id="settings" icon="fa-gear" label="Settings" />
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header className="lp-header" style={{ minHeight: 72, background: "#fff", borderBottom: "1px solid var(--lp-border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingTop: 12, paddingBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
            <button
              type="button"
              onClick={() => (isMobile ? setMobileOpen((v) => !v) : setCollapsed((v) => !v))}
              aria-label={isMobile ? (mobileOpen ? "Close menu" : "Open menu") : collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isMobile ? "Menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{ width: 44, height: 44, borderRadius: 100, border: "1px solid var(--lp-border)", background: "#fff", cursor: "pointer", color: "#181e15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              <i className={`fa-solid ${isMobile ? "fa-bars" : collapsed ? "fa-angles-right" : "fa-angles-left"}`} />
            </button>
            {!isMobile && (
              <div style={{ fontSize: 13, color: "#181e15", display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                <i className="fa-solid fa-clock" style={{ color: "#18f0bf" }} />
                {dateStr}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {librarianPhoto ? (
              <img src={librarianPhoto} alt={username} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid #18f0bf" }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#18f0bf", color: "#181e15", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>
                {username[0]}
              </div>
            )}
            {!isMobile && <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{username}</div>
              <div style={{ fontSize: 11, color: "#6c6e79" }}>Librarian</div>
            </div>}
            {!isMobile && <div style={{ width: 1, height: 32, background: "#dceeeb", margin: "0 4px" }} />}
            <button className="lp-btn lp-btn-outline-danger" onClick={logout}>
              <i className="fa-solid fa-right-from-bracket" /> {!isMobile && "Logout"}
            </button>
          </div>
        </header>

        <main ref={mainRef} className="lp-main" style={{ flex: 1, overflowY: "auto" }}>
          {view === "dashboard" && (
            <div className="lp-view">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
                <h1 style={{ fontSize: 34, fontWeight: 600, display: "flex", alignItems: "center", gap: 12, letterSpacing: "-0.03em" }}>
                  <i className="fa-solid fa-gauge-high" style={{ color: "#18f0bf", fontSize: 28 }} /> Dashboard
                </h1>
              </div>
              <div className="lp-grid-stats">
                {loading ? (
                  <>
                    <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
                  </>
                ) : (
                  <>
                    <StatCard tone="info" icon="fa-book" num={stat_b} lbl="Total Books" />
                    <StatCard tone="active" icon="fa-right-left" num={issues.filter((i) => i.status === "Issued" || i.status === "Overdue" || isOverdue(i)).length} lbl="Issued Books" />
                    <StatCard tone="warning" icon="fa-triangle-exclamation" num={stat_o} lbl="Overdue" />
                    <StatCard tone="money" icon="fa-money-bill" num={`৳${stat_f}`} lbl="Fines" />
                  </>
                )}
              </div>
              <div className="lp-grid-2">
                <div className="lp-card" style={{ height: 320 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, letterSpacing: "-0.02em" }}>Overview</h3>
                  {loading ? (
                    <ChartSkeleton kind="bar" />
                  ) : stat_b + stat_i + stat_r + stat_o === 0 ? (
                    <EmptyState icon="fa-chart-column" title="No activity yet" sub="Add books and issues to see the overview." />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={[
                        { name: "Total Books", v: stat_b, fill: CHART_TOKENS.lavender },
                        { name: "Active Issues", v: stat_i, fill: CHART_TOKENS.aqua },
                        { name: "Returned", v: stat_r, fill: CHART_TOKENS.mint },
                        { name: "Overdue", v: stat_o, fill: CHART_TOKENS.ink },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_TOKENS.border} />
                        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: CHART_TOKENS.border }} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={{ stroke: CHART_TOKENS.border }} tickLine={false} />
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Bar dataKey="v" radius={[100, 100, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="lp-card" style={{ height: 320, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, letterSpacing: "-0.02em" }}>Books by Category</h3>
                  {loading ? (
                    <ChartSkeleton kind="pie" />
                  ) : catCounts.length === 0 || catCounts.every((c) => c.count === 0) ? (
                    <EmptyState icon="fa-tags" title="No categories yet" sub="Create categories and books to build this chart." />
                  ) : (
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={catCounts} dataKey="count" nameKey="name" outerRadius={70} stroke="#fff" strokeWidth={2}>
                            {catCounts.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip {...TOOLTIP_STYLE} />
                          <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ ...LEGEND_STYLE, maxHeight: 72, overflowY: "auto", paddingTop: 8, width: "100%" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {view === "books" && (
            <div className="lp-view">
              <ViewHeader title="Books" icon="fa-book" btn={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="lp-btn lp-btn-primary" onClick={() => exportTablePDF("Books", "books",
                    ["#", "Title", "ISBN", "Category", "Year", "Qty", "Available"],
                    filteredBooks.map((b) => [b.id, b.title, b.isbn || "—", catMap[b.cat_id || 0] || "—", b.pub_year, b.qty, b.available]),
                    [["Total Titles", filteredBooks.length], ["Total Copies", filteredBooks.reduce((a, b) => a + (b.qty || 0), 0)], ["Available", filteredBooks.reduce((a, b) => a + (b.available || 0), 0)], ["Issued", filteredBooks.reduce((a, b) => a + ((b.qty || 0) - (b.available || 0)), 0)]])}><i className="fa-solid fa-file-pdf" /> Export PDF</button>
                  <button className="lp-btn lp-btn-green" onClick={() => exportTableXLSX("Books", "books",
                    ["#", "Title", "ISBN", "Category", "Year", "Qty", "Available"],
                    filteredBooks.map((b) => [b.id, b.title, b.isbn || "—", catMap[b.cat_id || 0] || "—", b.pub_year, b.qty, b.available]),
                    [["Total Titles", filteredBooks.length], ["Total Copies", filteredBooks.reduce((a, b) => a + (b.qty || 0), 0)], ["Available", filteredBooks.reduce((a, b) => a + (b.available || 0), 0)], ["Issued", filteredBooks.reduce((a, b) => a + ((b.qty || 0) - (b.available || 0)), 0)]])}><i className="fa-solid fa-file-excel" /> Export XLSX</button>
                  <button className="lp-btn lp-btn-purple" onClick={() => openBook(null)}><i className="fa-solid fa-plus" /> Add New Book</button>
                </div>} />
              <FilterBar>
                <SearchInput value={qBooks} onChange={setQBooks} placeholder="Filter books by title, ISBN…" />
                <select value={catFilter} onChange={(e) => setCatFilter(e.target.value === "all" ? "all" : Number(e.target.value))} style={{ height: 40, borderRadius: 100, border: "1px solid var(--lp-border)", background: "#fff", padding: "0 14px", fontSize: 13, color: "#181e15", cursor: "pointer", minWidth: 160 }}>
                  <option value="all">All Categories</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ResultCount n={filteredBooks.length} total={books.length} />
              </FilterBar>
              <div className="lp-table-wrap">
                <table>
                  <thead><tr><th style={{ width: 64 }}>Cover</th><th>Title</th><th>Category</th><th>ISBN</th><th>Qty</th><th>Available</th><th>Actions</th></tr></thead>
                  <tbody>
                     {pagedBooks.map((b) => (
                      <tr key={b.id}>
                         <td>
                           {b.cover_url ? (
                             <img src={b.cover_url} alt={b.title} style={{ width: 40, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--lp-border)", background: "#f4f5f7" }} loading="lazy" />
                           ) : (
                             <div style={{ width: 40, height: 56, borderRadius: 6, border: "1px solid var(--lp-border)", background: "#f4f5f7", display: "flex", alignItems: "center", justifyContent: "center", color: "#c1c5cf" }}><i className="fa-solid fa-book" /></div>
                           )}
                         </td>
                        <td><div style={{ fontWeight: 600 }}>{b.title}</div><div style={{ fontSize: 11, color: "#8990a2" }}>{b.pub_year}</div></td>
                        <td><span className="lp-badge lp-badge-blue">{catMap[b.cat_id || 0] || "—"}</span></td>
                        <td>{b.isbn || "—"}</td>
                        <td>{b.qty}</td>
                        <td style={{ fontWeight: 700, color: b.available > 0 ? "#28a745" : "#dc3545" }}>{b.available}</td>
                        <td>
                          <button className="lp-action-ico" onClick={() => openBook(b)}><i className="fa-solid fa-pen" /></button>
                          <button className="lp-action-ico" onClick={() => del("books", b.id)}><i className="fa-solid fa-trash" /></button>
                        </td>
                      </tr>
                    ))}
                     {filteredBooks.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 30, color: "#8990a2" }}>{books.length === 0 ? "No books yet." : "No books match your search."}</td></tr>}
                  </tbody>
                </table>
              </div>
               <Pagination page={pgBooks} pageSize={PAGE_SIZE} total={filteredBooks.length} onChange={setPgBooks} />
            </div>
          )}

          {view === "categories" && (
            <div className="lp-view">
              <ViewHeader title="Categories" icon="fa-tags" btn={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="lp-btn lp-btn-primary" onClick={() => exportTablePDF("Categories", "categories",
                    ["#", "Name", "Description", "Books"],
                    filteredCats.map((c) => [c.id, c.name, c.descr || "—", books.filter((b) => b.cat_id === c.id).length]),
                    [["Total Categories", filteredCats.length], ["Total Books", books.length], ["Uncategorized Books", books.filter((b) => !b.cat_id).length]])}><i className="fa-solid fa-file-pdf" /> Export PDF</button>
                  <button className="lp-btn lp-btn-green" onClick={() => exportTableXLSX("Categories", "categories",
                    ["#", "Name", "Description", "Books"],
                    filteredCats.map((c) => [c.id, c.name, c.descr || "—", books.filter((b) => b.cat_id === c.id).length]),
                    [["Total Categories", filteredCats.length], ["Total Books", books.length], ["Uncategorized Books", books.filter((b) => !b.cat_id).length]])}><i className="fa-solid fa-file-excel" /> Export XLSX</button>
                  <button className="lp-btn lp-btn-purple" onClick={() => openCat(null)}><i className="fa-solid fa-plus" /> Add Category</button>
                </div>} />
              <FilterBar>
                <SearchInput value={qCats} onChange={setQCats} placeholder="Filter categories…" />
                <ResultCount n={filteredCats.length} total={cats.length} />
              </FilterBar>
              <div className="lp-table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Description</th><th>Book Count</th><th>Actions</th></tr></thead>
                  <tbody>
                     {pagedCats.map((c) => {
                      const count = books.filter((b) => b.cat_id === c.id).length;
                      return (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}>{c.name}</td>
                          <td style={{ color: "#8990a2" }}>{c.descr || "—"}</td>
                          <td><span className="lp-badge lp-badge-blue">{count} Books</span></td>
                          <td>
                            <button className="lp-action-ico" onClick={() => openCat(c)}><i className="fa-solid fa-pen" /></button>
                            <button className="lp-action-ico" onClick={() => del("categories", c.id)}><i className="fa-solid fa-trash" /></button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredCats.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", padding: 30, color: "#8990a2" }}>{cats.length === 0 ? "No categories yet." : "No categories match your search."}</td></tr>}
                  </tbody>
                </table>
              </div>
               <Pagination page={pgCats} pageSize={PAGE_SIZE} total={filteredCats.length} onChange={setPgCats} />
            </div>
          )}

          {view === "students" && (
            <div className="lp-view">
              <ViewHeader title="Students" icon="fa-user-graduate" btn={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="lp-btn lp-btn-primary" onClick={() => exportTablePDF("Students", "students",
                    ["#", "Name", "Student ID", "Email", "Phone"],
                    filteredStudents.map((s) => [s.id, s.name, s.student_id, s.email || "—", s.phone || "—"]),
                    [["Total Students", filteredStudents.length], ["With Email", filteredStudents.filter((s) => !!s.email).length], ["With Phone", filteredStudents.filter((s) => !!s.phone).length]])}><i className="fa-solid fa-file-pdf" /> Export PDF</button>
                  <button className="lp-btn lp-btn-green" onClick={() => exportTableXLSX("Students", "students",
                    ["#", "Name", "Student ID", "Email", "Phone"],
                    filteredStudents.map((s) => [s.id, s.name, s.student_id, s.email || "—", s.phone || "—"]),
                    [["Total Students", filteredStudents.length], ["With Email", filteredStudents.filter((s) => !!s.email).length], ["With Phone", filteredStudents.filter((s) => !!s.phone).length]])}><i className="fa-solid fa-file-excel" /> Export XLSX</button>
                  <button className="lp-btn lp-btn-purple" onClick={() => openStudent(null)}><i className="fa-solid fa-plus" /> Add Student</button>
                </div>} />
              <FilterBar>
                <SearchInput value={qStudents} onChange={setQStudents} placeholder="Filter students by name, ID, email, phone…" />
                <ResultCount n={filteredStudents.length} total={students.length} />
              </FilterBar>
              <div className="lp-table-wrap">
                <table>
                  <thead><tr><th>Student</th><th>Student ID</th><th>Phone</th><th>Actions</th></tr></thead>
                  <tbody>
                     {pagedStudents.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <img src={s.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=ff6b00&color=fff`} alt={s.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                            <div>
                              <div style={{ fontWeight: 600 }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: "#8990a2" }}>{s.email || "—"}</div>
                            </div>
                          </div>
                        </td>
        <td style={{ color: "#6b3fbf", fontWeight: 700 }}>{s.student_id}</td>
                        <td>{s.phone || "—"}</td>
                        <td>
                          <button className="lp-action-ico" title="View details" onClick={() => viewStudent(s)}><i className="fa-solid fa-eye" /></button>
                          <button className="lp-action-ico" onClick={() => openStudent(s)}><i className="fa-solid fa-pen" /></button>
                          <button className="lp-action-ico" onClick={() => del("students", s.id)}><i className="fa-solid fa-trash" /></button>
                        </td>
                      </tr>
                    ))}
                    {filteredStudents.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", padding: 30, color: "#8990a2" }}>{students.length === 0 ? "No students yet." : "No students match your search."}</td></tr>}
                  </tbody>
                </table>
              </div>
               <Pagination page={pgStudents} pageSize={PAGE_SIZE} total={filteredStudents.length} onChange={setPgStudents} />
            </div>
          )}

          {view === "issues" && (
            <div className="lp-view">
              <ViewHeader title="Book Issues" icon="fa-right-left" btn={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="lp-btn lp-btn-primary" onClick={() => exportTablePDF("Book Issues", "book-issues",
                    ["#", "Book", "Student", "Issue Date", "Due Date", "Status"],
                    filteredIssues.map((i) => [i.id, bookMap[i.book_id]?.title || "—", studentMap[i.student_id]?.name || "—", i.issue_date, i.due_date, i.status]),
                    [["Total Issues", filteredIssues.length], ["Issued", filteredIssues.filter((i) => i.status === "Issued").length], ["Returned", filteredIssues.filter((i) => i.status === "Returned").length], ["Overdue", filteredIssues.filter((i) => i.status === "Overdue" || isOverdue(i)).length]])}><i className="fa-solid fa-file-pdf" /> Export PDF</button>
                  <button className="lp-btn lp-btn-green" onClick={() => exportTableXLSX("Book Issues", "book-issues",
                    ["#", "Book", "Student", "Issue Date", "Due Date", "Status"],
                    filteredIssues.map((i) => [i.id, bookMap[i.book_id]?.title || "—", studentMap[i.student_id]?.name || "—", i.issue_date, i.due_date, i.status]),
                    [["Total Issues", filteredIssues.length], ["Issued", filteredIssues.filter((i) => i.status === "Issued").length], ["Returned", filteredIssues.filter((i) => i.status === "Returned").length], ["Overdue", filteredIssues.filter((i) => i.status === "Overdue" || isOverdue(i)).length]])}><i className="fa-solid fa-file-excel" /> Export XLSX</button>
                  <button className="lp-btn lp-btn-purple" onClick={openIssue}><i className="fa-solid fa-plus" /> Issue Book</button>
                </div>} />
              <div className="lp-grid-stats">
                <StatCard tone="active" icon="fa-right-left" num={issues.length} lbl="Total Issued" />
                <StatCard tone="info" icon="fa-rotate-left" num={issues.filter((i) => i.status === "Returned").length} lbl="Total Returned" />
                <StatCard tone="warning" icon="fa-triangle-exclamation" num={issues.filter((i) => i.status === "Overdue" || isOverdue(i)).length} lbl="Overdue" />
                <StatCard tone="money" icon="fa-book" num={books.reduce((a, b) => a + (b.available || 0), 0)} lbl="Available Books" />
              </div>
              <FilterBar>
                <SearchInput value={qIssues} onChange={setQIssues} placeholder="Filter by book, student, date…" />
                <select value={issueStatus} onChange={(e) => setIssueStatus(e.target.value as typeof issueStatus)} style={{ height: 40, borderRadius: 100, border: "1px solid var(--lp-border)", background: "#fff", padding: "0 14px", fontSize: 13, color: "#181e15", cursor: "pointer", minWidth: 160 }}>
                  <option value="all">All Statuses</option>
                  <option value="Issued">Issued</option>
                  <option value="Returned">Returned</option>
                  <option value="Overdue">Overdue</option>
                </select>
                <ResultCount n={filteredIssues.length} total={issues.length} />
              </FilterBar>
              <IssuesTable issues={pagedIssues} bookMap={bookMap} studentMap={studentMap} onReturn={returnIssue} onEdit={openIssueEdit} onDelete={delIssue} />
              <Pagination page={pgIssues} pageSize={PAGE_SIZE} total={filteredIssues.length} onChange={setPgIssues} />
            </div>
          )}

          {view === "overdue" && (
            <div className="lp-view">
              <ViewHeader title="Overdue Books" icon="fa-triangle-exclamation" btn={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="lp-btn lp-btn-primary" onClick={() => exportTablePDF("Overdue Books", "overdue",
                    ["#", "Book", "Student", "Due Date", "Days Late"],
                    filteredOverdue.map((i) => [i.id, bookMap[i.book_id]?.title || "—", studentMap[i.student_id]?.name || "—", i.due_date, daysBetween(i.due_date)]),
                    [["Total Overdue", filteredOverdue.length], ["Total Days Late", filteredOverdue.reduce((a, i) => a + daysBetween(i.due_date), 0)], ["Estimated Fines (Tk)", filteredOverdue.reduce((a, i) => a + daysBetween(i.due_date) * 5, 0)]])}><i className="fa-solid fa-file-pdf" /> Export PDF</button>
                  <button className="lp-btn lp-btn-green" onClick={() => exportTableXLSX("Overdue Books", "overdue",
                    ["#", "Book", "Student", "Due Date", "Days Late"],
                    filteredOverdue.map((i) => [i.id, bookMap[i.book_id]?.title || "—", studentMap[i.student_id]?.name || "—", i.due_date, daysBetween(i.due_date)]),
                    [["Total Overdue", filteredOverdue.length], ["Total Days Late", filteredOverdue.reduce((a, i) => a + daysBetween(i.due_date), 0)], ["Estimated Fines (Tk)", filteredOverdue.reduce((a, i) => a + daysBetween(i.due_date) * 5, 0)]])}><i className="fa-solid fa-file-excel" /> Export XLSX</button>
                </div>} />
              <FilterBar>
                <SearchInput value={qOverdue} onChange={setQOverdue} placeholder="Filter overdue by book or student…" />
                <ResultCount n={filteredOverdue.length} total={issues.filter(isOverdue).length} />
              </FilterBar>
              <div className="lp-table-wrap">
                <table>
                  <thead><tr><th style={{ color: "#b3282b" }}>Book</th><th style={{ color: "#b3282b" }}>Student</th><th style={{ color: "#b3282b" }}>Due Date</th><th style={{ color: "#b3282b" }}>Days Late</th><th style={{ color: "#b3282b" }}>Est. Fine</th><th style={{ color: "#b3282b" }}>Actions</th></tr></thead>
                  <tbody>
                    {filteredOverdue.map((i) => {
                      const late = daysBetween(i.due_date);
                      const b = bookMap[i.book_id]; const s = studentMap[i.student_id];
                      return (
                        <tr key={i.id} style={{ background: "#fff7f7" }}>
                          <td>{b?.title || "—"}</td>
                          <td>{s?.name || "—"}</td>
                          <td style={{ color: "#b3282b", fontWeight: 700 }}>{i.due_date}</td>
                          <td><span className="lp-badge lp-badge-red">-{late} days</span></td>
                           <td style={{ color: "#181e15", fontWeight: 700 }}>৳{late * getSettings().fineRate}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              <button className="lp-btn lp-btn-green" onClick={() => returnIssue(i)}>Return & Fine</button>
                              <button className="lp-action-ico" title="Edit" onClick={() => openIssueEdit(i)}><i className="fa-solid fa-pen" /></button>
                              <button className="lp-action-ico" title="Delete" onClick={() => delIssue(i)}><i className="fa-solid fa-trash" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredOverdue.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: "#8990a2" }}>No overdue books match your search.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "fines" && (
            <div className="lp-view">
              <ViewHeader title="Fines" icon="fa-money-bill" btn={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="lp-btn lp-btn-primary" onClick={() => exportFinesPDF({ fines, studentMap, issueMap, bookMap })}><i className="fa-solid fa-file-pdf" /> Export PDF</button>
                  <button className="lp-btn lp-btn-green" onClick={() => exportFinesXLSX({ fines, studentMap, issueMap, bookMap })}><i className="fa-solid fa-file-excel" /> Export XLSX</button>
                  <button className="lp-btn lp-btn-purple" onClick={() => openFine(null)}><i className="fa-solid fa-plus" /> Add Fine</button>
                </div>} />
              <FilterBar>
                <SearchInput value={qFines} onChange={setQFines} placeholder="Filter fines by student, book, amount…" />
                <select value={fineStatus} onChange={(e) => setFineStatus(e.target.value as typeof fineStatus)} style={{ height: 40, borderRadius: 100, border: "1px solid var(--lp-border)", background: "#fff", padding: "0 14px", fontSize: 13, color: "#181e15", cursor: "pointer", minWidth: 160 }}>
                  <option value="all">All Statuses</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Paid">Paid</option>
                </select>
                <ResultCount n={filteredFines.length} total={fines.length} />
              </FilterBar>
              <div className="lp-table-wrap">
                <table>
                  <thead><tr><th>Student</th><th>Book</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {filteredFines.map((f) => {
                      const s = studentMap[f.student_id];
                      const iss = issueMap[f.issue_id];
                      const bk = iss ? bookMap[iss.book_id] : null;
                      return (
                        <tr key={f.id}>
                          <td><div style={{ fontWeight: 600 }}>{s?.name || "—"}</div><div style={{ fontSize: 11, color: "#8990a2" }}>{s?.student_id}</div></td>
                          <td>{bk?.title || "—"}</td>
                          <td style={{ color: "#181e15", fontWeight: 700, fontSize: 15 }}>৳{Number(f.amount)}</td>
                          <td><span className={`lp-badge ${f.status === "Paid" ? "lp-badge-green" : "lp-badge-red"}`}>{f.status}</span></td>
                          <td>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              {f.status !== "Paid" && <button className="lp-btn lp-btn-primary" onClick={() => payFine(f.id)}>Mark Paid</button>}
                              <button className="lp-action-ico" title="Edit" onClick={() => openFine(f)}><i className="fa-solid fa-pen" /></button>
                              <button className="lp-action-ico" title="Delete" onClick={() => delFine(f.id)}><i className="fa-solid fa-trash" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredFines.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 30, color: "#8990a2" }}>{fines.length === 0 ? "No fines." : "No fines match your search."}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "reports" && (
            <div className="lp-view">
              <ViewHeader title="Reports" icon="fa-chart-line" btn={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="lp-btn lp-btn-primary" onClick={() => exportAllReportsPDF({ stat_b, stat_i, stat_r, stat_o, stat_f, stat_u, books, cats, students, issues, fines, catMap, bookMap, studentMap, issueMap })}><i className="fa-solid fa-file-pdf" /> Export PDF</button>
                  <button className="lp-btn lp-btn-green" onClick={() => exportAllReportsXLSX({ stat_b, stat_i, stat_r, stat_o, stat_f, stat_u, books, cats, students, issues, fines, catMap, bookMap, studentMap, issueMap })}><i className="fa-solid fa-file-excel" /> Export XLSX</button>
                </div>
              } />
              <div className="lp-grid-2" style={{ marginBottom: 16 }}>
                <div className="lp-card" style={{ height: 320 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, letterSpacing: "-0.02em" }}>Circulation Summary</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={[
                      { name: "Stock", v: stat_b, fill: CHART_TOKENS.lavender },
                      { name: "Issued", v: stat_i, fill: CHART_TOKENS.aqua },
                      { name: "Returned", v: stat_r, fill: CHART_TOKENS.mint },
                      { name: "Overdue", v: stat_o, fill: CHART_TOKENS.ink },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_TOKENS.border} />
                      <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: CHART_TOKENS.border }} tickLine={false} />
                      <YAxis tick={AXIS_TICK} axisLine={{ stroke: CHART_TOKENS.border }} tickLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="v" radius={[100, 100, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="lp-card" style={{ height: 320, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, letterSpacing: "-0.02em" }}>Books by Category</h3>
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={catCounts} dataKey="count" nameKey="name" outerRadius={70} stroke="#fff" strokeWidth={2}>
                          {catCounts.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip {...TOOLTIP_STYLE} />
                        <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ ...LEGEND_STYLE, maxHeight: 72, overflowY: "auto", paddingTop: 8, width: "100%" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="lp-card">
                <ReportRow label="Total Book Stock" value={stat_b} />
                <ReportRow label="Total Active Issues" value={stat_i} />
                <ReportRow label="Total Books Overdue" value={stat_o} valueColor={CHART_TOKENS.ink} />
                <ReportRow label="Total Revenue (Fines)" value={`৳${stat_f}`} valueColor={CHART_TOKENS.ink} last />
              </div>
            </div>
          )}

          {view === "settings" && (
            <SettingsView fines={fines} />
          )}
        </main>
      </div>

      {modal === "book" && <BookModal cats={cats} data={editData as Book | null} onClose={close} onSave={saveBook} />}
      {modal === "category" && <CategoryModal data={editData as Category | null} onClose={close} onSave={saveCat} />}
      {modal === "student" && <StudentModal data={editData as Student | null} students={students} onClose={close} onSave={saveStudent} />}
      {modal === "student-view" && <StudentViewModal student={editData as unknown as Student} issues={issues} fines={fines} bookMap={bookMap} onClose={close} />}
      {modal === "issue" && <IssueModal books={books.filter((b) => b.available > 0)} students={students} issues={issues} maxIssues={getSettings().maxIssuesPerStudent} onClose={close} onSave={saveIssue} />}
      {modal === "issue-edit" && <IssueEditModal issue={editData as unknown as Issue} bookMap={bookMap} studentMap={studentMap} onClose={close} onSave={saveIssueEdit} />}
      {modal === "fine" && <FineModal data={editData as Fine | null} issues={issues} bookMap={bookMap} studentMap={studentMap} onClose={close} onSave={saveFine} />}
    </div>
  );
}

type StatTone = "info" | "active" | "success" | "warning" | "money";
const STAT_TONES: Record<StatTone, { bg: string; icoBg: string; icoColor: string; border: string }> = {
  info:    { bg: "linear-gradient(135deg,#efe6ff 0%,#f7f0ff 100%)", icoBg: "rgba(193,144,255,0.22)", icoColor: "#7a4bcc", border: "rgba(193,144,255,0.28)" },
  active:  { bg: "linear-gradient(135deg,#d9fbf1 0%,#ecfff9 100%)", icoBg: "rgba(24,240,191,0.22)",  icoColor: "#0f9877", border: "rgba(24,240,191,0.30)" },
  success: { bg: "linear-gradient(135deg,#e2fbdb 0%,#f2fff0 100%)", icoBg: "rgba(137,255,117,0.30)", icoColor: "#3f8f2b", border: "rgba(137,255,117,0.38)" },
  warning: { bg: "linear-gradient(135deg,#ffe8d6 0%,#fff4e6 100%)", icoBg: "rgba(255,159,64,0.22)",  icoColor: "#c25a12", border: "rgba(255,159,64,0.30)" },
  money:   { bg: "linear-gradient(135deg,#ffe4ef 0%,#fff1f6 100%)", icoBg: "rgba(255,120,170,0.22)", icoColor: "#b6316b", border: "rgba(255,120,170,0.30)" },
};
function StatCard({ tone, icon, num, lbl }: { tone: StatTone; icon: string; num: number | string; lbl: string }) {
  const t = STAT_TONES[tone];
  return (
    <div className="lp-card-stat" style={{ background: t.bg, borderColor: t.border }}>
      <div className="lp-stat-row">
        <div className="lp-stat-lbl">{lbl}</div>
        <div className="lp-stat-ico" style={{ background: t.icoBg, color: t.icoColor }}><i className={`fa-solid ${icon}`} /></div>
      </div>
      <div className="lp-stat-num">{num}</div>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="lp-card-stat" style={{ background: "#fff" }}>
      <div className="lp-stat-row">
        <span className="lp-skel" style={{ width: 80, height: 10 }} />
        <span className="lp-skel" style={{ width: 36, height: 36, borderRadius: 100 }} />
      </div>
      <span className="lp-skel" style={{ width: 60, height: 24, marginTop: 4 }} />
    </div>
  );
}

function ChartSkeleton({ kind }: { kind: "bar" | "pie" }) {
  if (kind === "pie") {
    return (
      <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <span className="lp-skel" style={{ width: 180, height: 180, borderRadius: "50%" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="lp-skel" style={{ width: 90, height: 10 }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ height: 260, display: "flex", alignItems: "flex-end", gap: 16, padding: "0 8px 8px" }}>
      {[70, 45, 90, 60, 30].map((h, i) => (
        <span key={i} className="lp-skel" style={{ flex: 1, height: `${h}%`, borderRadius: "100px 100px 0 0" }} />
      ))}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="lp-empty" style={{ height: 260 }}>
      <div className="lp-empty-ico"><i className={`fa-solid ${icon}`} /></div>
      <div className="lp-empty-title">{title}</div>
      {sub && <div className="lp-empty-sub">{sub}</div>}
    </div>
  );
}

function ViewHeader({ title, icon, btn }: { title: string; icon: string; btn?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <h1 style={{ fontSize: 30, fontWeight: 600, display: "flex", alignItems: "center", gap: 12, letterSpacing: "-0.03em" }}>
        <i className={`fa-solid ${icon}`} style={{ color: "#18f0bf", fontSize: 24 }} /> {title}
      </h1>
      {btn}
    </div>
  );
}

function ReportRow({ label, value, valueColor, last }: { label: string; value: React.ReactNode; valueColor?: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: last ? "none" : "1px solid #dceeeb", fontSize: 14 }}>
      <span>{label}</span>
      <strong style={{ color: valueColor }}>{value}</strong>
    </div>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
      <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#6c6e79", fontSize: 12 }} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", height: 40, borderRadius: 100, border: "1px solid var(--lp-border)", background: "#fff", padding: "0 36px 0 36px", fontSize: 13, outline: "none", color: "#181e15" }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: 100, border: "none", background: "transparent", cursor: "pointer", color: "#6c6e79" }}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      )}
    </div>
  );
}

function ResultCount({ n, total }: { n: number; total: number }) {
  return (
    <span style={{ fontSize: 12, color: "#6c6e79", fontWeight: 500, marginLeft: "auto" }}>
      {n === total ? `${total} total` : `${n} of ${total}`}
    </span>
  );
}

function IssuesTable({ issues, bookMap, studentMap, onReturn, onEdit, onDelete }: { issues: Issue[]; bookMap: Record<number, Book>; studentMap: Record<number, Student>; onReturn: (i: Issue) => void; onEdit: (i: Issue) => void; onDelete: (i: Issue) => void }) {
  return (
    <div className="lp-table-wrap">
      <table>
        <thead><tr><th>Book</th><th>Student</th><th>Issue Date</th><th>Due Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {issues.map((i) => {
            const late = daysBetween(i.due_date);
            const overdue = i.status === "Issued" && late > 0;
            const b = bookMap[i.book_id]; const s = studentMap[i.student_id];
            return (
              <tr key={i.id}>
                <td><div style={{ fontWeight: 600 }}>{b?.title || "—"}</div><div style={{ fontSize: 11, color: "#8990a2" }}>{b?.isbn}</div></td>
                <td><div style={{ fontWeight: 600 }}>{s?.name || "—"}</div><div style={{ fontSize: 11, color: "#8990a2" }}>{s?.student_id}</div></td>
                <td>{i.issue_date}</td>
                <td style={{ color: overdue ? "#dc3545" : undefined, fontWeight: overdue ? 700 : undefined }}>{i.due_date}</td>
                <td>
                  {i.status === "Returned" ? <span className="lp-badge lp-badge-green">Returned</span> :
                    overdue ? <span className="lp-badge lp-badge-red">Overdue (-{late}d)</span> :
                    <span className="lp-badge lp-badge-blue">Issued</span>}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {i.status === "Returned" ? <span style={{ color: "#28a745" }}><i className="fa-solid fa-check" /></span> :
                      overdue ? <button className="lp-btn lp-btn-danger" onClick={() => onReturn(i)}>Return & Fine</button> :
                      <button className="lp-btn lp-btn-green" onClick={() => onReturn(i)}>Return</button>}
                    <button className="lp-action-ico" title="Edit" onClick={() => onEdit(i)}><i className="fa-solid fa-pen" /></button>
                    <button className="lp-action-ico" title="Delete" onClick={() => onDelete(i)}><i className="fa-solid fa-trash" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
          {issues.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: "#8990a2" }}>No issues yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* Modals */
function ImageField({ label, title, folder, value, onChange, shape }: { label: string; title: string; folder: "students" | "books" | "logos"; value: string; onChange: (url: string) => void; shape: "circle" | "rect" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const url = await uploadTitledImage(file, title || label, folder);
      onChange(url);
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : "Upload failed";
      setErr(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const preview = value ? (
    <img src={value} alt="Preview" style={{ width: shape === "circle" ? 56 : 72, height: 56, borderRadius: shape === "circle" ? "50%" : 10, objectFit: "cover", border: "1px solid #e5e7eb", background: "#f7f7f9" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
  ) : (
    <div style={{ width: shape === "circle" ? 56 : 72, height: 56, borderRadius: shape === "circle" ? "50%" : 10, background: "#f2f2f5", border: "1px dashed #d3d5db", display: "grid", placeItems: "center", color: "#a0a3ad" }}><i className="fa-solid fa-image" /></div>
  );
  return (
    <div className="lp-input-group">
      <label>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {preview}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="lp-btn lp-btn-primary" style={{ padding: "8px 14px" }} disabled={busy} onClick={() => inputRef.current?.click()}>
              <i className={busy ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-upload"} /> {busy ? "Uploading…" : value ? "Replace" : "Upload"}
            </button>
            {value && !busy && (
              <button type="button" className="lp-btn" style={{ padding: "8px 14px", background: "#f5f5f7" }} onClick={() => onChange("")}>
                <i className="fa-solid fa-xmark" /> Remove
              </button>
            )}
          </div>
          <span style={{ fontSize: 11, color: "#8990a2" }}>Auto-converted to WebP, compressed, renamed with the title.</span>
          {err && <span style={{ fontSize: 11, color: "#c0392b" }}>{err}</span>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} />
      </div>
    </div>
  );
}

function BookModal({ cats, data, onClose, onSave }: { cats: Category[]; data: Book | null; onClose: () => void; onSave: (b: Book) => void }) {
  const [f, setF] = useState<Book>({ id: data?.id ?? 0, title: data?.title ?? "", isbn: data?.isbn ?? "", cat_id: data?.cat_id ?? (cats[0]?.id ?? null), pub_year: data?.pub_year ?? 2024, qty: data?.qty ?? 1, available: data?.available ?? 1, cover_url: data?.cover_url ?? "" });
  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}><i className="fa-solid fa-book" /> {data ? "Edit Book" : "Add Book"}</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSave(data ? f : { ...f, id: 0 } as Book); }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>ISBN</label>
              <input value={f.isbn} onChange={(e) => setF({ ...f, isbn: e.target.value })} />
            </div>
            <div className="lp-input-group" style={{ flex: 2 }}>
              <label>Title</label>
              <input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="lp-input-group" style={{ flex: 2 }}>
              <label>Category</label>
              <select value={f.cat_id ?? ""} onChange={(e) => setF({ ...f, cat_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— None —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>Pub Year</label>
              <input type="number" value={f.pub_year} onChange={(e) => setF({ ...f, pub_year: Number(e.target.value) })} />
            </div>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>Quantity</label>
              <input type="number" min={1} required value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />
            </div>
          </div>
          <ImageField
            label="Book Cover (optional)"
            title={f.title}
            folder="books"
            value={f.cover_url || ""}
            onChange={(url) => setF({ ...f, cover_url: url })}
            shape="rect"
          />
          <button type="submit" className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }}>Save Book</button>
        </form>
      </div>
    </div>
  );
}

function CategoryModal({ data, onClose, onSave }: { data: Category | null; onClose: () => void; onSave: (c: Category) => void }) {
  const [f, setF] = useState<Category>({ id: data?.id ?? 0, name: data?.name ?? "", descr: data?.descr ?? "" });
  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}><i className="fa-solid fa-tag" /> {data ? "Edit Category" : "Add Category"}</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
          <div className="lp-input-group"><label>Name</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="lp-input-group"><label>Description</label><textarea rows={3} value={f.descr} onChange={(e) => setF({ ...f, descr: e.target.value })} /></div>
          <button type="submit" className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }}>Save Category</button>
        </form>
      </div>
    </div>
  );
}

function StudentModal({ data, students, onClose, onSave }: { data: Student | null; students: Student[]; onClose: () => void; onSave: (s: Student) => void }) {
  const [f, setF] = useState<Student>({ id: data?.id ?? 0, name: data?.name ?? "", student_id: data?.student_id ?? "", email: data?.email ?? "", phone: data?.phone ?? "", image_url: data?.image_url ?? "", address: data?.address ?? "" });
  const norm = (v: string) => (v || "").trim().toLowerCase();
  const others = students.filter((s) => s.id !== (data?.id ?? 0));
  const sidMatch = f.student_id.trim() ? others.find((s) => norm(s.student_id) === norm(f.student_id)) : null;
  const emailMatch = f.email && f.email.trim() ? others.find((s) => s.email && norm(s.email) === norm(f.email)) : null;
  const phoneNorm = (v: string) => (v || "").replace(/\D/g, "");
  const phoneMatch = f.phone && phoneNorm(f.phone) ? others.find((s) => s.phone && phoneNorm(s.phone) === phoneNorm(f.phone)) : null;
  const hasConflict = Boolean(sidMatch || emailMatch || phoneMatch);
  const Warn = ({ label, match }: { label: string; match: Student | null | undefined }) => match ? (
    <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 12, background: "rgba(255,90,90,0.08)", border: "1px solid rgba(255,90,90,0.25)", color: "#c0392b", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
      <i className="fa-solid fa-triangle-exclamation" />
      <span>{label} already used by <strong>{match.name}</strong> (ID: {match.student_id}{match.email ? `, ${match.email}` : ""}{match.phone ? `, ${match.phone}` : ""})</span>
    </div>
  ) : null;
  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}><i className="fa-solid fa-user-graduate" /> {data ? "Edit Student" : "Add Student"}</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (hasConflict) return; onSave(f); }}>
          <div className="lp-input-group"><label>Full Name</label><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="lp-input-group">
            <label>Student ID</label>
            <input required value={f.student_id} onChange={(e) => setF({ ...f, student_id: e.target.value })} style={sidMatch ? { borderColor: "#e74c3c" } : undefined} />
            <Warn label="Student ID" match={sidMatch} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>Email</label>
              <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={emailMatch ? { borderColor: "#e74c3c" } : undefined} />
              <Warn label="Email" match={emailMatch} />
            </div>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>Phone</label>
              <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} style={phoneMatch ? { borderColor: "#e74c3c" } : undefined} />
              <Warn label="Phone" match={phoneMatch} />
            </div>
          </div>
          <ImageField
            label="Student Photo (optional)"
            title={f.name}
            folder="students"
            value={f.image_url || ""}
            onChange={(url) => setF({ ...f, image_url: url })}
            shape="circle"
          />
          <div className="lp-input-group">
            <label>Address</label>
            <textarea rows={2} value={f.address || ""} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Street, city, postal code…" style={{ width: "100%", padding: "10px 14px", borderRadius: 16, border: "1px solid var(--lp-border)", background: "#fff", fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
          </div>
          <button type="submit" disabled={hasConflict} className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12, opacity: hasConflict ? 0.5 : 1, cursor: hasConflict ? "not-allowed" : "pointer" }}>{hasConflict ? "Resolve conflicts to save" : "Save Student"}</button>
        </form>
      </div>
    </div>
  );
}

function StudentViewModal({ student, issues, fines, bookMap, onClose }: { student: Student; issues: Issue[]; fines: Fine[]; bookMap: Record<number, Book>; onClose: () => void }) {
  const myIssues = useMemo(
    () => issues.filter((i) => i.student_id === student.id).slice().sort((a, b) => (b.issue_date || "").localeCompare(a.issue_date || "")),
    [issues, student.id],
  );
  const myFines = useMemo(() => fines.filter((f) => f.student_id === student.id), [fines, student.id]);
  const fineByIssue = useMemo(() => {
    const m: Record<number, Fine> = {};
    for (const f of myFines) if (f.issue_id) m[f.issue_id] = f;
    return m;
  }, [myFines]);

  const activeCount = myIssues.filter((i) => i.status === "Issued").length;
  const overdueCount = myIssues.filter((i) => i.status === "Issued" && daysBetween(i.due_date) > 0).length;
  const totalFines = myFines.reduce((a, f) => a + Number(f.amount || 0), 0);
  const unpaidFines = myFines.filter((f) => f.status !== "Paid").reduce((a, f) => a + Number(f.amount || 0), 0);

  const Stat = ({ label, value, tone }: { label: string; value: string | number; tone: "info" | "warn" | "danger" | "money" }) => {
    const tones: Record<string, { bg: string; color: string; border: string }> = {
      info:   { bg: "linear-gradient(135deg,#efe6ff,#f7f0ff)", color: "#7a4bcc", border: "rgba(193,144,255,0.28)" },
      warn:   { bg: "linear-gradient(135deg,#fff0e0,#fff8ee)", color: "#c47800", border: "rgba(255,180,80,0.35)" },
      danger: { bg: "linear-gradient(135deg,#ffe4e4,#fff0f0)", color: "#c0392b", border: "rgba(255,90,90,0.30)" },
      money:  { bg: "linear-gradient(135deg,#d9fbf1,#ecfff9)", color: "#0f9877", border: "rgba(24,240,191,0.30)" },
    };
    const t = tones[tone];
    return (
      <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 16, padding: "10px 14px", flex: 1, minWidth: 110 }}>
        <div style={{ fontSize: 11, color: "#6b6f7a", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: t.color, marginTop: 2 }}>{value}</div>
      </div>
    );
  };

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose}>×</button>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 18 }}>
          <img
            src={student.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=c190ff&color=fff`}
            alt={student.name}
            style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--lp-border)" }}
          />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{student.name}</h2>
            <div style={{ fontSize: 12, color: "#6b3fbf", fontWeight: 700, marginTop: 2 }}>ID: {student.student_id}</div>
            <div style={{ fontSize: 12, color: "#8990a2", marginTop: 4, display: "flex", flexWrap: "wrap", gap: 12 }}>
              {student.email && <span><i className="fa-solid fa-envelope" /> {student.email}</span>}
              {student.phone && <span><i className="fa-solid fa-phone" /> {student.phone}</span>}
            </div>
            {student.address && (
              <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                <i className="fa-solid fa-location-dot" style={{ marginRight: 6, color: "#8990a2" }} />{student.address}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <Stat label="Issued" value={activeCount} tone="info" />
          <Stat label="Overdue" value={overdueCount} tone={overdueCount > 0 ? "danger" : "warn"} />
          <Stat label="Total Fines" value={`৳${totalFines.toFixed(2)}`} tone="money" />
          <Stat label="Unpaid" value={`৳${unpaidFines.toFixed(2)}`} tone={unpaidFines > 0 ? "danger" : "money"} />
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, color: "#333" }}>
          <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 6 }} /> Borrow History ({myIssues.length})
        </div>
        <div className="lp-table-wrap" style={{ maxHeight: 340, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Book</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Returned</th>
                <th>Status</th>
                <th>Fine</th>
              </tr>
            </thead>
            <tbody>
              {myIssues.map((i) => {
                const fine = fineByIssue[i.id];
                const late = daysBetween(i.due_date);
                const overdue = i.status === "Issued" && late > 0;
                const status = overdue ? "Overdue" : i.status;
                const badge = status === "Returned" ? "lp-badge-green" : status === "Overdue" ? "lp-badge-red" : "lp-badge-blue";
                return (
                  <tr key={i.id}>
                    <td>{bookMap[i.book_id]?.title || "—"}</td>
                    <td style={{ fontSize: 12 }}>{i.issue_date || "—"}</td>
                    <td style={{ fontSize: 12 }}>{i.due_date}</td>
                    <td style={{ fontSize: 12 }}>{i.return_date || (i.status === "Returned" ? "—" : "")}</td>
                    <td><span className={`lp-badge ${badge}`}>{status}</span></td>
                    <td>
                      {fine ? (
                        <span className={`lp-badge ${fine.status === "Paid" ? "lp-badge-green" : "lp-badge-red"}`}>
                          ৳{Number(fine.amount).toFixed(2)} · {fine.status}
                        </span>
                      ) : (
                        <span style={{ color: "#8990a2", fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {myIssues.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#8990a2" }}>No borrow history yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IssueModal({ books, students, issues, maxIssues, onClose, onSave }: { books: Book[]; students: Student[]; issues: Issue[]; maxIssues: number; onClose: () => void; onSave: (v: { book_id: number; student_id: number; due_date: string }) => void }) {
  const [book_id, setB] = useState<number>(books[0]?.id ?? 0);
  const [student_id, setS] = useState<number>(students[0]?.id ?? 0);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [due_date, setD] = useState<string>(in7);
  const activeCount = issues.filter((i) => i.student_id === student_id && i.status === "Issued").length;
  const atLimit = activeCount >= maxIssues;
  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}><i className="fa-solid fa-right-left" /> Issue Book</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (book_id == null || student_id == null || Number.isNaN(book_id) || Number.isNaN(student_id)) return; if (atLimit) return; onSave({ book_id, student_id, due_date }); }}>
          <div className="lp-input-group">
            <label>Book</label>
            <select required value={book_id} onChange={(e) => setB(Number(e.target.value))}>
              {books.length === 0 && <option value="">No books available</option>}
              {books.map((b) => <option key={b.id} value={b.id}>{b.title} — Available: {b.available}</option>)}
            </select>
          </div>
          <div className="lp-input-group">
            <label>Student</label>
            <select required value={student_id} onChange={(e) => setS(Number(e.target.value))}>
              {students.length === 0 && <option value="">No students</option>}
              {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.student_id})</option>)}
            </select>
          </div>
          <div className="lp-input-group"><label>Due Date</label><input type="date" required value={due_date} onChange={(e) => setD(e.target.value)} /></div>
          {atLimit && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: "10px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
              This student already has {activeCount} active issue(s). Maximum allowed is {maxIssues}.
            </div>
          )}
          <button type="submit" disabled={atLimit} className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12, opacity: atLimit ? 0.6 : 1, cursor: atLimit ? "not-allowed" : "pointer" }}>Issue Book</button>
        </form>
      </div>
    </div>
  );
}

function IssueEditModal({ issue, bookMap, studentMap, onClose, onSave }: { issue: Issue; bookMap: Record<number, Book>; studentMap: Record<number, Student>; onClose: () => void; onSave: (v: Issue) => void }) {
  const [f, setF] = useState<Issue>({ ...issue });
  const b = bookMap[f.book_id]; const s = studentMap[f.student_id];
  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}><i className="fa-solid fa-pen" /> Edit Issue</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
          <div className="lp-input-group"><label>Book</label><input value={b?.title || "—"} readOnly /></div>
          <div className="lp-input-group"><label>Student</label><input value={s ? `${s.name} (${s.student_id})` : "—"} readOnly /></div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>Due Date</label>
              <input type="date" required value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
            </div>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>Status</label>
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="Issued">Issued</option>
                <option value="Returned">Returned</option>
              </select>
            </div>
          </div>
          <button type="submit" className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }}>Save Changes</button>
        </form>
      </div>
    </div>
  );
}

function FineModal({ data, issues, bookMap, studentMap, onClose, onSave }: { data: Fine | null; issues: Issue[]; bookMap: Record<number, Book>; studentMap: Record<number, Student>; onClose: () => void; onSave: (v: Fine) => void }) {
  const first = issues[0];
  const [f, setF] = useState<Fine>({
    id: data?.id ?? 0,
    issue_id: data?.issue_id ?? (first?.id ?? 0),
    student_id: data?.student_id ?? (first?.student_id ?? 0),
    amount: data?.amount ?? 0,
    status: data?.status ?? "Unpaid",
  });
  const setIssue = (issue_id: number) => {
    const iss = issues.find((i) => i.id === issue_id);
    setF((prev) => ({ ...prev, issue_id, student_id: iss?.student_id ?? prev.student_id }));
  };
  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div className="lp-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose}>×</button>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}><i className="fa-solid fa-money-bill" /> {data ? "Edit Fine" : "Add Fine"}</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (!f.issue_id || !f.student_id) { alert("Select an issue"); return; } onSave(f); }}>
          <div className="lp-input-group">
            <label>Issue</label>
            <select required value={f.issue_id} onChange={(e) => setIssue(Number(e.target.value))}>
              {issues.length === 0 && <option value="">No issues available</option>}
              {issues.map((i) => {
                const b = bookMap[i.book_id]; const s = studentMap[i.student_id];
                return <option key={i.id} value={i.id}>#{i.id} — {b?.title || "—"} → {s?.name || "—"}</option>;
              })}
            </select>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>Amount (৳)</label>
              <input type="number" min={0} step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} />
            </div>
            <div className="lp-input-group" style={{ flex: 1 }}>
              <label>Status</label>
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="Unpaid">Unpaid</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
          </div>
          <button type="submit" className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }}>Save Fine</button>
        </form>
      </div>
    </div>
  );
}

/* Pagination */
function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const nums: (number | "…")[] = [];
  const push = (n: number | "…") => { if (nums[nums.length - 1] !== n) nums.push(n); };
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) push(i);
    else if (Math.abs(i - page) === 2) push("…");
  }
  const btn: React.CSSProperties = { minWidth: 36, height: 36, borderRadius: 100, border: "1px solid var(--lp-border)", background: "#fff", cursor: "pointer", fontSize: 13, padding: "0 12px", color: "#181e15" };
  const active: React.CSSProperties = { ...btn, background: "#181e15", color: "#fff", borderColor: "#181e15" };
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
      <div style={{ fontSize: 12, color: "#6c6e79" }}>Showing {from}–{to} of {total}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={btn} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous"><i className="fa-solid fa-chevron-left" /></button>
        {nums.map((n, i) => n === "…" ? <span key={i} style={{ ...btn, border: "none", background: "transparent", cursor: "default" }}>…</span> : <button key={i} style={n === page ? active : btn} onClick={() => onChange(n)}>{n}</button>)}
        <button style={btn} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next"><i className="fa-solid fa-chevron-right" /></button>
      </div>
    </div>
  );
}

/* PDF Exports */
type PdfCtx = {
  stat_b: number; stat_i: number; stat_r: number; stat_o: number; stat_f: number; stat_u: number;
  fines: Fine[]; studentMap: Record<number, Student>; issueMap: Record<number, Issue>; bookMap: Record<number, Book>;
};

function pdfHeader(doc: jsPDF, title: string, opts?: { settings?: LibrarySettings; logo?: string | null }) {
  const s = opts?.settings ?? getSettings();
  const logo = opts?.logo;
  const textX = logo ? 100 : 40;
  if (logo) {
    try { doc.addImage(logo, "PNG", 40, 30, 48, 48); } catch { /* ignore bad image */ }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(24, 30, 21);
  doc.text(s.libraryName || "Library", textX, 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(108, 110, 121);
  let y = 58;
  if (s.instituteName) { doc.text(s.instituteName, textX, y); y += 12; }
  if (s.address) { doc.text(s.address, textX, y); y += 12; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(24, 30, 21);
  doc.text(title, 40, Math.max(y + 4, 92));
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(108, 110, 121);
  doc.text(new Date().toLocaleString(), 40, Math.max(y + 18, 106));
  doc.setDrawColor(220, 238, 235); doc.line(40, Math.max(y + 24, 112), 555, Math.max(y + 24, 112));
}

function pdfStartY(settings: LibrarySettings): number {
  // Content start baseline computed the same way pdfHeader lays it out.
  let y = 58;
  if (settings.instituteName) y += 12;
  if (settings.address) y += 12;
  return Math.max(y + 34, 122);
}

function xlsxMetaHeader(settings: LibrarySettings): (string | number)[][] {
  const rows: (string | number)[][] = [];
  if (settings.libraryName) rows.push([settings.libraryName, ""]);
  if (settings.instituteName) rows.push([settings.instituteName, ""]);
  if (settings.address) rows.push([settings.address, ""]);
  rows.push(["Generated", new Date().toLocaleString()]);
  rows.push(["", ""]);
  return rows;
}

async function exportSummaryPDF(ctx: PdfCtx) {
  const settings = getSettings();
  const logo = await loadLogoDataUrl(settings.logoUrl);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  pdfHeader(doc, "Library Summary Report", { settings, logo });
  autoTable(doc, {
    startY: pdfStartY(settings),
    head: [["Metric", "Value"]],
    body: [
      ["Total Books (stock)", String(ctx.stat_b)],
      ["Currently Issued", String(ctx.stat_i)],
      ["Returned", String(ctx.stat_r)],
      ["Overdue", String(ctx.stat_o)],
      ["Fines Collected (Paid)", `Tk ${ctx.stat_f}`],
      ["Outstanding Fines (Unpaid)", `Tk ${ctx.stat_u}`],
    ],
    styles: { font: "helvetica", fontSize: 10 },
    headStyles: { fillColor: [24, 240, 191], textColor: [24, 30, 21] },
  });
  const finesBody = ctx.fines.map((f) => {
    const s = ctx.studentMap[f.student_id];
    const iss = ctx.issueMap[f.issue_id];
    const bk = iss ? ctx.bookMap[iss.book_id] : null;
    return [String(f.id), s?.name || "—", bk?.title || "—", `Tk ${Number(f.amount)}`, f.status];
  });
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24,
    head: [["#", "Student", "Book", "Amount", "Status"]],
    body: finesBody.length ? finesBody : [["—", "No fines recorded", "", "", ""]],
    styles: { font: "helvetica", fontSize: 9 },
    headStyles: { fillColor: [193, 144, 255], textColor: [24, 30, 21] },
  });
  doc.save(`library-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function exportFinesPDF(ctx: { fines: Fine[]; studentMap: Record<number, Student>; issueMap: Record<number, Issue>; bookMap: Record<number, Book> }) {
  const settings = getSettings();
  const logo = await loadLogoDataUrl(settings.logoUrl);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  pdfHeader(doc, "Fines Breakdown Report", { settings, logo });
  const total = ctx.fines.reduce((a, f) => a + Number(f.amount || 0), 0);
  const paid = ctx.fines.filter((f) => f.status === "Paid").reduce((a, f) => a + Number(f.amount || 0), 0);
  autoTable(doc, {
    startY: pdfStartY(settings),
    head: [["Summary", "Amount"]],
    body: [["Total Fines", `Tk ${total}`], ["Paid", `Tk ${paid}`], ["Unpaid", `Tk ${total - paid}`]],
    styles: { font: "helvetica", fontSize: 10 },
    headStyles: { fillColor: [24, 240, 191], textColor: [24, 30, 21] },
  });
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20,
    head: [["#", "Student", "Book", "Days Late", "Rate", "Amount", "Status"]],
    body: ctx.fines.map((f) => {
      const s = ctx.studentMap[f.student_id];
      const iss = ctx.issueMap[f.issue_id];
      const bk = iss ? ctx.bookMap[iss.book_id] : null;
      const late = iss ? daysBetween(iss.due_date) : 0;
      return [String(f.id), s?.name || "—", bk?.title || "—", String(late), `Tk ${settings.fineRate}/day`, `Tk ${Number(f.amount)}`, f.status];
    }),
    styles: { font: "helvetica", fontSize: 9 },
    headStyles: { fillColor: [193, 144, 255], textColor: [24, 30, 21] },
  });
  doc.save(`fines-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function exportTablePDF(title: string, filename: string, head: string[], body: (string | number)[][], summary?: [string, string | number][]) {
  const settings = getSettings();
  const logo = await loadLogoDataUrl(settings.logoUrl);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  pdfHeader(doc, title, { settings, logo });
  let startY = pdfStartY(settings);
  if (summary && summary.length) {
    autoTable(doc, {
      startY,
      head: [["Summary", "Value"]],
      body: summary.map(([k, v]) => [k, String(v)]),
      styles: { font: "helvetica", fontSize: 10 },
      headStyles: { fillColor: [193, 144, 255], textColor: [24, 30, 21] },
    });
    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }
  autoTable(doc, {
    startY,
    head: [head],
    body: body.length ? body.map((r) => r.map((c) => String(c))) : [head.map(() => "—")],
    styles: { font: "helvetica", fontSize: 9 },
    headStyles: { fillColor: [24, 240, 191], textColor: [24, 30, 21] },
  });
  doc.save(`${filename}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportTableXLSX(title: string, filename: string, head: string[], body: (string | number)[][], summary?: [string, string | number][]) {
  const settings = getSettings();
  const wb = XLSX.utils.book_new();
  const meta = xlsxMetaHeader(settings);
  if (summary && summary.length) {
    const sws = XLSX.utils.aoa_to_sheet([...meta, ["Summary", "Value"], ...summary]);
    XLSX.utils.book_append_sheet(wb, sws, "Summary");
  }
  const ws = XLSX.utils.aoa_to_sheet([...meta, head, ...body]);
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportFinesXLSX(ctx: { fines: Fine[]; studentMap: Record<number, Student>; issueMap: Record<number, Issue>; bookMap: Record<number, Book> }) {
  const settings = getSettings();
  const meta = xlsxMetaHeader(settings);
  const total = ctx.fines.reduce((a, f) => a + Number(f.amount || 0), 0);
  const paid = ctx.fines.filter((f) => f.status === "Paid").reduce((a, f) => a + Number(f.amount || 0), 0);
  const summary = XLSX.utils.aoa_to_sheet([...meta, ["Summary", "Amount"], ["Total Fines", total], ["Paid", paid], ["Unpaid", total - paid], ["Fine Rate (per day)", settings.fineRate]]);
  const rows = ctx.fines.map((f) => {
    const s = ctx.studentMap[f.student_id];
    const iss = ctx.issueMap[f.issue_id];
    const bk = iss ? ctx.bookMap[iss.book_id] : null;
    const late = iss ? daysBetween(iss.due_date) : 0;
    return [f.id, s?.name || "—", bk?.title || "—", late, `Tk ${settings.fineRate}/day`, Number(f.amount), f.status];
  });
  const details = XLSX.utils.aoa_to_sheet([...meta, ["#", "Student", "Book", "Days Late", "Rate", "Amount", "Status"], ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summary, "Summary");
  XLSX.utils.book_append_sheet(wb, details, "Fines");
  XLSX.writeFile(wb, `fines-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportSummaryXLSX(ctx: PdfCtx) {
  const settings = getSettings();
  const meta = xlsxMetaHeader(settings);
  const summary = XLSX.utils.aoa_to_sheet([
    ...meta,
    ["Metric", "Value"],
    ["Total Books (stock)", ctx.stat_b],
    ["Currently Issued", ctx.stat_i],
    ["Returned", ctx.stat_r],
    ["Overdue", ctx.stat_o],
    ["Fines Collected (Paid)", ctx.stat_f],
    ["Outstanding Fines (Unpaid)", ctx.stat_u],
    ["Fine Rate (per day)", settings.fineRate],
  ]);
  const rows = ctx.fines.map((f) => {
    const s = ctx.studentMap[f.student_id];
    const iss = ctx.issueMap[f.issue_id];
    const bk = iss ? ctx.bookMap[iss.book_id] : null;
    return [f.id, s?.name || "—", bk?.title || "—", Number(f.amount), f.status];
  });
  const fines = XLSX.utils.aoa_to_sheet([...meta, ["#", "Student", "Book", "Amount", "Status"], ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summary, "Summary");
  XLSX.utils.book_append_sheet(wb, fines, "Fines");
  XLSX.writeFile(wb, `library-summary-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

type AllReportsCtx = PdfCtx & {
  books: Book[]; cats: Category[]; students: Student[]; issues: Issue[];
  catMap: Record<number, string>;
};

async function exportAllReportsPDF(ctx: AllReportsCtx) {
  const settings = getSettings();
  const logo = await loadLogoDataUrl(settings.logoUrl);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  pdfHeader(doc, "Library Full Report", { settings, logo });
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  autoTable(doc, {
    startY: pdfStartY(settings),
    head: [["Summary", "Value"]],
    body: [
      ["Total Books (stock)", String(ctx.stat_b)],
      ["Currently Issued", String(ctx.stat_i)],
      ["Returned", String(ctx.stat_r)],
      ["Overdue", String(ctx.stat_o)],
      ["Fines Collected (Paid)", `Tk ${ctx.stat_f}`],
      ["Outstanding Fines (Unpaid)", `Tk ${ctx.stat_u}`],
      ["Categories", String(ctx.cats.length)],
      ["Students", String(ctx.students.length)],
      ["Fines (records)", String(ctx.fines.length)],
      ["Fine Rate (per day)", `Tk ${settings.fineRate}`],
    ],
    styles: { font: "helvetica", fontSize: 10 },
    headStyles: { fillColor: [24, 240, 191], textColor: [24, 30, 21] },
  });

  const section = (title: string, head: string[], body: (string | number)[][]) => {
    doc.addPage();
    pdfHeader(doc, title, { settings, logo });
    autoTable(doc, {
      startY: pdfStartY(settings),
      head: [head],
      body: body.length ? body.map((r) => r.map((c) => String(c))) : [head.map(() => "—")],
      styles: { font: "helvetica", fontSize: 9 },
      headStyles: { fillColor: [193, 144, 255], textColor: [24, 30, 21] },
    });
  };

  section("Books", ["#", "Title", "ISBN", "Category", "Year", "Qty", "Available"],
    ctx.books.map((b) => [b.id, b.title, b.isbn || "—", ctx.catMap[b.cat_id || 0] || "—", b.pub_year ?? "—", b.qty ?? 0, b.available ?? 0]));
  section("Categories", ["#", "Name", "Description"],
    ctx.cats.map((c) => [c.id, c.name, c.descr || "—"]));
  section("Students", ["#", "Student ID", "Name", "Email", "Phone"],
    ctx.students.map((s) => [s.id, s.student_id, s.name, s.email || "—", s.phone || "—"]));
  section("Book Issues", ["#", "Book", "Student", "Issue Date", "Due Date", "Status"],
    ctx.issues.map((i) => [i.id, ctx.bookMap[i.book_id]?.title || "—", ctx.studentMap[i.student_id]?.name || "—", i.issue_date || "—", i.due_date, i.status || "—"]));
  const overdue = ctx.issues.filter((i) => i.status === "Issued" && daysBetween(i.due_date) > 0);
  section("Overdue", ["#", "Book", "Student", "Due Date", "Days Late"],
    overdue.map((i) => [i.id, ctx.bookMap[i.book_id]?.title || "—", ctx.studentMap[i.student_id]?.name || "—", i.due_date, daysBetween(i.due_date)]));
  section("Fines", ["#", "Student", "Book", "Amount", "Status"],
    ctx.fines.map((f) => {
      const s = ctx.studentMap[f.student_id];
      const iss = ctx.issueMap[f.issue_id];
      const bk = iss ? ctx.bookMap[iss.book_id] : null;
      return [f.id, s?.name || "—", bk?.title || "—", `Tk ${Number(f.amount)}`, f.status || "—"];
    }));

  void finalY;
  doc.save(`library-full-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportAllReportsXLSX(ctx: AllReportsCtx) {
  const settings = getSettings();
  const meta = xlsxMetaHeader(settings);
  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ...meta,
    ["Metric", "Value"],
    ["Total Books (stock)", ctx.stat_b],
    ["Currently Issued", ctx.stat_i],
    ["Returned", ctx.stat_r],
    ["Overdue", ctx.stat_o],
    ["Fines Collected (Paid)", ctx.stat_f],
    ["Outstanding Fines (Unpaid)", ctx.stat_u],
    ["Categories", ctx.cats.length],
    ["Students", ctx.students.length],
    ["Fines (records)", ctx.fines.length],
    ["Fine Rate (per day)", settings.fineRate],
  ]);
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  const booksSheet = XLSX.utils.aoa_to_sheet([
    ["#", "Title", "ISBN", "Category", "Year", "Qty", "Available"],
    ...ctx.books.map((b) => [b.id, b.title, b.isbn || "—", ctx.catMap[b.cat_id || 0] || "—", b.pub_year ?? "—", b.qty ?? 0, b.available ?? 0]),
  ]);
  XLSX.utils.book_append_sheet(wb, booksSheet, "Books");

  const catsSheet = XLSX.utils.aoa_to_sheet([
    ["#", "Name", "Description"],
    ...ctx.cats.map((c) => [c.id, c.name, c.descr || "—"]),
  ]);
  XLSX.utils.book_append_sheet(wb, catsSheet, "Categories");

  const studentsSheet = XLSX.utils.aoa_to_sheet([
    ["#", "Student ID", "Name", "Email", "Phone"],
    ...ctx.students.map((s) => [s.id, s.student_id, s.name, s.email || "—", s.phone || "—"]),
  ]);
  XLSX.utils.book_append_sheet(wb, studentsSheet, "Students");

  const issuesSheet = XLSX.utils.aoa_to_sheet([
    ["#", "Book", "Student", "Issue Date", "Due Date", "Status"],
    ...ctx.issues.map((i) => [i.id, ctx.bookMap[i.book_id]?.title || "—", ctx.studentMap[i.student_id]?.name || "—", i.issue_date || "—", i.due_date, i.status || "—"]),
  ]);
  XLSX.utils.book_append_sheet(wb, issuesSheet, "Book Issues");

  const overdue = ctx.issues.filter((i) => i.status === "Issued" && daysBetween(i.due_date) > 0);
  const overdueSheet = XLSX.utils.aoa_to_sheet([
    ["#", "Book", "Student", "Due Date", "Days Late"],
    ...overdue.map((i) => [i.id, ctx.bookMap[i.book_id]?.title || "—", ctx.studentMap[i.student_id]?.name || "—", i.due_date, daysBetween(i.due_date)]),
  ]);
  XLSX.utils.book_append_sheet(wb, overdueSheet, "Overdue");

  const finesSheet = XLSX.utils.aoa_to_sheet([
    ["#", "Student", "Book", "Amount", "Status"],
    ...ctx.fines.map((f) => {
      const s = ctx.studentMap[f.student_id];
      const iss = ctx.issueMap[f.issue_id];
      const bk = iss ? ctx.bookMap[iss.book_id] : null;
      return [f.id, s?.name || "—", bk?.title || "—", Number(f.amount), f.status || "—"];
    }),
  ]);
  XLSX.utils.book_append_sheet(wb, finesSheet, "Fines");

  XLSX.writeFile(wb, `library-full-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* Settings View */
function SettingsView({ fines }: { fines: Fine[] }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [origEmail, setOrigEmail] = useState("");
  const [origName, setOrigName] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [photoMsg, setPhotoMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email || ""); setOrigEmail(u.email || "");
      const n = (u.user_metadata?.display_name as string) || (u.user_metadata?.full_name as string) || "";
      setName(n); setOrigName(n);
      setPhotoUrl((u.user_metadata?.librarian_photo_url as string) || "");
    });
  }, []);

  const updatePhoto = async (url: string) => {
    setPhotoMsg(null);
    const prev = photoUrl;
    setPhotoUrl(url);
    window.dispatchEvent(new CustomEvent("lp-librarian-photo-change", { detail: url }));
    const { error } = await supabase.auth.updateUser({ data: { librarian_photo_url: url } });
    if (error) {
      setPhotoUrl(prev);
      window.dispatchEvent(new CustomEvent("lp-librarian-photo-change", { detail: prev }));
      setPhotoMsg({ kind: "err", text: error.message });
    } else {
      setPhotoMsg({ kind: "ok", text: url ? "Profile photo updated." : "Profile photo removed." });
    }
  };

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setMsg(null);
    try {
      const updates: Parameters<typeof supabase.auth.updateUser>[0] = {};
      if (name !== origName) updates.data = { display_name: name };
      if (email !== origEmail) updates.email = email;
      if (pw1 || pw2) {
        if (pw1 !== pw2) throw new Error("Passwords do not match");
        if (pw1.length < 6) throw new Error("Password must be at least 6 characters");
        updates.password = pw1;
      }
      if (Object.keys(updates).length === 0) { setMsg({ kind: "ok", text: "Nothing to update." }); return; }
      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      setOrigName(name); setOrigEmail(email); setPw1(""); setPw2("");
      setMsg({ kind: "ok", text: email !== origEmail ? "Saved. Check your inbox to confirm the new email." : "Account updated successfully." });
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally { setSaving(false); }
  };

  const [sys, setSys] = useState<LibrarySettings>(() => getSettings());
  const [instMsg, setInstMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [libMsg, setLibMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const totalPaid = fines.filter((f) => f.status === "Paid").reduce((a, f) => a + Number(f.amount || 0), 0);
  const totalUnpaid = fines.filter((f) => f.status !== "Paid").reduce((a, f) => a + Number(f.amount || 0), 0);

  const persistSettings = (overrides: Partial<LibrarySettings>) => {
    const current = getSettings();
    const next: LibrarySettings = { ...current, ...overrides };
    saveSettings(next);
    setSys(next);
    return next;
  };

  const saveInstitute = (e: React.FormEvent) => {
    e.preventDefault();
    setInstMsg(null);
    persistSettings({
      instituteName: sys.instituteName.trim().slice(0, 120),
      libraryName: sys.libraryName.trim().slice(0, 120) || DEFAULT_SETTINGS.libraryName,
      logoUrl: sys.logoUrl.trim(),
      address: sys.address.trim().slice(0, 300),
    });
    setInstMsg({ kind: "ok", text: "Institute settings saved successfully." });
  };

  const saveLibrary = (e: React.FormEvent) => {
    e.preventDefault();
    setLibMsg(null);
    const rate = Number(sys.fineRate);
    if (!Number.isFinite(rate) || rate < 0) { setLibMsg({ kind: "err", text: "Fine rate must be a non-negative number." }); return; }
    const maxIssues = Math.floor(Number(sys.maxIssuesPerStudent));
    if (!Number.isFinite(maxIssues) || maxIssues < 1) { setLibMsg({ kind: "err", text: "Maximum book issues must be at least 1." }); return; }
    persistSettings({ fineRate: rate, maxIssuesPerStudent: maxIssues });
    setLibMsg({ kind: "ok", text: "Library settings saved successfully." });
  };

  return (
    <div className="lp-view">
      <ViewHeader title="Settings" icon="fa-gear" />
      <div className="lp-grid-2" style={{ alignItems: "start" }}>
        <div className="lp-card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Account Settings</h3>
          <p style={{ fontSize: 12, color: "#6c6e79", marginBottom: 16 }}>Update your account name, email, and password.</p>
          <form onSubmit={saveAccount}>
            <ImageField
              label="Librarian Profile Photo"
              title={name || "librarian"}
              folder="logos"
              value={photoUrl}
              onChange={updatePhoto}
              shape="circle"
            />
            {photoMsg && <div style={{ padding: "10px 14px", borderRadius: 12, marginBottom: 12, fontSize: 13, background: photoMsg.kind === "ok" ? "rgba(24,240,191,0.15)" : "rgba(220,53,69,0.12)", color: photoMsg.kind === "ok" ? "#0f9877" : "#b3282b" }}>{photoMsg.text}</div>}
            <div className="lp-input-group"><label>Librarian Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
            <div className="lp-input-group"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div style={{ display: "flex", gap: 12 }}>
              <div className="lp-input-group" style={{ flex: 1 }}><label>New Password</label><input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} placeholder="Leave blank to keep" autoComplete="new-password" /></div>
              <div className="lp-input-group" style={{ flex: 1 }}><label>Confirm Password</label><input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" /></div>
            </div>
            {msg && <div style={{ padding: "10px 14px", borderRadius: 12, marginBottom: 12, fontSize: 13, background: msg.kind === "ok" ? "rgba(24,240,191,0.15)" : "rgba(220,53,69,0.12)", color: msg.kind === "ok" ? "#0f9877" : "#b3282b" }}>{msg.text}</div>}
            <button type="submit" disabled={saving} className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }}>
              <i className="fa-solid fa-floppy-disk" /> {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </div>

        <div className="lp-card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Institute Settings</h3>
          <p style={{ fontSize: 12, color: "#6c6e79", marginBottom: 16 }}>Institute identity used across the app and exports.</p>
          <form onSubmit={saveInstitute}>
            <div className="lp-input-group">
              <label>Institute Name</label>
              <input value={sys.instituteName} maxLength={120}
                onChange={(e) => setSys({ ...sys, instituteName: e.target.value })} placeholder="e.g. Springfield University" />
            </div>
            <div className="lp-input-group">
              <label>Library Name</label>
              <input value={sys.libraryName} maxLength={120}
                onChange={(e) => setSys({ ...sys, libraryName: e.target.value })} placeholder="e.g. Central Library" />
            </div>
            <ImageField
              label="Library Logo"
              title={sys.libraryName || sys.instituteName || "logo"}
              folder="logos"
              value={sys.logoUrl}
              onChange={(url) => setSys({ ...sys, logoUrl: url })}
              shape="rect"
            />
            <div className="lp-input-group">
              <label>Address</label>
              <input value={sys.address} maxLength={300}
                onChange={(e) => setSys({ ...sys, address: e.target.value })} placeholder="Street, City, Country" />
            </div>
            {instMsg && <div style={{ padding: "10px 14px", borderRadius: 12, marginBottom: 12, fontSize: 13, background: instMsg.kind === "ok" ? "rgba(24,240,191,0.15)" : "rgba(220,53,69,0.12)", color: instMsg.kind === "ok" ? "#0f9877" : "#b3282b" }}>{instMsg.text}</div>}
            <button type="submit" className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }}>
              <i className="fa-solid fa-floppy-disk" /> Save Institute Settings
            </button>
          </form>
        </div>

        <div className="lp-card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Library Settings</h3>
          <p style={{ fontSize: 12, color: "#6c6e79", marginBottom: 16 }}>Circulation rules applied to fines and book issues.</p>
          <form onSubmit={saveLibrary}>
            <div className="lp-input-group">
              <label>Fine Rate (৳ per day)</label>
              <input type="number" min={0} step="0.5" value={sys.fineRate}
                onChange={(e) => setSys({ ...sys, fineRate: Number(e.target.value) })} />
            </div>
            <div className="lp-input-group">
              <label>Maximum Book Issues Per Student</label>
              <input type="number" min={1} step="1" value={sys.maxIssuesPerStudent}
                onChange={(e) => setSys({ ...sys, maxIssuesPerStudent: Number(e.target.value) })} />
            </div>
            {libMsg && <div style={{ padding: "10px 14px", borderRadius: 12, marginBottom: 12, fontSize: 13, background: libMsg.kind === "ok" ? "rgba(24,240,191,0.15)" : "rgba(220,53,69,0.12)", color: libMsg.kind === "ok" ? "#0f9877" : "#b3282b" }}>{libMsg.text}</div>}
            <button type="submit" className="lp-btn lp-btn-primary" style={{ width: "100%", justifyContent: "center", padding: 12 }}>
              <i className="fa-solid fa-floppy-disk" /> Save Library Settings
            </button>
          </form>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
            <div style={{ padding: 14, borderRadius: 16, background: "linear-gradient(135deg,#e2fbdb 0%,#f2fff0 100%)", border: "1px solid rgba(137,255,117,0.38)" }}>
              <div style={{ fontSize: 11, color: "#6c6e79", fontWeight: 600, textTransform: "uppercase" }}>Fines Collected</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>৳{totalPaid}</div>
            </div>
            <div style={{ padding: 14, borderRadius: 16, background: "linear-gradient(135deg,#ffe4ef 0%,#fff1f6 100%)", border: "1px solid rgba(255,120,170,0.3)" }}>
              <div style={{ fontSize: 11, color: "#6c6e79", fontWeight: 600, textTransform: "uppercase" }}>Outstanding</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>৳{totalUnpaid}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#6c6e79", marginTop: 14, lineHeight: 1.5 }}>
            Formula: <strong style={{ color: "#181e15" }}>fine = days_late × ৳{sys.fineRate}</strong>. Overdue is calculated from <em>today − due_date</em> for any issue still in the "Issued" state.
          </div>
        </div>
      </div>

    </div>
  );
}
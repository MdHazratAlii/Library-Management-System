// Local IndexedDB mirror of the Supabase tables + an outbox queue for offline mutations.
// Reads in the app come from here; writes hit here first and then get pushed to Supabase.
import Dexie, { type Table } from "dexie";

export type SyncTable = "books" | "categories" | "students" | "book_issues" | "fines";

export type LocalMeta = {
  // Row is present in Dexie but not yet confirmed by Supabase.
  _dirty?: 0 | 1;
  // Tombstone: locally deleted, waiting to be pushed. Not returned by queries.
  _deleted?: 0 | 1;
  // Server timestamp used for delta pulls. Missing for rows created offline.
  updated_at?: string;
};

export type LCategory = LocalMeta & { id: number; name: string; descr: string };
export type LBook = LocalMeta & { id: number; title: string; author: string; isbn: string; cat_id: number | null; pub_year: number; qty: number; available: number; cover_url?: string };
export type LStudent = LocalMeta & { id: number; name: string; student_id: string; email: string; phone: string; image_url: string; address?: string };
export type LIssue = LocalMeta & { id: number; book_id: number; student_id: number; issue_date: string; due_date: string; status: string; return_date?: string | null };
export type LFine = LocalMeta & { id: number; issue_id: number; student_id: number; amount: number; status: string };

export type OutboxOp = "insert" | "update" | "delete";
export type OutboxEntry = {
  id?: number;
  table: SyncTable;
  op: OutboxOp;
  // For inserts: the temp negative id we assigned locally, so the sync engine
  // can rewrite FK references in later queued entries once the real id lands.
  tempId?: number;
  // For updates/deletes: the target row id (may be temp if it was never synced).
  rowId?: number;
  payload: Record<string, unknown>;
  createdAt: number;
  tries: number;
  lastError?: string;
};

export type MetaKV = { key: string; value: string };

class LibraryDB extends Dexie {
  books!: Table<LBook, number>;
  categories!: Table<LCategory, number>;
  students!: Table<LStudent, number>;
  book_issues!: Table<LIssue, number>;
  fines!: Table<LFine, number>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaKV, string>;

  constructor() {
    super("library-pro");
    this.version(1).stores({
      books: "id, cat_id, updated_at",
      categories: "id, updated_at",
      students: "id, updated_at",
      book_issues: "id, book_id, student_id, status, updated_at",
      fines: "id, issue_id, student_id, status, updated_at",
      outbox: "++id, table, createdAt",
      meta: "key",
    });
  }
}

// Guard for SSR — Dexie touches indexedDB at construction.
let _db: LibraryDB | null = null;
export function db(): LibraryDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment");
  }
  if (!_db) _db = new LibraryDB();
  return _db;
}

export function isBrowser(): boolean {
  return typeof indexedDB !== "undefined";
}

// Temp IDs for offline-created rows: large negative integers so they never
// collide with the Supabase-assigned positive PKs.
let tempCounter = -(Date.now() % 1_000_000_000);
export function nextTempId(): number {
  tempCounter -= 1;
  return tempCounter;
}

// Simple pub/sub so React components can refresh after background sync.
type Listener = () => void;
const listeners = new Set<Listener>();
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitLocalChange() {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}
// Repository: the app calls these instead of supabase.from(...).
// Each write hits IndexedDB immediately, appends to the outbox, and kicks the
// sync engine. Reads always come from IndexedDB.
import { db, emitLocalChange, nextTempId, type SyncTable, type LBook, type LCategory, type LStudent, type LIssue, type LFine } from "./schema";
import { kickSync } from "./sync";

function nowIso(): string { return new Date().toISOString(); }

async function enqueue(entry: {
  table: SyncTable;
  op: "insert" | "update" | "delete";
  tempId?: number;
  rowId?: number;
  payload: Record<string, unknown>;
}) {
  await db().outbox.add({
    ...entry,
    createdAt: Date.now(),
    tries: 0,
  });
}

// ---------------- Reads ----------------
// Return live rows minus tombstones; UI sorts/filters as before.

async function liveList<T extends { _deleted?: 0 | 1 }>(table: SyncTable): Promise<T[]> {
  const rows = (await db().table(table).toArray()) as T[];
  return rows.filter((r) => !r._deleted);
}

export async function listBooks(): Promise<LBook[]> { return liveList<LBook>("books"); }
export async function listCategories(): Promise<LCategory[]> { return liveList<LCategory>("categories"); }
export async function listStudents(): Promise<LStudent[]> { return liveList<LStudent>("students"); }
export async function listIssues(): Promise<LIssue[]> { return liveList<LIssue>("book_issues"); }
export async function listFines(): Promise<LFine[]> { return liveList<LFine>("fines"); }

// ---------------- Writes ----------------
// All optimistic: mutate Dexie, enqueue, then trigger a background push.

async function insertRow<T extends { id: number }>(table: SyncTable, data: Omit<T, "id">): Promise<T> {
  const tempId = nextTempId();
  const row = { ...(data as object), id: tempId, _dirty: 1 as const, updated_at: nowIso() } as T;
  await db().table(table).put(row);
  await enqueue({ table, op: "insert", tempId, payload: data as Record<string, unknown> });
  emitLocalChange();
  kickSync();
  return row;
}

async function updateRow<T extends { id: number }>(table: SyncTable, id: number, patch: Partial<T>): Promise<void> {
  const existing = (await db().table(table).get(id)) as T | undefined;
  if (!existing) return;
  const next = { ...existing, ...patch, _dirty: 1 as const, updated_at: nowIso() };
  await db().table(table).put(next);
  await enqueue({ table, op: "update", rowId: id, payload: patch as Record<string, unknown> });
  emitLocalChange();
  kickSync();
}

async function deleteRow(table: SyncTable, id: number): Promise<void> {
  // If the row was never pushed (still has a temp id), drop it and any pending
  // insert/update entries — nothing to tell the server.
  if (id < 0) {
    await db().table(table).delete(id);
    const pending = await db().outbox.where("table").equals(table).toArray();
    const toDrop = pending
      .filter((p) => p.tempId === id || p.rowId === id)
      .map((p) => p.id!)
      .filter((x): x is number => typeof x === "number");
    if (toDrop.length) await db().outbox.bulkDelete(toDrop);
    emitLocalChange();
    return;
  }
  // Real id: mark tombstone locally, queue the delete.
  const existing = await db().table(table).get(id);
  if (existing) {
    await db().table(table).put({ ...existing, _deleted: 1, _dirty: 1, updated_at: nowIso() });
  }
  await enqueue({ table, op: "delete", rowId: id, payload: { id } });
  emitLocalChange();
  kickSync();
}

// Typed convenience wrappers used by LibraryDashboard.

export const repo = {
  // Books
  insertBook: (b: Omit<LBook, "id" | "_dirty" | "_deleted" | "updated_at">) => insertRow<LBook>("books", b),
  updateBook: (id: number, patch: Partial<LBook>) => updateRow<LBook>("books", id, patch),
  deleteBook: (id: number) => deleteRow("books", id),

  // Categories
  insertCategory: (c: Omit<LCategory, "id" | "_dirty" | "_deleted" | "updated_at">) => insertRow<LCategory>("categories", c),
  updateCategory: (id: number, patch: Partial<LCategory>) => updateRow<LCategory>("categories", id, patch),
  deleteCategory: (id: number) => deleteRow("categories", id),

  // Students
  insertStudent: (s: Omit<LStudent, "id" | "_dirty" | "_deleted" | "updated_at">) => insertRow<LStudent>("students", s),
  updateStudent: (id: number, patch: Partial<LStudent>) => updateRow<LStudent>("students", id, patch),
  deleteStudent: (id: number) => deleteRow("students", id),

  // Issues
  insertIssue: (i: Omit<LIssue, "id" | "_dirty" | "_deleted" | "updated_at">) => insertRow<LIssue>("book_issues", i),
  updateIssue: (id: number, patch: Partial<LIssue>) => updateRow<LIssue>("book_issues", id, patch),
  deleteIssue: (id: number) => deleteRow("book_issues", id),

  // Fines
  insertFine: (f: Omit<LFine, "id" | "_dirty" | "_deleted" | "updated_at">) => insertRow<LFine>("fines", f),
  updateFine: (id: number, patch: Partial<LFine>) => updateRow<LFine>("fines", id, patch),
  deleteFine: (id: number) => deleteRow("fines", id),

  // Delete every fine that references a specific issue (used when deleting an issue).
  deleteFinesForIssue: async (issue_id: number) => {
    const fines = await db().fines.where("issue_id").equals(issue_id).toArray();
    for (const f of fines) {
      if (f.id != null) await deleteRow("fines", f.id);
    }
  },
};

export async function outboxCount(): Promise<number> {
  try { return await db().outbox.count(); } catch { return 0; }
}
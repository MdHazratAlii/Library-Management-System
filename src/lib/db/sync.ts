// Sync engine: pulls deltas from Supabase into IndexedDB, and drains the
// outbox (offline writes) back to Supabase. Runs on the client only.
import { supabase } from "@/integrations/supabase/client";
import { db, emitLocalChange, isBrowser, type SyncTable, type OutboxEntry } from "./schema";

const PULL_TABLES: SyncTable[] = ["categories", "books", "students", "book_issues", "fines"];

// Foreign key columns in each table, so we can rewrite temp ids -> real ids
// after a dependency insert lands on the server.
const FK_COLUMNS: Record<SyncTable, string[]> = {
  books: ["cat_id"],
  categories: [],
  students: [],
  book_issues: ["book_id", "student_id"],
  fines: ["issue_id", "student_id"],
};

let syncing = false;
let pendingKick = false;
let started = false;
let pullTimer: ReturnType<typeof setInterval> | null = null;

async function getMeta(key: string): Promise<string | undefined> {
  const row = await db().meta.get(key);
  return row?.value;
}
async function setMeta(key: string, value: string): Promise<void> {
  await db().meta.put({ key, value });
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

// ---------------- PULL ----------------

async function pullTable(table: SyncTable): Promise<void> {
  const watermark = (await getMeta(`lastPull:${table}`)) || "1970-01-01T00:00:00Z";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .gt("updated_at", watermark)
    .order("updated_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  if (!data || data.length === 0) return;

  await db().transaction("rw", db().table(table), async () => {
    for (const remote of data as Array<Record<string, unknown>>) {
      const id = remote.id as number;
      const local = await db().table(table).get(id);
      // If we have local dirty edits for this row, keep them; the outbox will
      // push our version. Otherwise overwrite with the server copy.
      if (local && (local._dirty === 1 || local._deleted === 1)) continue;
      await db().table(table).put(remote);
    }
  });
  // Advance watermark to newest server updated_at seen.
  const newest = (data as unknown as Array<{ updated_at?: string }>).reduce((max, r) => {
    const t = r.updated_at ?? "";
    return t > max ? t : max;
  }, watermark);
  await setMeta(`lastPull:${table}`, newest);
}

export async function pullAll(): Promise<void> {
  if (!isBrowser() || !isOnline()) return;
  for (const t of PULL_TABLES) {
    try { await pullTable(t); } catch (err) { console.warn("[sync] pull failed", t, err); }
  }
  emitLocalChange();
}

// ---------------- PUSH ----------------

// Strip our local-only columns before sending to Supabase.
function cleanPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === "_dirty" || k === "_deleted" || k === "updated_at" || k === "id") continue;
    out[k] = v;
  }
  return out;
}

// Rewrite any FK values in this payload that still point at a temp id we've
// since resolved to a real id.
function rewriteFks(table: SyncTable, payload: Record<string, unknown>, tempToReal: Map<number, number>): Record<string, unknown> {
  const cols = FK_COLUMNS[table];
  if (!cols.length) return payload;
  const out = { ...payload };
  for (const col of cols) {
    const v = out[col];
    if (typeof v === "number" && v < 0 && tempToReal.has(v)) {
      out[col] = tempToReal.get(v)!;
    }
  }
  return out;
}

// After an insert succeeds and we get the real id back, replace the temp-id
// row in Dexie with the server row and rewrite FKs in any dependent rows.
async function applyInsertResolution(table: SyncTable, tempId: number, serverRow: Record<string, unknown>) {
  await db().transaction("rw", db().tables, async () => {
    await db().table(table).delete(tempId);
    await db().table(table).put(serverRow);
    const realId = serverRow.id as number;
    // Rewrite FKs in every other local table.
    for (const other of PULL_TABLES) {
      const cols = FK_COLUMNS[other];
      if (!cols.length) continue;
      const rows = await db().table(other).toArray();
      for (const row of rows) {
        let changed = false;
        for (const col of cols) {
          if (row[col] === tempId) { row[col] = realId; changed = true; }
        }
        if (changed) await db().table(other).put(row);
      }
    }
  });
}

export async function pushOutbox(): Promise<void> {
  if (!isBrowser() || !isOnline()) return;
  const entries = await db().outbox.orderBy("id").toArray();
  if (entries.length === 0) return;
  const tempToReal = new Map<number, number>();

  for (const entry of entries) {
    try {
      const payload = cleanPayload(rewriteFks(entry.table, entry.payload, tempToReal));

      if (entry.op === "insert") {
        const { data, error } = await supabase.from(entry.table).insert(payload as never).select().single();
        if (error) throw error;
        const serverRow = data as Record<string, unknown>;
        if (entry.tempId != null) {
          tempToReal.set(entry.tempId, serverRow.id as number);
          await applyInsertResolution(entry.table, entry.tempId, serverRow);
        }
      } else if (entry.op === "update") {
        let targetId = entry.rowId!;
        if (targetId < 0 && tempToReal.has(targetId)) targetId = tempToReal.get(targetId)!;
        if (targetId < 0) {
          // Still unresolved — the insert for this row must be later in queue.
          // Skip; next drain pass will pick it up.
          continue;
        }
        const { error } = await supabase.from(entry.table).update(payload as never).eq("id", targetId);
        if (error) throw error;
        // Clear dirty flag locally.
        const local = await db().table(entry.table).get(targetId);
        if (local && !local._deleted) {
          local._dirty = 0;
          await db().table(entry.table).put(local);
        }
      } else if (entry.op === "delete") {
        let targetId = entry.rowId!;
        if (targetId < 0 && tempToReal.has(targetId)) targetId = tempToReal.get(targetId)!;
        if (targetId < 0) continue;
        const { error } = await supabase.from(entry.table).delete().eq("id", targetId);
        if (error) throw error;
        await db().table(entry.table).delete(targetId);
      }

      if (entry.id != null) await db().outbox.delete(entry.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[sync] push failed", entry, msg);
      if (entry.id != null) {
        await db().outbox.update(entry.id, {
          tries: entry.tries + 1,
          lastError: msg,
        } as Partial<OutboxEntry>);
      }
      // Stop on error to preserve order; retry on next kick.
      return;
    }
  }
  emitLocalChange();
}

// Public entry: request a sync run soon. Coalesces concurrent calls.
export function kickSync(): void {
  if (!isBrowser()) return;
  if (syncing) { pendingKick = true; return; }
  syncing = true;
  (async () => {
    try {
      await pushOutbox();
      await pullAll();
    } finally {
      syncing = false;
      if (pendingKick) { pendingKick = false; setTimeout(() => kickSync(), 50); }
    }
  })();
}

export function startSyncEngine(): void {
  if (!isBrowser() || started) return;
  started = true;

  // Sync when the browser regains connectivity.
  window.addEventListener("online", () => kickSync());
  // Sync when the tab becomes visible again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kickSync();
  });
  // Poll every 30 s while the tab is open.
  if (pullTimer) clearInterval(pullTimer);
  pullTimer = setInterval(() => {
    if (document.visibilityState === "visible") kickSync();
  }, 30_000);

  // Kick immediately.
  kickSync();
}

// Wipe local cache — used on sign-out so the next user doesn't inherit rows.
export async function clearLocalCache(): Promise<void> {
  if (!isBrowser()) return;
  await db().transaction("rw", db().tables, async () => {
    for (const t of PULL_TABLES) await db().table(t).clear();
    await db().outbox.clear();
    await db().meta.clear();
  });
  emitLocalChange();
}
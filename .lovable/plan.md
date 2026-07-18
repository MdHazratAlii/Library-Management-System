## Goal

The whole app works offline after the first login. Reads come from a local store, writes are queued locally and sync automatically when the network returns. Only login and ISBN lookup require internet.

## Current state (why nothing works offline today)

- Every page reads/writes Supabase directly (`supabase.from(...).select/insert/update/delete`).
- There is a service worker (`src/lib/register-sw.ts`) but it only caches the app shell — no data layer.
- Session survives offline because Supabase persists the JWT in `localStorage`, so auth-gated routes render, but every query fails.

## Architecture

```text
UI  ──►  Repository (lib/db/repo.ts)
              │
              ├──►  IndexedDB (Dexie)      ← source of truth for reads
              │
              └──►  Outbox queue           ← every write appended here
                          │
                          ▼
                    Sync engine (online + on 'online' event + interval)
                          │
                          ▼
                    Supabase (authoritative)
                          │
                          ▼
                    Pull deltas → IndexedDB
```

Rules:
- UI never calls `supabase.from(...)` directly. It calls the repo.
- Reads always resolve from IndexedDB (instant, offline-safe).
- Writes: (1) apply optimistically to IndexedDB, (2) append to outbox, (3) sync engine drains outbox when online.
- Pull: on app start (if online) and every N seconds, fetch rows newer than `last_synced_at` per table and upsert into IndexedDB.

## Data layer

Add Dexie (`bun add dexie`). One DB `library-pro`, tables mirroring Supabase: `books`, `categories`, `students`, `book_issues`, `fines`, plus `outbox` and `meta`.

Row shape for local records:
- `id`: existing integer PK when known, or a temporary negative integer for offline-created rows.
- `_dirty`: boolean — set true on optimistic write, cleared after successful sync.
- `_deleted`: soft-delete tombstone for offline deletes.
- `updated_at`: needed for delta pull — added via migration below.

Outbox entry:
```ts
{ id, table, op: 'insert'|'update'|'delete', payload, tempId?, createdAt, tries, lastError? }
```

## Server changes (single migration)

Add `updated_at timestamptz default now()` and an `update_updated_at` trigger to `books`, `categories`, `students`, `book_issues`, `fines` so the sync engine can pull deltas with `.gt('updated_at', lastSyncedAt)`.

No RLS change needed — policies already allow authenticated full access.

## Sync engine

`src/lib/db/sync.ts`:
- `pull(table)`: `select * where updated_at > meta.lastPulled[table]`, upsert into Dexie, update watermark.
- `push()`: read outbox FIFO; for each entry call Supabase; on success, if insert, remap tempId → real id everywhere (rows and pending outbox entries referencing it); mark row `_dirty=false`; delete outbox row.
- Triggers: `window.addEventListener('online')`, on login, on app boot, and every 30s while the tab is visible.
- Conflict policy: last-write-wins by `updated_at`. Foreign-key rows created offline (e.g. an issue that references a locally-created student) are pushed in dependency order; the sync engine resolves temp IDs before pushing dependents.

## Repository API

`src/lib/db/repo.ts` exposes `listBooks()`, `saveBook(b)`, `deleteBook(id)`, and equivalents for every entity. `LibraryDashboard` swaps its direct Supabase calls for repo calls. Live queries use Dexie's `liveQuery` + `useLiveQuery` from `dexie-react-hooks` (`bun add dexie-react-hooks`) so the UI re-renders automatically after sync pulls or optimistic writes.

## Auth + shell offline

- Supabase client already persists sessions to localStorage, so a returning user stays logged in offline.
- Upgrade the existing service worker (still using the guarded registration wrapper) to a `vite-plugin-pwa` `generateSW` setup with `NetworkFirst` for navigations, `CacheFirst` for hashed assets, and offline fallback to `/`. Route the registration through the existing preview-safe guard.
- Add an "Offline — X changes pending" chip to the header driven by outbox count and `navigator.onLine`.

## ISBN lookup

Keep as-is; when offline, disable the "Fetch by ISBN" button with a tooltip "Requires internet". Cache still applies for repeats.

## Not in scope

- Multi-device concurrent-edit conflict UI (last-write-wins only).
- Offline image uploads to Supabase Storage — book covers picked while offline are stored as data URLs locally and re-uploaded on sync.
- Realtime subscriptions (would fight the outbox; we poll instead).

## Implementation order

1. Migration: add `updated_at` + trigger to all 5 tables.
2. Add Dexie schema, repo, outbox, sync engine, `useLiveQuery` wiring.
3. Refactor `LibraryDashboard` to call the repo instead of Supabase.
4. Upgrade service worker to `vite-plugin-pwa` (generateSW) with the existing preview guard.
5. Header offline/pending-sync indicator; disable ISBN fetch when offline.
6. Manual QA: DevTools → Offline → create/edit/delete across all entities → back online → verify Supabase state.

## Size / risk

Big change: touches every data call site in the dashboard, adds ~4 new modules, and changes the service worker strategy. Expect one focused follow-up pass after initial QA for edge cases (image uploads offline, FK ordering, temp-id remapping in already-open modals).

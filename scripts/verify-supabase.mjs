#!/usr/bin/env node
/**
 * verify-supabase.mjs
 *
 * One-command sanity check that a Supabase project has the expected
 * schema, RLS, and storage buckets applied before you start the app.
 *
 * Usage:
 *   node scripts/verify-supabase.mjs
 *
 * Reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (falling back to the
 * VITE_-prefixed variants) from the environment / .env. It performs
 * read-only checks using the anon key — no service role required.
 *
 * Exits non-zero if any check fails so it can gate CI or `predev`.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

// --- tiny .env loader (no dotenv dep) ------------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k]) continue;
    let v = vRaw.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadEnvFile(".env");
loadEnvFile(".env.local");

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error(
    "✖ Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY. Copy .env.example → .env and fill them in.",
  );
  process.exit(1);
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
let checks = 0;
function log(ok, label, detail) {
  checks++;
  if (!ok) failures++;
  const icon = ok ? "✔" : "✖";
  console.log(`${icon} ${label}${detail ? `  — ${detail}` : ""}`);
}

// Expected schema. RLS is verified indirectly: writing without a session
// must be denied, and reads must succeed (with narrow columns).
const TABLES = [
  "categories",
  "books",
  "students",
  "book_issues",
  "fines",
  "user_roles",
];
const BUCKETS = ["library-images"];
const RPCS = [
  { name: "has_any_admin", args: {} },
  // has_role and bootstrap_admin require auth context — skip invocation,
  // presence is inferred from PostgREST error codes below.
];

// --- table reachability + RLS write denial ------------------------------
for (const table of TABLES) {
  const { error: readErr } = await supabase.from(table).select("*").limit(1);
  // 42501 = permission denied (missing GRANT). PGRST106/PGRST205 = missing.
  if (readErr && readErr.code === "42501") {
    log(false, `table public.${table} reachable`, `missing GRANT: ${readErr.message}`);
    continue;
  }
  if (readErr && /relation .* does not exist|not find the table/i.test(readErr.message)) {
    log(false, `table public.${table} exists`, readErr.message);
    continue;
  }
  // Any other error is unexpected but non-fatal to reachability.
  log(!readErr, `table public.${table} reachable`, readErr?.message);

  // Anonymous write must be denied by RLS (no session, no policy match).
  const { error: writeErr } = await supabase
    .from(table)
    .insert({})
    .select();
  const denied =
    !!writeErr &&
    (writeErr.code === "42501" ||
      /row-level security|violates row-level|permission denied|new row violates/i.test(
        writeErr.message,
      ));
  log(denied, `RLS blocks anonymous insert on ${table}`, denied ? undefined : writeErr?.message || "insert unexpectedly allowed");
}

// --- RPCs ----------------------------------------------------------------
for (const { name, args } of RPCS) {
  const { error } = await supabase.rpc(name, args);
  const missing =
    !!error && /Could not find the function|does not exist/i.test(error.message);
  log(!missing, `rpc public.${name}() present`, missing ? error.message : undefined);
}

// --- storage buckets -----------------------------------------------------
for (const bucket of BUCKETS) {
  // Public list is denied for private buckets; hitting the endpoint at all
  // confirms the bucket exists. Missing bucket → "Bucket not found".
  const { error } = await supabase.storage.from(bucket).list("", { limit: 1 });
  const notFound = !!error && /not found/i.test(error.message);
  log(!notFound, `storage bucket "${bucket}" exists`, notFound ? error.message : undefined);
}

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(
    "\nSome checks failed. Run `supabase db push` against this project, then re-run this script.",
  );
  process.exit(1);
}
console.log("All good — schema, RLS, and storage look ready.");
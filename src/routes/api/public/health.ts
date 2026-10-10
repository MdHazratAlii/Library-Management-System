import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Keep-alive / health check endpoint for UptimeRobot.
// - GET/HEAD only, returns { status: "ok", message: "Supabase is alive" }
// - Performs one ultra-lightweight HEAD count query (no rows returned)
// - In-memory per-IP rate limiting (30 requests / minute)
// - Uses only the publishable (anon) key — no secrets, read-only, RLS applies
// ---------------------------------------------------------------------------

const RATE_LIMIT = 30 // requests
const RATE_WINDOW_MS = 60_000 // per minute

const hits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT
}

function securityHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...extra,
  }
}

async function handle(request: Request): Promise<Response> {
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'

  if (isRateLimited(ip)) {
    return Response.json(
      { status: 'error', message: 'Too many requests' },
      { status: 429, headers: securityHeaders({ 'Retry-After': '60' }) },
    )
  }

  try {
    const url = process.env['SUPABASE_URL'] || import.meta.env.VITE_SUPABASE_URL
    const key =
      process.env['SUPABASE_PUBLISHABLE_KEY'] || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) {
      return Response.json(
        { status: 'error', message: 'Database unreachable' },
        { status: 503, headers: securityHeaders() },
      )
    }

    const supabase = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    })

    // Extremely lightweight: calls `select 'ok'` via an anon-callable RPC.
    // (Library tables are admin-only, so the anon key cannot read them.)
    let { error } = await supabase.rpc('health_check')
    if (error) ({ error } = await supabase.rpc('has_any_admin'))


    if (error) {
      return Response.json(
        { status: 'error', message: 'Database unreachable' },
        { status: 503, headers: securityHeaders() },
      )
    }

    return Response.json(
      { status: 'ok', message: 'Supabase is alive' },
      { status: 200, headers: securityHeaders() },
    )
  } catch {
    return Response.json(
      { status: 'error', message: 'Database unreachable' },
      { status: 503, headers: securityHeaders() },
    )
  }
}

export const Route = createFileRoute('/api/public/health')({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      HEAD: async ({ request }) => handle(request),
    },
  },
})

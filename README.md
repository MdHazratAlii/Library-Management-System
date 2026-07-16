# Library Pro

A modern, offline-capable Library Management System built with React 19,
TanStack Start, and Supabase. Manage books, categories, students, issues,
overdue tracking, and fines — all from a single admin dashboard with export
to PDF/XLSX, PWA support, and role-based access control.

## One-Click Deploy

Deploy your own copy in minutes. You'll be prompted for the Supabase
environment variables listed in the [Environment Variables](#environment-variables)
section below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR-GITHUB-USER%2FYOUR-REPO&env=VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY,VITE_SUPABASE_PROJECT_ID,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SUPABASE_PROJECT_ID&envDescription=Supabase%20project%20URL%2C%20publishable%2Fanon%20key%2C%20and%20project%20ref.&envLink=https%3A%2F%2Fgithub.com%2FYOUR-GITHUB-USER%2FYOUR-REPO%23environment-variables&project-name=library-pro&repository-name=library-pro)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FYOUR-GITHUB-USER%2FYOUR-REPO)

Replace `YOUR-GITHUB-USER/YOUR-REPO` in the links above with your own fork's
path. After deploying, remember to run the SQL migrations against your
Supabase project (see [Run Database Migrations](#run-database-migrations))
and create the `library-images` storage bucket.

## Features

- Admin-only dashboard with role-based access control (RLS-enforced)
- CRUD for Books, Categories, Students, Issues, and Fines
- Global search, per-table filters, pagination
- Student profile view with full borrow history
- Cover / profile image upload with automatic WebP compression to Supabase Storage
- Configurable institute/library settings (name, logo, address, fine rate, max issues)
- Export to PDF and XLSX (single-table and full report)
- Progressive Web App with offline caching
- Responsive with a mobile-friendly overlay sidebar

## Tech Stack

- React 19 + TypeScript
- TanStack Start (SSR) + TanStack Router + TanStack Query
- Supabase (Postgres, Auth, Storage, RLS)
- Tailwind CSS v4
- Recharts, jsPDF, SheetJS (xlsx)
- Vite 8 + vite-plugin-pwa

## Prerequisites

- Node.js 20+ and [Bun](https://bun.sh) (or npm/pnpm)
- A free [Supabase](https://supabase.com) project
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for running migrations locally)

## Installation

```bash
git clone <this-repo-url>
cd <repo>
bun install     # or: npm install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase project values:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Your project's publishable/anon key — safe to expose in the browser |
| `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` | Your project ref (the subdomain of your Supabase URL) |

Never commit a `service_role` key. The app never uses one on the client.

## Create a Supabase Project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. From **Project Settings → API**, copy the **Project URL** and **anon / publishable key** into your `.env`.
3. Under **Authentication → Providers**, enable **Email** (used by the admin sign-in flow). Email confirmation can be disabled during development.

## Run Database Migrations

All schema, RLS policies, functions, and storage buckets live in
`supabase/migrations/`. Apply them with the Supabase CLI:

```bash
# One-time: point the CLI at your project
supabase link --project-ref <your-project-ref>

# Apply every migration in order
supabase db push
```

Alternatively, open each `.sql` file in `supabase/migrations/` and run it in
the Supabase SQL editor in filename order.

### First admin user

No account is seeded as admin. After migrations are applied:

1. Sign up in the app (`/`) with the email you want to use as the librarian.
2. The app calls `public.bootstrap_admin()` which grants the admin role to
   the first authenticated user. Subsequent sign-ups get no role until an
   admin grants one.

### Storage Buckets & Policies

The app uploads book covers, student photos, and the library logo to a
single Supabase Storage bucket. The RLS policies on `storage.objects` are
created by the migrations, but the bucket itself must exist in your project
before uploads will work.

**Required bucket**

| Name | Public | Purpose |
| --- | --- | --- |
| `library-images` | No (private) | Book covers, student photos, librarian avatar, library logo. The app reads files back through long-lived signed URLs. |

**Option A — Supabase Dashboard (recommended)**

1. Open your project → **Storage** → **New bucket**.
2. Name it exactly `library-images` (lowercase, hyphen).
3. Leave **Public bucket** OFF (private). Click **Create**.

**Option B — SQL (Supabase SQL Editor)**

```sql
insert into storage.buckets (id, name, public)
values ('library-images', 'library-images', false)
on conflict (id) do nothing;
```

**Confirm the required policies exist**

`supabase db push` applies these two policies to `storage.objects`
automatically (see `supabase/migrations/*_cover_url_and_storage.sql`). To
verify, run this in the SQL Editor — you should see both rows:

```sql
select polname
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and polname in ('Admins manage library-images', 'Public read library-images');
```

If either policy is missing, re-run the migration or paste the block below
into the SQL Editor:

```sql
create policy "Admins manage library-images"
on storage.objects for all to authenticated
using  (bucket_id = 'library-images' and public.has_role(auth.uid(), 'admin'::public.app_role))
with check (bucket_id = 'library-images' and public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "Public read library-images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'library-images');
```

Policy summary:

- **Admins manage library-images** — only signed-in users with the `admin`
  role (see `public.user_roles` + `public.has_role`) can insert, update, or
  delete objects in this bucket.
- **Public read library-images** — anyone (including anonymous visitors)
  can read objects, which is what makes the signed / public URLs embedded
  in book and student rows resolve in the browser.

**One-shot verification**

```bash
bun run verify:supabase
```

The script fails loudly if the `library-images` bucket is missing.

## Running the App

```bash
bun run dev      # http://localhost:8080
```

## Verify Supabase Setup

Before starting the app against a fresh Supabase project, run:

```bash
bun run verify:supabase   # or: node scripts/verify-supabase.mjs
```

It uses only your `.env` (`SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`) and
checks that every expected table is reachable, RLS blocks anonymous writes,
required RPCs exist, and the `library-images` storage bucket is present.
Exits non-zero if anything is missing so you can gate CI or run it before
`bun run dev`.

## Building for Production

```bash
bun run build
bun run preview  # serve the production build locally
```

The output is a standard TanStack Start / Vite build and can be deployed to
any host that supports Node/Edge runtimes (Cloudflare Workers, Vercel,
Netlify, self-hosted Node, etc.).

## Project Structure

```
src/
  routes/                    file-based routes (TanStack Router)
    __root.tsx               app shell + head metadata
    index.tsx                landing (renders Auth or Dashboard)
    auth.tsx                 sign-in / bootstrap admin
    _authenticated/          admin-only dashboard + subviews
  integrations/supabase/     generated Supabase clients (do not edit)
  lib/                       utilities (image upload, settings, PDF/XLSX export)
  components/                shared UI components
  styles.css                 design tokens + component styles
supabase/
  migrations/                schema, RLS, functions, storage buckets
  config.toml                Supabase CLI config (update project_id after linking)
```

## License

MIT — see `LICENSE` if provided, otherwise feel free to adopt one.
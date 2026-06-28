-- FlowBoard schema for Supabase.
-- Run this once in the Supabase dashboard → SQL Editor → New query → Run.
-- (Because the backend talks to Supabase over the REST API, tables are NOT
--  auto-created — this file is how they get created.)

create extension if not exists pgcrypto;  -- for gen_random_uuid()

-- ── Users (admin + clients) ───────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,
  name          text not null,
  role          text not null default 'client' check (role in ('admin','client')),
  color         text not null default '#6366f1',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_users_email on public.users (email);

-- ── Tasks / work requests ─────────────────────────────────────────────────────
create table if not exists public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  client_id          uuid not null references public.users (id) on delete cascade,
  estimated_minutes  integer,
  status             text not null default 'requested'
                     check (status in ('requested','scheduled','in_progress','completed','cancelled')),
  scheduled_date     date,
  order_index        integer not null default 0,
  timer_started_at   timestamptz,
  accumulated_seconds integer not null default 0,
  actual_start       timestamptz,
  actual_end         timestamptz,
  proof_image_url    text,
  completion_note    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_tasks_client on public.tasks (client_id);
create index if not exists idx_tasks_date   on public.tasks (scheduled_date);
create index if not exists idx_tasks_status on public.tasks (status);

-- ── App settings (singleton row, id = 1) ──────────────────────────────────────
create table if not exists public.app_settings (
  id            integer primary key,
  workday_start time not null default '09:00',
  workday_hours integer not null default 10
);

-- Note on security: the backend uses the SERVICE ROLE key, which bypasses Row
-- Level Security, so you do NOT need RLS policies for the app to work. These
-- tables are only ever reached through the FastAPI server, never the browser.
-- If you enable RLS for defence-in-depth, leave it with no public policies.

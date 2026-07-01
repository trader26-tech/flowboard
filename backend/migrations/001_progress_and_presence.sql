-- Migration 001 — progress points + admin presence.
-- Run ONCE in Supabase → SQL Editor if your tables already exist (created before
-- these columns were added). Safe to run more than once (all statements are idempotent).

-- Ordered checklist of milestones on each task; drives the progress bar & client ETA.
alter table public.tasks
  add column if not exists progress_points jsonb not null default '[]'::jsonb;

-- Admin online/working-now presence, toggled from the app header.
alter table public.app_settings
  add column if not exists admin_online boolean not null default false;
alter table public.app_settings
  add column if not exists admin_online_since timestamptz;

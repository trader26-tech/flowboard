# FlowBoard — a Jira-style work scheduler

Collect work requests from multiple clients, drag them onto a flexible time-grid day,
run a live timer on each task, complete it with a proof image, and let the schedule
**prepone/postpone automatically** based on how fast you actually finish. Every client
is colour-coded, unfinished work carries forward, and clients get their own portal to
watch progress.

- **Frontend:** Angular 19 (standalone) + Tailwind CSS + Angular CDK drag-and-drop
- **Backend:** FastAPI + JWT auth
- **Data + files:** **Supabase only** — accessed entirely through the Supabase REST API
  (`supabase-py`). Postgres holds the data; Supabase Storage holds completion images.
- **Hosting:** **one** Railway service — a single Docker image where FastAPI serves both
  the API (`/api/*`) and the compiled Angular app (everything else). One build, one
  domain, no CORS.

```
booking/
├── Dockerfile          builds the frontend, then bundles it into the backend image
├── railway.json        single-service Railway config (Dockerfile builder)
├── backend/            FastAPI API (also serves the built SPA from ./static)
│   └── schema.sql      run this once in Supabase to create the tables
└── frontend/           Angular app (built into the image at deploy time)
```

---

## Features

| Requirement | Where |
|---|---|
| Multiple clients submit work requests (title + **optional** time estimate) | Client portal → *New request* |
| You pick tasks up into your day | Admin → *Backlog* / drag into *Schedule* |
| Time-grid day that **starts when you do** (set start time, or "Now") | Admin → *Schedule* toolbar |
| Live "Working now" hero + per-task timers | Admin → *Schedule* |
| Place tasks in any slot, drag to reorder/reschedule | Admin → *Schedule* (drag & drop) |
| Mark complete **with an image** + note | "Complete" modal → uploads to Supabase Storage |
| Finish early → tasks below **prepone**; finish late → **postpone** | Timeline recomputed from actual durations |
| Colour-code per client everywhere | Admin → *Clients* (colour picker) |
| Carry forward anything unfinished | Banner on *Schedule* → "Carry forward" |
| Clients see how much of their work is done | Client portal → *Overview* |

---

## 1. Supabase setup (the only backing service)

1. Create a project at [supabase.com](https://supabase.com).
2. **Create the tables:** SQL Editor → New query → paste [`backend/schema.sql`](backend/schema.sql) → Run.
3. **Get two values** from *Settings → API*:
   - **Project URL** → `SUPABASE_URL`
   - **`service_role` key** → `SUPABASE_SERVICE_KEY` (server-side only; never in the frontend)
4. **Storage bucket:** *Storage* → *New bucket* → name `task-proofs` → **Public** → create.

---

## 2. Deploy to Railway (one service)

1. **New Project → Deploy from GitHub repo** → `trader26-tech/flowboard`.
2. Railway detects the root [`Dockerfile`](Dockerfile) automatically (no Root Directory to set).
3. Add **Variables**:
   ```
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_SERVICE_KEY=<service_role key>
   SUPABASE_BUCKET=task-proofs
   JWT_SECRET=<long random string>
   ADMIN_EMAIL=you@example.com
   ADMIN_PASSWORD=<your admin password>
   ```
   (`PORT` is provided by Railway automatically. No `CORS_ORIGINS` needed — same origin.)
4. **Generate Domain.** Open it and sign in as the admin.

The image builds the Angular app, bundles it into the FastAPI container, and serves
everything from one URL — e.g. `https://flowboard.up.railway.app` (app) and
`/api/...` (API). The admin user is auto-created on first boot from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`.

> Build/run it locally exactly like Railway does:
> `docker build -t flowboard . && docker run -p 8000:8000 --env-file backend/.env flowboard`
> then open http://localhost:8000.

---

## 3. Local development (hot reload)

Run the two dev servers separately for fast reloads; the Angular dev server **proxies
`/api` to the backend**, so the frontend code always just calls `/api`.

### Backend
```bash
cd backend
python3.13 -m venv .venv && source .venv/bin/activate   # 3.11–3.13 fine
pip install -r requirements.txt
cp .env.example .env          # fill in SUPABASE_URL / SUPABASE_SERVICE_KEY / JWT_SECRET / admin
uvicorn app.main:app --reload --port 8090
```

### Frontend
```bash
cd frontend
npm install
npm start                     # http://localhost:4300  (proxies /api → :8090)
```
The proxy target lives in [`frontend/proxy.conf.json`](frontend/proxy.conf.json) (defaults
to `http://localhost:8090`). No API URL to configure.

### First login
Sign in with your `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Under **Clients**, invite a client
(name, colour, password); sign in as that client elsewhere to submit requests.

---

## Architecture notes

- **One artifact.** The [`Dockerfile`](Dockerfile) builds the Angular app in a Node stage,
  then copies the output into the Python image as `./static`. FastAPI serves real files
  directly and falls back to `index.html` for client-side routes; `/api/*` stays the API.
- **Data layer** ([`backend/app/db.py`](backend/app/db.py)) wraps the Supabase REST API —
  plain dicts, no ORM, no direct Postgres connection. The service-role key bypasses RLS,
  and the tables are only ever reached through the server.
- **Timeline** ([`backend/app/scheduling.py`](backend/app/scheduling.py)) derives planned
  start/end times from task durations and actual completion times, so finishing early
  prepones the rest of the day and finishing late postpones it. The UI stacks tasks from
  your chosen start time and shows the remaining window as free.

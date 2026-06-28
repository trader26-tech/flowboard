# FlowBoard — a Jira-style work scheduler

Collect work requests from multiple clients, drag them into a flexible ~10-hour day,
run a live timer on each task, complete it with a proof image, and let the schedule
**prepone/postpone automatically** based on how fast you actually finish. Every client
is colour-coded, unfinished work carries forward, and clients get their own portal to
watch progress.

- **Frontend:** Angular 19 (standalone) + Tailwind CSS + Angular CDK drag-and-drop
- **Backend:** FastAPI + JWT auth
- **Data + files:** **Supabase only** — accessed entirely through the Supabase REST API
  (`supabase-py`). Postgres holds the data; Supabase Storage holds completion images.
  No direct database connection / `DATABASE_URL`.
- **Hosting:** Railway (two services: `backend` and `frontend`)

```
booking/
├── backend/        FastAPI API (talks to Supabase over REST)
│   └── schema.sql  run this once in Supabase to create the tables
├── frontend/       Angular app
└── README.md
```

---

## Features

| Requirement | Where |
|---|---|
| Multiple clients submit work requests (title + **optional** time estimate) | Client portal → *New request* |
| You pick tasks up into your day | Admin → *Backlog* / drag into *Schedule* |
| 10-hour day with a **flexible, configurable** start time | Admin → *Settings* |
| Place tasks in any slot, drag to reorder/reschedule | Admin → *Schedule* (drag & drop) |
| Live running timer per task | Start/Pause on each card |
| Mark complete **with an image** + note | "Complete" modal → uploads to Supabase Storage |
| Finish early → tasks below **prepone**; finish late → **postpone** | Timeline recomputed from actual end times |
| Colour-code per client everywhere | Admin → *Clients* (colour picker) |
| Carry forward anything unfinished | Amber banner on *Schedule* → "Carry forward" |
| Clients see how much of their work is done | Client portal → *Overview* (progress ring + stats) |

---

## 1. Supabase setup (one service does everything)

1. Create a project at [supabase.com](https://supabase.com).
2. **Create the tables:** open *SQL Editor* → *New query*, paste the contents of
   [`backend/schema.sql`](backend/schema.sql), and *Run*. (Because the backend uses the
   REST API, tables are **not** auto-created — this is how they get made.)
3. **Get your two values** from *Settings → API*:
   - **Project URL** → `SUPABASE_URL` (e.g. `https://abcd.supabase.co`)
   - **`service_role` key** → `SUPABASE_SERVICE_KEY` (server-side only; it bypasses RLS —
     never put it in the frontend)
4. **Storage bucket for proof images:** *Storage* → *New bucket* → name it `task-proofs`
   → mark it **Public** → create.

That's the entire backing setup. There is **no database password / connection string** to
manage — `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` is all the server needs.

---

## 2. Run locally

### Backend
```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate   # 3.11–3.13 all fine
pip install -r requirements.txt
cp .env.example .env        # then edit .env (see below)
uvicorn app.main:app --reload --port 8000
```
Edit `backend/.env`:
```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
SUPABASE_BUCKET=task-proofs
JWT_SECRET=<long random string>
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<your admin password>
CORS_ORIGINS=http://localhost:4200
```
On first start the API seeds the `app_settings` row and **bootstraps an admin** from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` (assuming `schema.sql` has been run). Docs at
http://localhost:8000/docs.

### Frontend
```bash
cd frontend
npm install
npm start                   # http://localhost:4200
```
The dev API URL defaults to `http://localhost:8000/api`. To change it without
rebuilding, edit `frontend/src/assets/env.js`.

### First login
Sign in with your `ADMIN_EMAIL` / `ADMIN_PASSWORD` → you land in the admin workspace.
Create a client under **Clients** (sets their colour + password), then sign in as that
client in another browser to submit requests.

---

## 3. Deploy to Railway

Create a Railway project and add **two services** from this repo.

### Backend service
- **Root directory:** `backend` (Nixpacks auto-detects Python; uses `railway.json` / `Procfile`).
- **Variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`, `JWT_SECRET`,
  `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `CORS_ORIGINS=https://<your-frontend-domain>`.
- Generate a public domain, e.g. `https://flowboard-api.up.railway.app`.

### Frontend service
- **Root directory:** `frontend` (Build: `npm run build`, Serve: `npm run serve:prod` — already in `railway.json`).
- Point it at the backend by editing `frontend/src/assets/env.js`:
  ```js
  window.__APP_CONFIG__ = { apiUrl: "https://flowboard-api.up.railway.app/api" };
  ```
  Commit & redeploy. (`env.js` is loaded at runtime, so it overrides the bundle — no rebuild gymnastics.)
- Generate a public domain and make sure that exact origin is in the backend's `CORS_ORIGINS`.

Open the frontend domain and sign in as the admin.

---

## Architecture notes

- **Data layer** ([`backend/app/db.py`](backend/app/db.py)) wraps the Supabase REST API
  (`supabase-py` async client) — every record is a plain dict; there is no ORM and no
  direct Postgres connection. The service-role key means Row Level Security is bypassed,
  so the tables are reached only through the FastAPI server, never the browser.
- **Timeline math** lives in [`backend/app/scheduling.py`](backend/app/scheduling.py).
  Planned start/end times are never stored; they're derived each read by walking the day's
  ordered tasks with a moving cursor. Completed tasks anchor the cursor to their *actual*
  end time, which is what makes early finishes prepone and late finishes postpone the rest.
- **Roles:** a single `admin` (you) and many `client` accounts. The admin invites clients;
  JWTs carry the role and the frontend guards routes accordingly.
- **Timers:** each task stores `accumulated_seconds` + `timer_started_at`; the live value is
  `accumulated + (now - started)`, computed on the client every second and finalized on
  pause/complete.
```

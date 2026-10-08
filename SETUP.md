# OT Booking — Setup & Run Guide

How to get the OT (Operating Theatre) booking app running on a new computer.

## What the app is made of

| Part | Where it lives |
|---|---|
| Frontend (React + TypeScript + Vite + Tailwind) | `src/` — runs on your computer with `npm run dev` |
| Database (Postgres) | Supabase cloud project `iyvpnnmirbcjadtoptxo` |
| Edge functions (WhatsApp messaging, logins, cascade) | `supabase/functions/`, deployed to Supabase |
| Database schema | `supabase/migrations/` |

All the real data lives in Supabase, so any computer running the frontend sees the same bookings.

## 1. Install the tools

- **Node.js** (LTS, v20 or newer): https://nodejs.org
- **Git**: https://git-scm.com

Check that both are installed:

```
node -v
git --version
```

## 2. Get the code

```
git clone https://github.com/avinashgbn/ot-booking.git
cd ot-booking
npm install
```

## 3. Create the `.env` file

Create a file called `.env` in the `ot-booking` folder with:

```
VITE_SUPABASE_URL=https://iyvpnnmirbcjadtoptxo.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
```

To get the anon key, go to **Supabase dashboard → Project Settings → API Keys** and copy the `anon` / publishable key.

`.env` is git-ignored on purpose. Never commit it.

## 4. Run the app

```
npm run dev
```

Open the address it prints, usually http://localhost:5173.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## 5. Backend work (optional)

You only need this if you are changing edge functions or the database schema.

```
npm install -g supabase
supabase login
supabase link --project-ref iyvpnnmirbcjadtoptxo
```

Deploy one function:

```
supabase functions deploy <function-name>
```

The functions are `activate-account`, `cascade-engine`, `link-surgeon`, `pin-login`, `send-whatsapp` and `whatsapp-webhook`.

### Edge function secrets

These are stored in Supabase, not on your computer: **Dashboard → Edge Functions → Secrets**.

| Secret | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio account |
| `TWILIO_WHATSAPP_NUMBER` | Sender, e.g. `whatsapp:+14155238886` (sandbox) |
| `APP_URL` | Public URL of the frontend, used in invite links |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase automatically |

The Twilio WhatsApp inbound webhook should point to:
`https://iyvpnnmirbcjadtoptxo.supabase.co/functions/v1/whatsapp-webhook`

### Database migrations

The live database's migration history doesn't fully match `supabase/migrations/`: some migrations were applied by hand or restamped by Bolt. **Do not run `supabase db push` against the live project without checking first.** Apply individual changes in the SQL editor instead, or use a Supabase branch.

## Running against a local database (optional)

Requires Docker Desktop.

```
supabase start
```

This starts a local Supabase at `http://127.0.0.1:54321` and loads `supabase/seed.sql`. Point a `.env.local` file at it, using the anon key that `supabase start` prints:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon key from supabase start>
```

`.env.local` overrides `.env` while it exists. Delete or rename it to go back to the live database.

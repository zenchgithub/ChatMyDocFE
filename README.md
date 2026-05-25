# ChatMyDocs.ai Frontend

React + Vite frontend for ChatMyDocs.ai. The app signs users in with Supabase, sends authenticated document questions to the FastAPI backend, displays cited source documents, supports PDF upload, shows indexed Qdrant documents, and provides admin invite controls.

## Local Setup

Install dependencies:

```bash
npm install
```

Create the frontend env file:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_CHATMYDOCS_API_URL=http://localhost:8000
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

## Environment Variables

Frontend variables must start with `VITE_` because Vite only exposes those variables to browser code.

| Variable | Used by | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `src/utils/supabase.ts` | Supabase project URL for browser auth. |
| `VITE_SUPABASE_ANON_KEY` | `src/utils/supabase.ts` | Public Supabase anon key. This is safe for browser use. |
| `VITE_CHATMYDOCS_API_URL` | `src/utils/streamQuery.ts` | FastAPI backend base URL, usually `http://localhost:8000` locally. |

Do not put service role keys, database URLs, JWT secrets, OpenAI keys, or NAS credentials in the frontend. Those belong in the backend `.env` at:

```text
/Users/zelalemsirag/kb-agent/.env
```

Backend variables currently needed by the FastAPI project include:

```bash
SUPABASE_URL=
SUPABASE_DB_URL=
SUPABASE_JWT_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
WEBDAV_USER=
WEBDAV_PASS=
ADMIN_LOOKUP_TABLE=user_admins
ADMIN_LOOKUP_USER_ID_COLUMN=user_id
```

## Admin Roles

Admin access is decided by the backend, not by frontend user metadata.

The backend reads a Supabase table using `SUPABASE_SERVICE_ROLE_KEY`. By default it checks whether the signed-in user's UUID exists in `public.user_admins.user_id`.

```sql
create table if not exists public.user_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.user_admins enable row level security;
```

Use only a self-read policy for normal authenticated users:

```sql
drop policy if exists "user_admins_insert_self" on public.user_admins;
drop policy if exists "user_admins_update_self" on public.user_admins;
drop policy if exists "user_admins_delete_self" on public.user_admins;

create policy "user_admins_select_self"
  on public.user_admins for select
  to authenticated
  using (user_id = auth.uid());
```

Give a user admin access from Supabase SQL Editor:

```sql
insert into public.user_admins (user_id)
values ('USER_UUID_FROM_AUTH_USERS')
on conflict (user_id) do nothing;
```

Do not allow authenticated users to insert/update/delete their own `user_admins` row. Otherwise any signed-in user can make themselves admin. The frontend only asks the backend `/me` endpoint whether the signed-in user is admin.

## How The App Works

Authentication:

1. The browser creates a Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Users sign in through Supabase Auth.
3. The frontend reads the Supabase access token from the active session.
4. Every backend request sends `Authorization: Bearer <token>`.
5. The FastAPI backend verifies that token before querying documents, uploading PDFs, listing indexed docs, or managing invites.

Query flow:

1. User sends a question from the chat input.
2. `src/utils/streamQuery.ts` posts to `POST /query` on `VITE_CHATMYDOCS_API_URL`.
3. The backend searches Qdrant, calls the LLM, and returns JSON with `answer`, `sources`, and `conversation_id`.
4. The frontend renders the answer, source chips, source drawer, copy/share/read-aloud actions, and document open links.

Document upload:

1. User selects a PDF from the chat input.
2. The frontend posts raw PDF bytes to `POST /upload-document`.
3. The backend uploads the PDF to the NAS folder and stores a local copy.
4. The backend ingests the PDF into Qdrant.
5. The document appears in Settings after refreshing indexed documents.

Indexed documents:

1. Settings calls `GET /indexed-documents`.
2. The backend reads Qdrant payload metadata and returns grouped document records.
3. The frontend shows document name, collection, page count, chunk count, size, and an open-document button.

Admin invites:

1. Admin users open Settings.
2. The invite form calls backend admin endpoints under `/admin`.
3. The backend uses `SUPABASE_SERVICE_ROLE_KEY` to send Supabase invitation emails.
4. Supabase sends the receiver an invite link back to the frontend with `?invite=1`.
5. The receiver sets a password in the frontend before entering the app.
6. The browser never receives the service role key.

## Important Supabase URLs

For local development, configure Supabase Auth URLs like this:

```text
Site URL: http://localhost:5173
Redirect URLs:
http://localhost:5173/**
```

If Supabase is still redirecting to `http://localhost:3000`, update the project Auth URL configuration and send a fresh invite link.

## Source Files

| File | Purpose |
| --- | --- |
| `src/config/env.ts` | Central frontend environment configuration. |
| `src/utils/supabase.ts` | Supabase browser client. |
| `src/utils/streamQuery.ts` | Backend `/query` call and source URL normalization. |
| `src/app/App.tsx` | Main app shell, auth views, chat, settings, upload, source panel, admin invite UI. |
| `src/components/MessageBubble/` | Alternate reusable message bubble component. |

## Backend Endpoints Used By The Frontend

| Endpoint | Purpose |
| --- | --- |
| `GET /me` | Returns current user's backend role and `is_admin`. |
| `POST /query` | Sends a question and returns answer JSON with sources. |
| `POST /upload-document` | Uploads and ingests a PDF. |
| `GET /indexed-documents` | Lists Qdrant-indexed documents for Settings. |
| `GET /admin/invites` | Admin-only invite audit list. |
| `POST /admin/invite` | Admin-only Supabase invitation sender. |
| `DELETE /admin/invites/{email}` | Admin-only local invite record removal. |

## Verification

Build the frontend:

```bash
npm run build
```

Run locally:

```bash
npm run dev
```

Backend must also be running:

```bash
cd /Users/zelalemsirag/kb-agent
.venv/bin/uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

After changing `.env.local`, restart the Vite dev server. Vite reads env files at startup.

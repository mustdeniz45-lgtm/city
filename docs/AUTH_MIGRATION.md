# Auth-first identity migration — operator guide

**Goal:** replace the client-generated `device_id` with a server-issued Supabase
Auth identity (`user.id`, UUID) so that XP, check-ins, and the leaderboard
cannot be spoofed. Guests keep frictionless "no-signup" UX via
**Supabase Anonymous Sign-in**.

Artifacts shipped in this session:

| Path | Purpose |
|---|---|
| `frontend/src/store.v2.ts` | Refactored identity store — drops `device_id`, exposes `userId`, `getAccessToken`, `isAnonymous`, `ensureSession`. Coexists with the current `store.ts`; flip screens over one at a time. |
| `backend/sql/2026-07-01_progress_auth_uid.sql` | DB migration: rename `device_id` → `user_id uuid → auth.users(id)`, enable RLS, install leaderboard + owner-only policies, create `public.leaderboard_v1` view. |
| `docs/AUTH_MIGRATION.md` | This document. |

---

## 0 · Prerequisites (do these BEFORE running any code)

1. **Enable Anonymous Sign-ins**
   Supabase Dashboard → *Authentication → Providers → Anonymous* → **Enable**.
   Without this step, `supabase.auth.signInAnonymously()` returns
   `Anonymous sign-ins are disabled`.

2. **Get your JWT secret / JWKS URL** (backend will need one of these)
   Dashboard → *Project Settings → API*.
   - If your project still uses **HS256**: copy `JWT Secret`.
   - If your project has migrated to **JWKS** (all new projects post-Oct 2025):
     use `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`.

3. **Add environment variables to `backend/.env`:**
   ```env
   SUPABASE_JWT_SECRET=<HS256 secret>       # if HS256
   SUPABASE_JWKS_URL=<jwks url>             # if asymmetric
   SUPABASE_ISS=https://qhnmbctcdetpjsgjkzrw.supabase.co/auth/v1
   SUPABASE_AUD=authenticated
   ```
   `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are already
   present in `frontend/.env` and unchanged.

4. **Back up the current `progress` table** if you want the old XP/check-in
   data:
   ```bash
   pg_dump --data-only -t public.progress "$SUPABASE_DB_URL" > progress_backup.sql
   ```
   (Choice **2b** was to wipe it, but a backup makes the migration reversible.)

---

## 1 · Run the SQL migration

Open the file `backend/sql/2026-07-01_progress_auth_uid.sql` in the Supabase
SQL editor and hit **Run**. It:

* `TRUNCATE`s legacy `progress` rows.
* Drops `device_id`, adds `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`,
  makes it `NOT NULL`, and unique-indexes it.
* Enables RLS + installs 4 policies:
  - **SELECT** — authenticated users see their own row **plus** any row that
    has a `display_name` (the leaderboard set).
  - **INSERT / UPDATE / DELETE** — only when `user_id = auth.uid()`.
* Creates `public.leaderboard_v1` — a view exposing only the leaderboard-safe
  columns, granted to `authenticated` + `anon`.

The migration is idempotent — safe to re-run.

---

## 2 · Backend changes (FastAPI)

Your existing `backend/auth.py` already contains a Supabase JWT dependency —
extend it to be MANDATORY on every write endpoint. Sketch:

```python
# backend/auth.py — additions
import os, time, httpx, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_JWKS: dict | None = None
_JWKS_EXP = 0.0
_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")
_JWKS_URL   = os.environ.get("SUPABASE_JWKS_URL")
_ISS        = os.environ.get("SUPABASE_ISS")
_AUD        = os.environ.get("SUPABASE_AUD", "authenticated")

async def _get_jwks() -> dict:
    global _JWKS, _JWKS_EXP
    if _JWKS and time.time() < _JWKS_EXP: return _JWKS
    async with httpx.AsyncClient(timeout=5) as c:
        r = await c.get(_JWKS_URL); r.raise_for_status()
    _JWKS, _JWKS_EXP = r.json(), time.time() + 900
    return _JWKS

class AuthUser:
    def __init__(self, claims: dict):
        self.id = claims["sub"]
        self.is_anonymous = bool(claims.get("is_anonymous"))
        self.claims = claims

security = HTTPBearer()

async def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(security),
) -> AuthUser:
    token = cred.credentials
    try:
        if _JWKS_URL:                # asymmetric (RS256) path
            hdr = jwt.get_unverified_header(token)
            keys = (await _get_jwks())["keys"]
            key = next(k for k in keys if k["kid"] == hdr["kid"])
            claims = jwt.decode(token, jwt.PyJWK(key).key,
                                algorithms=[key.get("alg", "RS256")],
                                audience=_AUD, issuer=_ISS)
        else:                        # legacy HS256 path
            claims = jwt.decode(token, _JWT_SECRET, algorithms=["HS256"],
                                audience=_AUD, issuer=_ISS)
    except Exception as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))
    return AuthUser(claims)
```

Update the endpoints that currently take `device_id`:

| Old endpoint                                | Change                                                   |
|---|---|
| `POST /api/progress/poi-check-in` (body `device_id`) | Drop `device_id` from the body. Inject `user: AuthUser = Depends(get_current_user)`, use `user.id`. |
| `POST /api/dishes/{id}/try` (body `device_id`) | Same treatment. |
| `GET  /api/progress/{device_id}`            | Rename to `GET /api/progress/me`; derive from JWT. |
| `GET  /api/progress/{device_id}/by-city`    | Same → `/me/by-city`. |
| `GET  /api/quests/{id}/progress?device_id=` | Drop the query param; derive from JWT. |
| `POST /api/auth/link-device`                | **Delete** — no longer needed. |
| `GET  /api/leaderboard`                     | Point at `public.leaderboard_v1`. No auth required. |

**Do not** service-role-key past RLS from user endpoints. Reserve
`SUPABASE_SERVICE_ROLE_KEY` for backend-only admin scripts (seeds, migrations,
nightly cleanup).

---

## 3 · Frontend rollout with `store.v2.ts`

The refactored store exports the same shape as the old one but keyed on
Supabase Auth. Rollout in three PRs:

**PR 1 — Attach JWT to every request.** In `frontend/src/api.ts`, add a
`fetch` wrapper that calls `getAccessToken()` from `store.v2.ts` and sends
`Authorization: Bearer <token>` on every call.

**PR 2 — Migrate the profile screen.** Replace
`const { deviceId } = useApp()` → `const { userId } = useApp()`; update
`api.progress(deviceId)` calls to `api.progressMe()`. Ship. This isolates
risk to one screen.

**PR 3 — Migrate the remaining screens** (`explore.tsx`, `food.tsx`,
`quest/[id].tsx`, `poi/[id].tsx`, `collage.tsx`). Delete the old
`store.ts`, rename `store.v2.ts` → `store.ts`. Also delete `auth/link-device`
and the `getDeviceId` helper.

`useApp()` still hides the "am I authenticated?" state behind a simple
`isAnonymousUser` boolean, so screens don't have to talk to Supabase directly.

---

## 4 · Guest → permanent account upgrade

Anonymous UIDs are preserved when you promote a guest, so **no data
migration** happens when they finally register:

```ts
async function upgradeToEmail(email: string, password: string) {
  // 1. Ask Supabase to send a verification email to the anon user.
  const { error: e1 } = await supabase.auth.updateUser({ email });
  if (e1) throw e1;
  // 2. After the user clicks the link in the email, call again with password.
  //    (Do this behind an "I've verified my email" button.)
  const { error: e2 } = await supabase.auth.updateUser({ password });
  if (e2) throw e2;
}
```

Their `progress.user_id` row stays intact because the UUID doesn't change.

---

## 5 · Verification checklist

Run these after the SQL migration lands:

- [ ] `SELECT count(*) FROM public.progress;` → 0 (post-truncate).
- [ ] `SELECT column_name FROM information_schema.columns WHERE table_name='progress' AND column_name='device_id';` → no rows.
- [ ] `SELECT policyname, cmd FROM pg_policies WHERE tablename='progress';` → four rows.
- [ ] With an anon-user JWT in Studio → SQL editor → *Impersonate role*: `authenticated`,
      `INSERT INTO public.progress (user_id,xp) VALUES ('<other-users-uuid>', 999);`
      → `new row violates row-level security policy`.
- [ ] From the mobile app, on a fresh install: no session in storage →
      `supabase.auth.getSession()` returns null → `signInAnonymously()` fires
      once → subsequent restarts hydrate the same UUID.
- [ ] Backend endpoint hit without `Authorization` → 401.
- [ ] Hit with a valid JWT → progress row created; the `user_id` matches
      `sub` in the token.

---

## 6 · Rollback plan

If the migration causes issues:

```sql
-- Restore
BEGIN;
DROP VIEW  IF EXISTS public.leaderboard_v1;
ALTER TABLE public.progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress DROP CONSTRAINT progress_user_id_fkey;
ALTER TABLE public.progress DROP COLUMN user_id;
ALTER TABLE public.progress ADD COLUMN device_id text NOT NULL DEFAULT '';
COMMIT;
-- Then re-import your `progress_backup.sql` if you kept one.
```

Frontend rollback: simply re-import `store` from `./store` instead of
`./store.v2`. The two files are drop-in swappable at the identity layer.

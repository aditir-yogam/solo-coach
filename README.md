# Solo Coach Onboarding — Sign-Up, Personalize & Portfolio

Full vertical slice of the solo-coach onboarding epic:

**Sign up** (`/join` — Google / LinkedIn via a local fake shim, or email magic link) → **Personalize** (website, resume PDF or quick questions) → **AI-generated coach story** (real Firecrawl + real LLM, locked prompt) → **Portfolio** with click-to-edit and photo upload.

Everything runs locally: PostgreSQL, Mailpit (fake inbox), MinIO (fake S3). The only external calls are Firecrawl and the LLM, with your own keys.

---

## 1. Architecture

```
Browser ──► app  http://localhost:4000   FastAPI + built React frontend (one origin, cookie session)
             │                            also serves /verify and the fake auth shim (/auth-shim/…)
             ├─► PostgreSQL  coaches · magic_link_tokens · llm_use · tool_use  (schema = init.sql, untouched)
             ├─► Mailpit     SMTP :1025 → inbox http://localhost:8025
             ├─► MinIO       S3 :9000 → photos + resumes (console http://localhost:9001)
             ├─► Firecrawl   real API — website scrape
             └─► Anthropic   real API — story generation   (or Groq, see §4)

Page 2 ─► POST …/personalize (save fields) ─► POST …/story/generate (202, BackgroundTasks)
            website_url? → Firecrawl ─(fails? fall through)─► resume_s3_key? → PDF text ─► else quick answers
            + story_text always  ─► locked prompt ─► LLM ─► coach_story, bio_status = done
            tool_use row only for Firecrawl · exactly one llm_use row per run
```

| Path | What it is |
|---|---|
| `backend/app/` | FastAPI. `routes/` (HTTP), `services/` (story pipeline, Firecrawl, PDF, LLM, prompt), `repositories.py` (**all SQL**), `auth_shim.py` (fake authorize endpoint + stubbed exchange), `validation.py`, `storage.py`, `mailer.py`, `session.py`, `config.py` |
| `backend/prompts/story_prompt_template.txt` | The **locked prompt**, byte-for-byte as provided |
| `backend/tests/` | pytest unit tests |
| `frontend/` | React + Vite. `src/pages` (Sign up, Check email, Fallback states, Personalize, Portfolio) |
| `acceptance/` | Automated runner for the 17 scenarios + sample resume and photos |
| `scripts/` | Schema proof and demo helpers |
| `wireframes/` | The four provided wireframes |
| `init.sql` | Provided schema — **byte-identical to the Starter Pack** |

## 2. Prerequisites

- Docker Desktop (running)
- Node.js 20+ (only for the acceptance runner)
- Firecrawl API key (free tier) — https://firecrawl.dev
- Anthropic API key with a little credit — https://console.anthropic.com — **or** a Groq key — https://console.groq.com

## 3. Run it

```bash
git clone <your-repo-url> solo-coach-onboarding && cd solo-coach-onboarding
cp .env.example .env          # then set your keys and SESSION_SECRET (openssl rand -hex 32)
docker compose up --build
```

Open **http://localhost:4000** (redirects to `/join`). Institute sign-up: **http://localhost:4000/join?org=acme** (codes `acme`, `northstar`).

**MinIO bucket (Story 1).** Create `coaching-platform-dev` once in the console at http://localhost:9001 (`devkey` / `devsecret123`). If you skip it, the app creates the bucket on startup (`S3_AUTO_CREATE_BUCKET=true`) so a fresh stack always works.

| Service | URL | Login |
|---|---|---|
| App | http://localhost:4000 | — |
| API docs (OpenAPI) | http://localhost:4000/api/docs | — |
| Mailpit inbox | http://localhost:8025 | — |
| MinIO console | http://localhost:9001 | `devkey` / `devsecret123` |
| Postgres | `localhost:5432` | `dev` / `dev_local_only`, db `coaching_platform_dev` |

Fresh start (wipes DB, emails, files): `./scripts/reset.sh`.

**Run the backend from VS Code instead of Docker (optional):** start only the infrastructure with `docker compose up db mailpit minio`, then
```bash
cd frontend && npm install && npm run build && cd ../backend
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 4000      # reads ../.env
```

## 4. Environment variables

All configuration comes from `.env` (template `.env.example`); `.env` is git-ignored and nothing secret is hard-coded.

| Variable | Purpose |
|---|---|
| `FIRECRAWL_API_KEY` | Website crawls |
| `LLM_PROVIDER` | `anthropic` (what the epic specifies) or `groq` (free option for local runs). `./scripts/set-provider.sh groq` switches and restarts |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Default model `claude-haiku-4-5-20251001` |
| `GROQ_API_KEY`, `GROQ_MODEL` | Default `llama-3.3-70b-versatile` |
| `*_USD_PER_MTOK` | Only fill `llm_use.cost_usd`; check current provider pricing |
| `SESSION_SECRET` | Signs the session cookie |
| `AUTH_SHIM_URL` | Fake authorize endpoint (`http://localhost:4000/auth-shim/authorize`) |
| `S3_PUBLIC_ENDPOINT_URL` | Host the **browser** uses for presigned photo URLs |
| `FIRECRAWL_API_URL` | Default `https://api.firecrawl.dev/v1` (set `…/v2` if v1 is retired) |

With `LLM_PROVIDER=groq`, `llm_use.provider` truthfully records `groq`. The epic's Test 9 expects `anthropic`, so use Anthropic for the demo unless Groq has been approved.

## 5. Sign-in flows

**Google / LinkedIn (Stories 3–4).** `/auth/{provider}/start` redirects to `AUTH_SHIM_URL` with `provider=…`, a signed `state` and the redirect URI. The shim's local login page offers **Continue**, **Cancel** (→ `error=access_denied`) and **Simulate exchange failure** (`?simulate=error`). The callback exchanges the code with a **stubbed exchange function** returning fixture claims — Google `google-fake-001` / `jordan@example.com` / Jordan Blake; LinkedIn `linkedin-fake-001` / `priya@example.com` / Priya Raman — then runs the conflict check (`SELECT … WHERE coach_email = …`, different `auth_provider` → conflict), downloads the picture into MinIO at `coaches/{id}/photo.jpg` (or `orgs/{org_id}/coaches/{id}/photo.jpg`), inserts the coach (`active`, `cognito_sub`, `photo_s3_key`) and redirects to Page 2. A returning coach with the same provider is signed in rather than duplicated.

**Email magic link (Story 5).** `POST /api/v1/auth/magic-link` runs the conflict check, inserts a `pending` coach (`auth_provider='email'`, `cognito_sub` null), stores a token (24 h) and emails `http://localhost:4000/verify?token=…` through Mailpit. `/verify`: unknown token → provider/config error; used or expired → expired-link screen; otherwise `used_at = now()`, `status = 'active'`, Page 2. The token is stored as generated in `magic_link_tokens.token` (Story 5).

**Fallback screens (Story 6)** — also reachable directly: `/signin/error?reason=provider|cancelled|conflict|expired&provider=google|linkedin|email`. No raw error text is ever shown.

**Tenancy (Story 2).** `/join?org=<code>` → `coach_type='IN'` + `org_id` from a stub lookup (`acme`, `northstar`); `/join` → `SO`, `org_id` null. The code travels through every sign-in path. Unknown codes are rejected.

Sign out (not in the UI; handy between demo accounts): http://localhost:4000/auth/logout

## 6. Page 2 and story generation (Stories 7–9)

- Continue **and** Skip save the same way: narrative → `story_text` (if non-empty); *Add automatically* → `website_url`, resume to MinIO `…/resume.pdf` + `resume_s3_key`; *Quick questions* → `coaching_niche`, `credential`, `clients_coached`.
- If all six of those fields are empty, no generation — straight to Portfolio, `bio_status` stays `not_started`. Otherwise the page calls `POST /api/v1/app/coaches/{id}/story/generate`.
- The endpoint sets `bio_status='processing'`, returns **202**, and runs the rest in **FastAPI `BackgroundTasks`**. The status change is an atomic claim, so double-clicks or repeated calls never start a second run or write extra log rows.
- Source priority: website (Firecrawl `/scrape`, one page, ~1 credit) → resume (pypdf) → quick answers. A failed crawl writes a `tool_use` failure row and falls through.
- Prompt: `story_prompt_template.txt` is used verbatim; `{story_heading}` is substituted and the source material and `story_text` are inserted as labelled sections. Output over 200 words is trimmed to the last full sentence.
- Every run writes exactly one `llm_use` row (success or failure). On any failure `bio_status` returns to `not_started` and the error is in `error_message`.

## 7. Portfolio (Stories 10–12)

- `GET /api/v1/app/coaches/{id}/portfolio` returns the Story 10 fields plus `photo_presigned_url`, freshly presigned (15 min) on every call.
- Click-to-edit on name, headline, story heading, story body, LinkedIn handle, email → `PATCH /api/v1/app/coaches/{id}`. Cancel restores the prior value and sends nothing.
- Photo: the pencil (or "Add photo") opens a file picker → `POST …/photo` stores it at `…/photo.jpg` → `PATCH { photo_s3_key }` → display refreshes.
- The PATCH accepts only the seven Story 12 fields; `photo_s3_key` must be the coach's own key. `{coach_id}` in any URL must match the signed-in coach (403 otherwise).
- Packages: four disabled-looking buttons with no handlers. Download / Print opens the print dialog (visual only).

## 8. API

| Method & path | Purpose |
|---|---|
| `GET /auth/{google\|linkedin}/start` | Redirect to the fake authorize endpoint |
| `GET /auth-shim/authorize` · `POST /auth-shim/decision` | Local fake login page (Continue / Cancel / simulate error) |
| `GET /auth/{provider}/callback` | Stubbed exchange → conflict check → photo → insert → Page 2 |
| `POST /api/v1/auth/magic-link` | Pending coach + token + email |
| `GET /verify?token=` | Verify → active → Page 2 |
| `GET /api/v1/app/me` | Current coach |
| `POST /api/v1/app/coaches/{id}/personalize` | Page 2 submit (Continue or Skip) |
| `POST /api/v1/app/coaches/{id}/story/generate` | `generate_coach_story` (202) |
| `GET /api/v1/app/coaches/{id}/portfolio` | `get_coach_portfolio` |
| `PATCH /api/v1/app/coaches/{id}` | Edit fields incl. `photo_s3_key` |
| `POST /api/v1/app/coaches/{id}/photo` | Upload photo bytes to MinIO |

## 9. Testing

```bash
# all 17 scenarios (+ tenancy) against the running stack, with your real keys
cd acceptance && npm install && npm test
TEST_WEBSITE_URL=https://a-real-coach-site.com npm test     # optional: nicer story

# backend unit tests
cd backend && pip install -r requirements.txt -r requirements-dev.txt && pytest -q

# schema proof: rebuilds init.sql in a scratch DB and diffs it against the live one
./scripts/verify-schema.sh
```

The runner removes rows belonging to the fixture coaches (`jordan@example.com`, `priya@example.com`) and its own earlier test emails before it starts, so it can be re-run any number of times. It makes three real LLM calls and one Firecrawl call per run.

| Helper | Use |
|---|---|
| `./scripts/db-counts.sh [email]` | Coaches with `bio_status`, `llm_use`/`tool_use` counts, story words; with an email, the log rows |
| `./scripts/expire-magic-link.sh <email>` | Test 5 — make a link expired |
| `./scripts/force-processing.sh <email> [--done]` | Show the shimmer on demand |
| `./scripts/set-provider.sh groq\|anthropic` | Switch LLM provider |
| `./scripts/reset.sh` | Wipe everything and start fresh |

## 10. Acceptance checklist

| # | Scenario | Verified by |
|---|---|---|
| 1 | Google → active row, photo in MinIO, `photo_s3_key`, Page 2 | runner + browser |
| 2 | LinkedIn → same, `auth_provider='linkedin'` | runner + browser |
| 3 | Email → pending row, token row, email in Mailpit | runner + Mailpit |
| 4 | Magic link → `used_at`, active, Page 2 (not before) | runner |
| 5 | Used / manually-expired token → expired screen, status unchanged | runner + `expire-magic-link.sh` |
| 6 | Email already under another provider → conflict, no duplicate | runner + browser |
| 7 | Cancel on shim → cancelled screen | runner + browser |
| 8 | Simulated exchange failure → provider/config error, no raw text | runner + browser |
| 9 | Website → `tool_use` + `llm_use`, 150–200 words, done | runner + `db-counts.sh` |
| 10 | Resume → story, no `tool_use` | runner |
| 11 | Quick questions → story, no `tool_use` | runner |
| 12 | Empty Skip → no call, `not_started`, no story | runner |
| 13 | Shimmer while processing → text without refresh | runner + browser |
| 14 | Each field: Save persists, Cancel discards | runner (Save) + browser (Cancel) |
| 15 | Photo upload replaces image, updates `photo_s3_key` | runner + browser |
| 16 | Package buttons inert, no console errors | browser |
| 17 | Presigned photo URL resolves to the image | runner + open the URL |

## 11. Decisions and open items
- The Starter Pack's `minio/minio` image no longer downloads, so docker-compose uses `cgr.dev/chainguard/minio` (same MinIO server) with `user: "0:0"` for the local volume.

- **Expired-link copy** isn't in the fallback wireframe (it has three states); the text in `frontend/src/lib/signinCopy.js` is a placeholder in the same tone.
- **Conflict copy** is the wireframe's exact text, which mentions a password; password login doesn't exist, so the primary button starts the magic-link flow.
- Fallback copy names the provider actually used (the wireframe hard-codes LinkedIn / Google).
- **Groq** is available via `LLM_PROVIDER` for local runs; the epic specifies Anthropic.
- Returning coaches with the same provider sign in instead of creating a duplicate row.
- Out of scope by design: package functionality, other nav items, client features, real OAuth/Cognito/S3; institute flows beyond tenancy detection.

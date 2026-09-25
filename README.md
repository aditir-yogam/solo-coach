# Solo Coach Onboarding

This repository is my delivery for Epic 1, Solo Coach Onboarding. It covers the whole journey a new coach goes through on the platform: signing up, telling us a little about themselves, getting an AI-written story for their profile, and landing on a portfolio page they can edit.

It is a full vertical slice. There is a real React frontend, a real FastAPI backend, real database writes, real file storage, and real calls to Firecrawl and an LLM. Everything except those two external APIs runs on your own machine through Docker, so nothing touches production systems or real cloud accounts.

If you only want to get it running, jump to "Getting it running". If you want to understand how it works or how it maps to the epic, the later sections go through that in detail.


## What the app does

A coach arrives at the sign-up page and chooses how to create their account. They can continue with Google, continue with LinkedIn, or type their name and email and receive a sign-in link. Google and LinkedIn are simulated locally, because the epic asks for a local stand-in rather than real OAuth. The email link is sent through Mailpit, a fake inbox that runs on your machine, so no real email ever leaves your computer.

After signing in, the coach reaches the personalization page. There is always a short text box where they describe, in a sentence or two, what they want clients to know about them. Below it they choose one of two ways to share more. The default is "Add automatically", where they give us their website address or upload a resume PDF. The alternative is "Answer a few quick questions", where they pick their coaching niche, any credentials they hold, and roughly how many clients they coach. They can also skip the page entirely.

When they continue, the backend writes a short first-person story about the coach. It reads the website with Firecrawl if one was given, otherwise it reads the resume, otherwise it uses the quick answers. The coach's own sentence is always included. The story is written by an LLM using the locked prompt supplied with the epic.

Finally the coach lands on their portfolio. While the story is being written they see a soft loading shimmer, and the text appears on its own when it is ready. On the portfolio they can edit their name, headline, story heading, story text, LinkedIn handle and email, upload or change their photo, and see four placeholder package slots that intentionally do nothing yet. There is also a Download / Print button that opens the browser's print dialog.


## How it is put together

Everything is served from a single address, http://localhost:4000. The backend serves the API, the built frontend, the email verification link and the fake Google/LinkedIn login page from that one place. Keeping it on one origin means the session cookie just works and there is no cross-origin setup to worry about.

```
Browser  ->  app (http://localhost:4000)
              FastAPI backend + built React frontend + fake sign-in page
              |
              |--  PostgreSQL   the four tables from init.sql, unchanged
              |--  Mailpit      catches every email; inbox at http://localhost:8025
              |--  MinIO        stores photos and resumes; console at http://localhost:9001
              |--  Firecrawl    real API, reads the coach's website
              |--  LLM          real API, writes the story (Anthropic, or Groq for local runs)
```

The story pipeline looks like this:

```
Page 2 submit  ->  save the fields  ->  POST .../story/generate  (returns 202 straight away)
                                              |
                                        background task
                                              |
      website saved?  -> Firecrawl scrape  (if it fails, fall through to the next source)
      resume saved?   -> read the PDF text
      otherwise       -> join the quick answers into plain text
                                              |
                  locked prompt + source material + the coach's own sentence
                                              |
                                  LLM  ->  coach_story, bio_status = done
```

### Where things live in the repository

| Path | What you will find there |
|---|---|
| `backend/app/main.py` | The FastAPI application, error handling, and serving of the built frontend |
| `backend/app/routes/auth.py` | Google and LinkedIn start and callback, the magic-link request, and `/verify` |
| `backend/app/routes/coaches.py` | Page 2 submission, story generation, portfolio, edits and photo upload |
| `backend/app/auth_shim.py` | The fake authorize page and the stubbed code exchange with the fixture accounts |
| `backend/app/services/story.py` | The story pipeline: choosing the source, logging, and handling failures |
| `backend/app/services/` | Firecrawl, PDF reading, LLM calls, prompt building and the word limit |
| `backend/app/repositories.py` | Every SQL statement in the project, kept in one file so it is easy to audit |
| `backend/prompts/story_prompt_template.txt` | The locked prompt, byte for byte as it was provided |
| `backend/tests/` | Unit tests for validation, prompt building, PDF reading and the word limit |
| `frontend/src/pages/` | The screens: sign up, check your email, sign-in problems, personalize, portfolio |
| `acceptance/` | A script that runs all 17 test scenarios from the epic against the live stack |
| `scripts/` | Small helpers for checking the database, the schema and demo situations |
| `wireframes/` | The four wireframes that came with the epic |
| `init.sql` | The provided schema, identical to the Starter Pack file |


## What you need before you start

You need Docker Desktop installed and running. On a Mac you will know it is running when the whale icon in the menu bar has stopped animating.

You need Node.js 20 or newer, but only for running the automated acceptance tests. The app itself runs entirely inside Docker.

You need a Firecrawl API key. The free tier at https://firecrawl.dev is plenty, since each website story uses about one credit.

You need a key for the story writer. The epic specifies Anthropic, so the intended setup is an Anthropic key from https://console.anthropic.com with a small amount of credit on it. For local development you can use a free Groq key from https://console.groq.com instead. Section "Choosing the story writer" explains the difference.


## Getting it running

Clone the repository and move into it.

```bash
git clone https://github.com/aditir-yogam/solo-coach.git
cd solo-coach
```

Create your own settings file from the template. This file holds your keys, so it is ignored by git and never committed.

```bash
cp .env.example .env
```

Generate a random secret for signing the session cookie.

```bash
openssl rand -hex 32
```

Open `.env` in any editor and fill in these values. Leave everything else as it is, because the defaults are already correct for the local stack.

```
SESSION_SECRET=the long string openssl printed
FIRECRAWL_API_KEY=your Firecrawl key, it starts with fc-
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your Anthropic key, it starts with sk-ant-
```

Start everything.

```bash
docker compose up --build
```

The first build takes a few minutes because Docker downloads Postgres, MinIO, Mailpit, Python and Node. You will know it is ready when you see a line containing `app ready`. Leave that terminal open and open http://localhost:4000 in your browser. It takes you straight to the sign-up page.

To stop everything, press Ctrl+C in that terminal, or run `docker compose down` from another one. To start completely fresh, with an empty database, an empty inbox and no stored files, run `./scripts/reset.sh`.

### About the storage bucket

Story 1 of the epic asks for a MinIO bucket called `coaching-platform-dev` to be created by hand in the MinIO console at http://localhost:9001, where you log in with `devkey` and `devsecret123`. You can still do that. If the bucket is missing when the app starts, the app creates it for you and logs `created bucket`, so a fresh setup never gets stuck on it. Newer MinIO builds have a much simpler web console, and on some of them the create-bucket button is not there at all, which is another reason the automatic creation is useful.

### The addresses you will use

| What | Address | Login |
|---|---|---|
| The app | http://localhost:4000 | none |
| Sign-up for an institute coach | http://localhost:4000/join?org=acme | none |
| Interactive API documentation | http://localhost:4000/api/docs | uses your browser session |
| Email inbox (Mailpit) | http://localhost:8025 | none |
| File storage console (MinIO) | http://localhost:9001 | devkey / devsecret123 |
| Database (Postgres) | localhost, port 5432 | dev / dev_local_only, database coaching_platform_dev |


## Choosing the story writer

The setting `LLM_PROVIDER` decides which service writes the stories.

`LLM_PROVIDER=anthropic` is what the epic asks for. It uses `ANTHROPIC_API_KEY` and, by default, the model `claude-haiku-4-5-20251001`. Each story costs well under a US cent.

`LLM_PROVIDER=groq` uses Groq's free tier, which is handy while developing. It uses `GROQ_API_KEY` and `GROQ_MODEL`. Groq changes its model list from time to time, so if you see a "model does not exist" error, list the models your key can use and pick a general chat model such as `openai/gpt-oss-120b`:

```bash
GROQ_KEY=$(grep -E '^GROQ_API_KEY=' .env | cut -d= -f2-)
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_KEY" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | sort
```

Reasoning models like gpt-oss spend part of their output budget thinking before they write, so when using one I set `LLM_MAX_TOKENS=2000` in `.env`. The story itself is still limited to 200 words.

Whichever provider you use, the `llm_use` table records it honestly, so a Groq run shows `provider = groq`. The epic's Test 9 expects `anthropic`, so the demo should run on Anthropic unless Groq has been agreed.

To switch providers and restart the app in one step:

```bash
./scripts/set-provider.sh anthropic
./scripts/set-provider.sh groq
```


## All the settings in .env

| Setting | What it does |
|---|---|
| `SESSION_SECRET` | Signs the session cookie. Any long random string. |
| `FIRECRAWL_API_KEY` | Your Firecrawl key, used to read coach websites. |
| `FIRECRAWL_API_URL` | Defaults to `https://api.firecrawl.dev/v1`. If Firecrawl retires v1, change it to `https://api.firecrawl.dev/v2`. |
| `LLM_PROVIDER` | `anthropic` or `groq`. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | The Anthropic key and model. |
| `GROQ_API_KEY`, `GROQ_MODEL` | The Groq key and model. |
| `LLM_MAX_TOKENS` | How many tokens the model may produce. 700 by default; 2000 is better for reasoning models. |
| `ANTHROPIC_INPUT_USD_PER_MTOK`, `ANTHROPIC_OUTPUT_USD_PER_MTOK` | Only used to fill in `llm_use.cost_usd`. Check current pricing if you want accurate numbers. |
| `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT` | Local connection details. Inside Docker these are replaced automatically with the service names. |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | MinIO login and bucket. They must match the MinIO service, which uses `devkey` and `devsecret123`. |
| `S3_PUBLIC_ENDPOINT_URL` | The address the browser uses to load photos, `http://localhost:9000`. |
| `S3_AUTO_CREATE_BUCKET` | `true` creates the bucket if it is missing. Set it to `false` if you want to insist on the manual step. |
| `AUTH_SHIM_URL` | The fake Google/LinkedIn login page, `http://localhost:4000/auth-shim/authorize`. |
| `MAGIC_LINK_TTL_HOURS` | How long a sign-in link stays valid. 24 hours, as the epic asks. |

No real key, password or secret is written anywhere in the code. The only credentials in the repository are the local MinIO and Postgres development logins, which come from the Starter Pack.


## How signing in works

### Google and LinkedIn

When the coach clicks Google or LinkedIn, the backend sends the browser to the local fake login page named in `AUTH_SHIM_URL`, telling it which provider to imitate. That page stands in for the real Cognito and Google or LinkedIn round trip and offers three buttons.

Continue as the fixture account sends the browser back with a short-lived code. The backend exchanges that code using a stubbed function that returns a fixed set of details. For Google that is the subject `google-fake-001`, the email `jordan@example.com` and the name Jordan Blake. For LinkedIn it is `linkedin-fake-001`, `priya@example.com` and Priya Raman.

Cancel sends the browser back with `error=access_denied`, and the coach sees the "Sign-in cancelled" screen.

Simulate exchange failure opens the page with `?simulate=error`, so the code exchange fails on purpose and the coach sees the provider error screen. The error details are logged on the server and never shown to the coach.

Before creating anyone, the backend looks for an existing coach with the same email. If one exists and signed up in a different way, the coach sees the account conflict screen and nothing new is created. Otherwise the backend downloads the profile picture from the details, stores it in MinIO at `coaches/{coach_id}/photo.jpg`, and creates the coach as active with the provider, the subject and the photo location. Then the coach goes to Page 2.

If the same Google or LinkedIn account signs in a second time, the existing coach is simply signed in again rather than creating a duplicate row.

### Email sign-in link

When a coach enters their name and email and clicks "Send me a sign-in link", the backend first runs the same conflict check. If the email is clear, it creates the coach as pending with the provider `email`, generates a random 32-byte token, stores it in `magic_link_tokens` with an expiry 24 hours ahead, and emails a link of the form `http://localhost:4000/verify?token=...`.

Remember that the email goes to Mailpit, not your real inbox. Open http://localhost:8025 to find it, even if you typed a real address.

When the link is clicked, `/verify` checks the token. An unknown token shows the provider error screen. A token that was already used, or has expired, shows the expired link screen. Otherwise the token is marked as used, the coach becomes active, and they go to Page 2. Until that click the coach has no session, so Page 2 cannot be reached early.

### The four problem screens

These follow the sign-in fallback wireframe and can also be opened directly, which is useful in a demo:

- Provider or configuration error: http://localhost:4000/signin/error?reason=provider&provider=google
- Sign-in cancelled: http://localhost:4000/signin/error?reason=cancelled&provider=linkedin
- Account conflict: http://localhost:4000/signin/error?reason=conflict&provider=google
- Expired link: http://localhost:4000/signin/error?reason=expired&provider=email

To sign out and try a different account, visit http://localhost:4000/auth/logout.

### Institute coaches

Story 2 asks the sign-up address to detect tenancy. Signing up at `/join` creates a solo coach, with `coach_type` set to `SO` and no organization. Signing up at `/join?org=acme` or `/join?org=northstar` creates an institute coach, with `coach_type` set to `IN` and the matching `org_id` from a small hard-coded lookup, because real organization lookup is out of scope. The code travels through every sign-in path, and files for institute coaches are stored under `orgs/{org_id}/coaches/{coach_id}/`. Unknown codes are refused.


## How Page 2 and the story work

Continue and Skip save things in exactly the same way, as Story 8 describes. If the text box has something in it, it is saved as `story_text`. On the "Add automatically" tab, a website address is saved as `website_url`, and an uploaded PDF is stored in MinIO at `coaches/{coach_id}/resume.pdf` with its location saved as `resume_s3_key`. On the quick questions tab, the choices are saved as `coaching_niche`, `credential` and `clients_coached`.

After saving, the app checks whether there is anything to work with. If the text, website, resume, niche, credential and client count are all empty, it goes straight to the portfolio and `bio_status` stays `not_started`. If anything at all was given, even just the sentence, the page calls `POST /api/v1/app/coaches/{coach_id}/story/generate`.

That endpoint marks the coach as `processing`, answers with 202 immediately, and does the real work in a FastAPI background task. Marking the coach as processing is done as a single database operation that only succeeds once, so a double click or a repeated request never starts a second run or writes extra log rows.

The background task picks its source in the order the epic gives. If a website is saved, it asks Firecrawl to read that page and writes a `tool_use` row with the tool name `firecrawl`, the purpose `website_crawl_for_story`, the credits Firecrawl reports, and whether it worked. If Firecrawl fails, the failure is logged in that row and the task moves on to the next source rather than giving up. If a resume is saved, the PDF is read locally, so no `tool_use` row is needed. Otherwise the niche, credential and client count are joined into plain text.

The locked prompt is then filled in. The file is used exactly as provided. Its `{story_heading}` placeholder is replaced with the coach's story heading, and the source material and the coach's own sentence are added as clearly labelled sections, as the notes at the bottom of the template describe.

Every run writes exactly one `llm_use` row, whether it succeeds or fails, with the purpose `generate_coach_story`, the provider, the model, the token counts and the status. On success the story is saved and `bio_status` becomes `done`. If the model goes over 200 words, the text is cut back to the last complete sentence that fits. If anything fails, `bio_status` goes back to `not_started` so the portfolio never spins forever, and the reason is kept in the log row's `error_message`.


## The portfolio page

`GET /api/v1/app/coaches/{coach_id}/portfolio` returns the coach's name, headline, niche, credential, story heading, story, story status, LinkedIn handle and email, plus `photo_presigned_url`. That photo address is created fresh for every request and expires after 15 minutes. The database only ever stores the file's location, never a web address.

Every editable field works the same way. Clicking the pencil turns the text into an input with Save and Cancel. Save sends `PATCH /api/v1/app/coaches/{coach_id}` and updates the page from the server's reply. Cancel puts the old value back and sends nothing at all. Enter saves and Escape cancels.

To change the photo, click the pencil on the small photo, or either "Add photo" box if there is no photo yet. That opens a file picker. The chosen image is uploaded, stored at `coaches/{coach_id}/photo.jpg` in place of any previous one, its location is saved through the same PATCH endpoint, and the picture refreshes.

The niche and credential tags are read only in this epic. While the story is being written the page checks every few seconds and shows the shimmer, then swaps in the text by itself. The four package slots are disabled buttons with nothing attached to them, so clicking them does nothing and causes no errors.

For safety, the edit endpoint only accepts the seven fields Story 12 lists, the photo location has to be the coach's own file, and the coach id in the address has to belong to the signed-in coach, otherwise the request is refused.


## API reference

| Method and path | What it does |
|---|---|
| `GET /auth/{google or linkedin}/start` | Sends the browser to the fake login page |
| `GET /auth-shim/authorize` and `POST /auth-shim/decision` | The fake login page with Continue, Cancel and simulate error |
| `GET /auth/{provider}/callback` | Exchanges the code, checks for conflicts, stores the photo, creates the coach |
| `POST /api/v1/auth/magic-link` | Creates a pending coach, a token and the email |
| `GET /verify?token=...` | Checks the link and activates the coach |
| `GET /api/v1/app/me` | The signed-in coach |
| `POST /api/v1/app/coaches/{coach_id}/personalize` | Saves Page 2, for both Continue and Skip |
| `POST /api/v1/app/coaches/{coach_id}/story/generate` | Starts story generation and returns 202 |
| `GET /api/v1/app/coaches/{coach_id}/portfolio` | Everything the portfolio page shows |
| `PATCH /api/v1/app/coaches/{coach_id}` | Saves edits, including the photo location |
| `POST /api/v1/app/coaches/{coach_id}/photo` | Uploads a new photo to MinIO |
| `GET /auth/logout` | Signs out |

You can try all of these from http://localhost:4000/api/docs. Sign in first in the same browser and the documentation page will use your session.


## Testing

### The automated acceptance run

With the stack running and your keys in `.env`, open a second terminal and run:

```bash
cd acceptance
npm install
npm test
```

This goes through all 17 scenarios from the epic, plus a check of the institute sign-up, and prints PASS or FAIL for each one with the details it checked. It really signs in through the fake login page, reads the emails from Mailpit, submits Page 2, waits for real Firecrawl and LLM calls, and looks directly at the database to confirm the rows. It finishes with a summary such as `18/18 automated checks passed`.

The Google and LinkedIn accounts always use the same fixture emails, so before starting the script removes the rows belonging to those two accounts and to its own earlier test emails. It only deletes data, never anything in the schema, which means you can run it as many times as you like. Each run makes three LLM calls and one Firecrawl call.

To get a nicer website story, point it at a real coach's site:

```bash
TEST_WEBSITE_URL=https://a-real-coach-site.com npm test
```

### Unit tests

```bash
cd backend
pip install -r requirements.txt -r requirements-dev.txt
pytest -q
```

### Proving the schema is untouched

```bash
./scripts/verify-schema.sh
```

This builds a scratch database from `init.sql`, compares every table, column, type, default and constraint with the live database, and searches the backend code for any statement that creates, alters or drops tables. It prints PASS when everything matches.

### Handy helpers

| Command | What it shows or does |
|---|---|
| `./scripts/db-counts.sh` | Every coach with their story status, number of `llm_use` and `tool_use` rows, and story length |
| `./scripts/db-counts.sh someone@example.com` | The same for one coach, plus their log rows and any error messages |
| `./scripts/expire-magic-link.sh someone@example.com` | Makes that coach's unused links expired, for Test 5 |
| `./scripts/force-processing.sh someone@example.com` | Puts the coach into processing so you can see the shimmer; add `--done` to undo |
| `./scripts/set-provider.sh anthropic` | Switches the story writer and restarts the app |
| `./scripts/reset.sh` | Wipes the database, inbox and files and starts again |
| `docker compose logs -f app` | Follows the backend log live; Ctrl+C stops following |


## Checking the 17 scenarios by hand

The acceptance script covers every scenario, and a few are best confirmed by eye as well. For these checks the browser's developer tools help: press Cmd+Option+I and look at the Network and Console tabs.

| Scenario | How to see it yourself |
|---|---|
| 1. Google sign-in | On `/join` click Google, then Continue as Jordan Blake. You land on Page 2, and the photo is in MinIO under `coaches/` |
| 2. LinkedIn sign-in | The same with LinkedIn and Priya Raman |
| 3. Email sign-up | Enter a new email on `/join`. The email appears in Mailpit and `db-counts.sh` shows the coach as pending |
| 4. Magic link | Click the link in Mailpit. The coach becomes active and Page 2 opens |
| 5. Used or expired link | Click the same link again, or run `expire-magic-link.sh` first. The expired screen appears and the status does not change |
| 6. Account conflict | Enter `jordan@example.com` on `/join` after signing in with Google once |
| 7. User cancelled | Press Cancel on the fake login page |
| 8. Exchange failure | Click "Simulate exchange failure" on the fake login page, then continue |
| 9. Website story | Give a website on Page 2. `db-counts.sh` shows one `llm_use` and one `tool_use` |
| 10. Resume story | Upload `acceptance/fixtures/sample-resume.pdf`. One `llm_use`, no `tool_use` |
| 11. Quick questions | Pick niche, credential and client count. One `llm_use`, no `tool_use` |
| 12. Empty skip | Leave everything empty and skip. No story and `bio_status` stays `not_started` |
| 13. Shimmer | After Continue the portfolio shimmers, then the story appears without refreshing |
| 14. Editing | Change each field and save, then reload. Change one and press Cancel, and nothing is sent |
| 15. Photo upload | Click the pencil on the photo and choose an image. It changes, and the file in MinIO is replaced |
| 16. Package buttons | Click all four. Nothing happens and the Console stays empty |
| 17. Photo address | Copy `photo_presigned_url` from the portfolio response in the Network tab and open it in a new tab |

Keep in mind that the story source is chosen from what is saved on the coach. Once a website is saved for an account, every later story for that account uses the website. To test each source cleanly, use a fresh email for each one, or reset first.


## Decisions and things still open

These are the places where I had to make a call, or where the provided materials left a gap. I would rather be upfront about them than have them come as a surprise.

The expired link screen is not in the sign-in fallback wireframe, which only shows three of the four states. The text it uses now is a placeholder written in the same tone, kept in `frontend/src/lib/signinCopy.js`, and it can be swapped for the real copy in one place.

The account conflict screen uses the wireframe's exact wording, which mentions an existing account "using a password". There is no password sign-in in this epic, so its main button takes the coach to the email sign-in link instead.

The wireframe's problem screens always name LinkedIn, or Google on the conflict screen. The app names whichever provider the coach actually used.

The epic asks for Anthropic. Groq is available through `LLM_PROVIDER` for local runs, and the log records whichever provider was really used.

When the same Google or LinkedIn account signs in again, it is signed in rather than inserted a second time, so there are never duplicate coaches for the same email.

The Starter Pack's MinIO image, `minio/minio`, can no longer be downloaded, and the `quay.io` copy asks for a login. The compose file therefore uses `cgr.dev/chainguard/minio`, which is the same MinIO server published by Chainguard. It runs with `user: "0:0"` so it can write to its local storage volume. The database schema is not affected in any way.

The compose file also adds a health check for Postgres, actually mounts the `minio_data` volume that the Starter Pack declared but never attached, and adds the `app` service. If port 5432 is already taken on your machine by another Postgres, stop that one while you work on this project, or change the host side of the port mapping in `docker-compose.yml`.

Some reasoning models occasionally invent a small client anecdote to satisfy the prompt's request for a specific, emotionally real opening, even though the same prompt says not to invent specifics. It is worth reading generated stories before showing them.

Things that are out of scope by design and deliberately not built: any package or pricing functionality, navigation items other than Portfolio, client login, booking or calendars, real OAuth, Cognito or cloud storage, and institute features beyond detecting the tenancy at sign-up.


## Troubleshooting

"Cannot connect to the Docker daemon" means Docker Desktop is not running. Open it with `open -a Docker`, wait for the whale icon to settle, and try again.

"port is already allocated" for 5432 means another Postgres is using that port. Run `docker ps --filter publish=5432` to see which container it is and stop it, or change the host port in `docker-compose.yml`.

"pull access denied for minio/minio" means your compose file still uses the old image. Use `cgr.dev/chainguard/minio:latest` as described above.

Repeated "object storage error" with code 403 in the app log means the app and MinIO disagree on the login. Check that `.env` contains `S3_ACCESS_KEY=devkey` and `S3_SECRET_KEY=devsecret123`, then run `docker compose up -d --force-recreate app`.

A story that never appears usually means the LLM call failed. Run `./scripts/db-counts.sh` with the coach's email and read the error column. The usual causes are a missing or mistyped key, a model name your account does not have, or a rate limit on a free tier.

No sign-in email is expected in your real inbox. They all go to Mailpit at http://localhost:8025.

`npm test` saying "Missing script" means you are not in the `acceptance` folder.

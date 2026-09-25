#!/usr/bin/env node
// Acceptance runner for the 17 testing scenarios in the (revised) epic.
//
//   docker compose up --build        (in one terminal)
//   cd acceptance && npm install && npm test
//
// Drives the real HTTP flows (fake auth shim, magic links via Mailpit, Page 2,
// real Firecrawl + LLM calls) and checks Postgres directly. The fixture coaches
// (jordan@example.com, priya@example.com) are fixed by the spec, so the runner
// first deletes rows belonging to them and to earlier runner emails — data only,
// never schema. Purely visual checks are listed for the browser.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const APP = process.env.APP_URL || 'http://localhost:4000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const DB_URL = process.env.DATABASE_URL || 'postgres://dev:dev_local_only@localhost:5432/coaching_platform_dev';
const WEBSITE = process.env.TEST_WEBSITE_URL || 'https://en.wikipedia.org/wiki/Coaching';
const RESUME = process.env.TEST_RESUME_PDF || path.join(__dirname, 'fixtures', 'sample-resume.pdf');
const GEN_TIMEOUT_MS = Number(process.env.GEN_TIMEOUT_MS || 150000);
const RUN = Date.now().toString(36);
const GOOGLE_EMAIL = 'jordan@example.com';
const LINKEDIN_EMAIL = 'priya@example.com';

const results = [];
const db = new Client({ connectionString: DB_URL.replace(/^postgresql:/, 'postgres:') });

class Jar {
  constructor() {
    this.c = {};
  }
  store(res) {
    for (const line of res.headers.getSetCookie?.() || []) {
      const [pair, ...attrs] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim().replace(/^"|"$/g, '');
      if (!value || attrs.some((a) => /max-age=0|expires=Thu, 01 Jan 1970/i.test(a))) delete this.c[name];
      else this.c[name] = value;
    }
  }
  header() {
    return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function req(jar, url, opts = {}) {
  const full = url.startsWith('http') ? url : `${APP}${url}`;
  const headers = { ...(opts.headers || {}) };
  if (jar) headers.cookie = jar.header();
  const res = await fetch(full, { redirect: 'manual', ...opts, headers });
  if (jar) jar.store(res);
  return res;
}
const json = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const words = (t) => (String(t || '').trim() ? String(t).trim().split(/\s+/).length : 0);
const q = async (sql, params) => (await db.query(sql, params)).rows;
const loc = (res) => res.headers.get('location') || '';

function expect(details, cond, msg) {
  details.push(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) throw new Error(msg);
}

async function test(n, name, fn, manual) {
  const details = [];
  let pass = true;
  try {
    await fn(details);
  } catch (err) {
    pass = false;
    if (!details.some((d) => d.startsWith('FAIL'))) details.push(`FAIL error: ${err.message}`);
  }
  results.push({ n, name, pass, manual });
  console.log(`\n[${pass ? 'PASS' : 'FAIL'}] ${n}. ${name}`);
  details.forEach((d) => console.log(`       - ${d}`));
  if (manual) console.log(`       * In the browser: ${manual}`);
}

async function socialSignIn(provider, decision = 'approve', { simulate = false, org = '' } = {}) {
  const jar = new Jar();
  const qs = new URLSearchParams({ ...(org ? { org } : {}), ...(simulate ? { simulate: 'error' } : {}) });
  const start = await req(jar, `/auth/${provider}/start${qs.toString() ? `?${qs}` : ''}`);
  const authorize = new URL(loc(start), APP);
  const page = await req(null, authorize.toString());
  const form = new URLSearchParams({
    provider,
    redirect_uri: authorize.searchParams.get('redirect_uri'),
    state: authorize.searchParams.get('state'),
    decision,
    simulate: authorize.searchParams.get('simulate') || '',
  });
  const decided = await req(null, '/auth-shim/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const callback = await req(jar, loc(decided));
  return { jar, authorize, pageHtml: await page.text(), location: loc(callback) };
}

async function mailFor(email) {
  for (let i = 0; i < 20; i += 1) {
    const s = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    if (s.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${s.messages[0].ID}`)).json();
      const m = String(msg.Text || '').match(/https?:\/\/\S+\/verify\?token=[A-Za-z0-9_\-%]+/);
      return { subject: msg.Subject, link: m && m[0] };
    }
    await sleep(500);
  }
  return null;
}

async function magicSignUp(email, name, org = '') {
  await req(null, '/api/v1/auth/magic-link', json('POST', { name, email, org }));
  const mail = await mailFor(email);
  const jar = new Jar();
  const click = await req(jar, mail.link);
  return { jar, location: loc(click) };
}

const coachByEmail = async (email) => (await q('SELECT * FROM coaches WHERE lower(coach_email) = lower($1)', [email]))[0];
async function counts(coachId) {
  const [l] = await q('SELECT count(*)::int n FROM llm_use WHERE coach_id = $1', [coachId]);
  const [t] = await q('SELECT count(*)::int n FROM tool_use WHERE coach_id = $1', [coachId]);
  return { llm: l.n, tool: t.n };
}

async function personalize(jar, coachId, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('resume', new Blob([fs.readFileSync(file)], { type: 'application/pdf' }), path.basename(file));
  const res = await req(jar, `/api/v1/app/coaches/${coachId}/personalize`, { method: 'POST', body: fd });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function generate(jar, coachId) {
  const res = await req(jar, `/api/v1/app/coaches/${coachId}/story/generate`, { method: 'POST' });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const portfolio = async (jar, coachId) => (await req(jar, `/api/v1/app/coaches/${coachId}/portfolio`)).json();

async function waitForStory(jar, coachId) {
  const t0 = Date.now();
  let sawProcessing = false;
  let p;
  while (Date.now() - t0 < GEN_TIMEOUT_MS) {
    p = await portfolio(jar, coachId);
    if (p.bio_status !== 'processing') break;
    sawProcessing = true;
    await sleep(1000);
  }
  return { p, sawProcessing, secs: Math.round((Date.now() - t0) / 1000) };
}

const shimmerEvidence = [];

async function checkRun(d, jar, email, fields, file, tool) {
  const coach = await coachByEmail(email);
  const p2 = await personalize(jar, coach.coach_id, fields, file);
  expect(d, p2.status === 200 && p2.body.generate === true, `Page 2 saved; server says generate=${p2.body.generate}`);
  const g = await generate(jar, coach.coach_id);
  expect(d, g.status === 202 && g.body.bio_status === 'processing', `POST …/story/generate → ${g.status}, bio_status=${g.body.bio_status}`);
  const { p, sawProcessing, secs } = await waitForStory(jar, coach.coach_id);
  shimmerEvidence.push(sawProcessing);
  expect(d, p.bio_status === 'done', `bio_status = done after ~${secs}s (got ${p.bio_status})`);
  const n = words(p.coach_story);
  expect(d, n >= 150 && n <= 200, `coach_story is ${n} words (150–200)`);
  const c = await counts(coach.coach_id);
  expect(d, c.llm === 1, `exactly one llm_use row (got ${c.llm})`);
  expect(d, c.tool === (tool ? 1 : 0), `${tool ? 'one' : 'no'} tool_use row (got ${c.tool})`);
  const [l] = await q('SELECT provider, model, status, input_tokens, output_tokens, cost_usd FROM llm_use WHERE coach_id = $1', [coach.coach_id]);
  expect(d, l.status === 'success', `llm_use: provider=${l.provider}, model=${l.model}, ${l.input_tokens} in / ${l.output_tokens} out, cost ${l.cost_usd}`);
  if (l.provider !== 'anthropic') d.push(`NOTE provider is '${l.provider}' — the epic expects 'anthropic' for the demo`);
  if (tool) {
    const [t] = await q('SELECT tool_name, purpose, status, credits_used FROM tool_use WHERE coach_id = $1', [coach.coach_id]);
    expect(d, t.tool_name === 'firecrawl' && t.purpose === 'website_crawl_for_story' && t.status === 'success', `tool_use: ${t.tool_name} / ${t.purpose} / ${t.status} (credits ${t.credits_used})`);
  }
  d.push(`story: "${String(p.coach_story).replace(/\s+/g, ' ').slice(0, 110)}…"`);
}

async function main() {
  await db.connect();
  if (!(await fetch(`${APP}/api/health`).then((r) => r.ok).catch(() => false))) {
    console.error(`App is not reachable at ${APP}. Start it with: docker compose up --build`);
    process.exit(2);
  }
  const old = await q(
    `SELECT coach_id FROM coaches WHERE lower(coach_email) IN ($1, $2) OR coach_email LIKE '%.acceptance@example.com'`,
    [GOOGLE_EMAIL, LINKEDIN_EMAIL],
  );
  const ids = old.map((r) => r.coach_id);
  if (ids.length) {
    for (const t of ['llm_use', 'tool_use', 'magic_link_tokens']) await q(`DELETE FROM ${t} WHERE coach_id = ANY($1)`, [ids]);
    await q('DELETE FROM coaches WHERE coach_id = ANY($1)', [ids]);
  }
  console.log(`Acceptance run ${RUN} against ${APP} (cleared ${ids.length} fixture/test coaches from earlier runs)`);

  const magicA = `a.${RUN}.acceptance@example.com`;
  const html = await (await fetch(`${APP}/join`)).text();
  const jsPath = (html.match(/src="(\/assets\/[^"]+\.js)"/) || [])[1];
  const bundle = jsPath ? await (await fetch(`${APP}${jsPath}`)).text() : '';
  let google;
  let linkedin;
  const magic = {};

  await test(1, 'Google sign-in → active row, photo in MinIO, photo_s3_key, Page 2', async (d) => {
    google = await socialSignIn('google');
    expect(d, google.authorize.pathname === '/auth-shim/authorize' && google.authorize.searchParams.get('provider') === 'google', 'redirected to the fake authorize endpoint with provider=google');
    expect(d, google.location === '/personalize', `callback → ${google.location}`);
    const c = await coachByEmail(GOOGLE_EMAIL);
    expect(d, c && c.status === 'active' && c.auth_provider === 'google' && c.cognito_sub === 'google-fake-001', `row: status=${c?.status}, auth_provider=${c?.auth_provider}, cognito_sub=${c?.cognito_sub}`);
    expect(d, c.coach_type === 'SO' && c.org_id === null && c.coach_name === 'Jordan Blake', `coach_type=${c.coach_type}, org_id=${c.org_id}, name=${c.coach_name}`);
    expect(d, c.photo_s3_key === `coaches/${c.coach_id}/photo.jpg`, `photo_s3_key = ${c.photo_s3_key}`);
    const p = await portfolio(google.jar, c.coach_id);
    const img = await fetch(p.photo_presigned_url);
    expect(d, img.ok && img.headers.get('content-type') === 'image/jpeg', `object exists in MinIO (${img.status} ${img.headers.get('content-type')})`);
    expect(d, (await req(google.jar, '/api/v1/app/me')).status === 200, 'Page 2 API reachable with the new session');
  }, 'click Google on http://localhost:4000/join, then "Continue as Jordan Blake".');

  await test(2, 'LinkedIn sign-in → same, auth_provider=linkedin', async (d) => {
    linkedin = await socialSignIn('linkedin');
    expect(d, linkedin.location === '/personalize', `callback → ${linkedin.location}`);
    const c = await coachByEmail(LINKEDIN_EMAIL);
    expect(d, c && c.status === 'active' && c.auth_provider === 'linkedin' && c.cognito_sub === 'linkedin-fake-001', `row: status=${c?.status}, auth_provider=${c?.auth_provider}, cognito_sub=${c?.cognito_sub}`);
    expect(d, c.photo_s3_key === `coaches/${c.coach_id}/photo.jpg`, `photo_s3_key = ${c.photo_s3_key}`);
  });

  await test(3, 'Email submit → pending row, token row, email in Mailpit', async (d) => {
    const res = await req(null, '/api/v1/auth/magic-link', json('POST', { name: 'Maya Okafor', email: magicA }));
    expect(d, res.status === 200, `POST /api/v1/auth/magic-link → ${res.status}`);
    const c = await coachByEmail(magicA);
    expect(d, c.status === 'pending' && c.auth_provider === 'email' && c.cognito_sub === null, `row: status=${c.status}, auth_provider=${c.auth_provider}, cognito_sub=${c.cognito_sub}`);
    const [t] = await q('SELECT expires_at, created_at, used_at FROM magic_link_tokens WHERE coach_id = $1', [c.coach_id]);
    const hours = (new Date(t.expires_at) - new Date(t.created_at)) / 36e5;
    expect(d, Math.abs(hours - 24) < 0.01 && t.used_at === null, `token row: expires in ${hours.toFixed(2)}h, used_at null`);
    const mail = await mailFor(magicA);
    expect(d, Boolean(mail?.link), `email in Mailpit: "${mail?.subject}" with a /verify?token= link`);
    magic.link = mail.link;
  }, 'open http://localhost:8025 and see the email.');

  await test(4, 'Magic link → used_at set, active, Page 2 (not before)', async (d) => {
    const jar = new Jar();
    expect(d, (await req(jar, '/api/v1/app/me')).status === 401, 'before clicking: Page 2 API returns 401');
    const click = await req(jar, magic.link);
    expect(d, loc(click) === '/personalize', `click → ${loc(click)}`);
    const c = await coachByEmail(magicA);
    const [t] = await q('SELECT used_at FROM magic_link_tokens WHERE coach_id = $1', [c.coach_id]);
    expect(d, c.status === 'active' && t.used_at !== null, `status=${c.status}, used_at set`);
    expect(d, (await req(jar, '/api/v1/app/me')).status === 200, 'after clicking: Page 2 API reachable');
    magic.jar = jar;
  });

  await test(5, 'Already-used or manually-expired token → expired screen, status unchanged', async (d) => {
    const again = await req(new Jar(), magic.link);
    expect(d, loc(again) === '/signin/error?reason=expired&provider=email', `re-using a link → ${loc(again)}`);
    expect(d, (await coachByEmail(magicA)).status === 'active', 'status unchanged (active)');
    const email = `exp.${RUN}.acceptance@example.com`;
    await req(null, '/api/v1/auth/magic-link', json('POST', { name: 'Expired Test', email }));
    const mail = await mailFor(email);
    const c = await coachByEmail(email);
    await q("UPDATE magic_link_tokens SET expires_at = now() - interval '1 hour' WHERE coach_id = $1", [c.coach_id]);
    const click = await req(new Jar(), mail.link);
    expect(d, loc(click) === '/signin/error?reason=expired&provider=email', `manually expired link → ${loc(click)}`);
    expect(d, (await coachByEmail(email)).status === 'pending', 'status unchanged (pending)');
  }, 'run ./scripts/expire-magic-link.sh <email> and click the Mailpit link.');

  await test(6, 'Second sign-up with an email under a different provider → conflict, no duplicate', async (d) => {
    const res = await req(null, '/api/v1/auth/magic-link', json('POST', { name: 'Jordan Again', email: GOOGLE_EMAIL }));
    const body = await res.json();
    expect(d, res.status === 409 && body.error === 'account_conflict', `magic link for a Google-registered email → ${res.status} ${body.error} (UI shows the conflict screen)`);
    const [n] = await q('SELECT count(*)::int n FROM coaches WHERE lower(coach_email) = $1', [GOOGLE_EMAIL]);
    expect(d, n.n === 1, `still exactly one row for ${GOOGLE_EMAIL}`);
    expect(d, bundle.includes('An account with this email already exists using a password.'), 'wireframe conflict copy is in the UI');
  }, `enter ${GOOGLE_EMAIL} on /join and press "Send me a sign-in link".`);

  await test(7, 'Cancel on the shim login page → user-cancelled screen', async (d) => {
    const r = await socialSignIn('linkedin', 'cancel');
    expect(d, r.pageHtml.includes('>Cancel<'), 'shim login page has a Cancel button');
    expect(d, r.location === '/signin/error?reason=cancelled&provider=linkedin', `→ ${r.location}`);
    expect(d, bundle.includes('No account was created — you can pick up where you left off.'), 'wireframe copy is in the UI');
  }, 'on the shim page press Cancel.');

  await test(8, 'Simulated exchange failure → provider/config error, no raw error text', async (d) => {
    const r = await socialSignIn('google', 'approve', { simulate: true });
    expect(d, r.authorize.searchParams.get('simulate') === 'error', 'shim opened with ?simulate=error');
    expect(d, r.location === '/signin/error?reason=provider&provider=google', `→ ${r.location}`);
    expect(d, !/exception|traceback|simulated|exchange/i.test(r.location), 'no error text in the redirect');
    const bad = await req(null, '/verify?token=not-a-real-token');
    expect(d, loc(bad) === '/signin/error?reason=provider&provider=email', `unrecognised token on /verify → ${loc(bad)}`);
    expect(d, bundle.includes("Something went wrong on our end finishing sign-in — this wasn't anything you did."), 'wireframe copy is in the UI');
  }, 'on the shim page click "Simulate exchange failure", then Continue.');

  await test(9, 'Website → Firecrawl tool_use + llm_use, 150–200 words, done', async (d) => {
    d.push(`website: ${WEBSITE}`);
    await checkRun(d, google.jar, GOOGLE_EMAIL, { mode: 'auto', narrative: 'I help new managers find their footing in their first year of leading a team.', website_url: WEBSITE }, null, true);
  });

  await test(10, 'Resume PDF → story from resume, no tool_use', async (d) => {
    await checkRun(d, linkedin.jar, LINKEDIN_EMAIL, { mode: 'auto', narrative: 'I help mid-career professionals find clarity before burnout catches up with them.', website_url: '' }, RESUME, false);
    const c = await coachByEmail(LINKEDIN_EMAIL);
    expect(d, c.resume_s3_key === `coaches/${c.coach_id}/resume.pdf`, `resume_s3_key = ${c.resume_s3_key}`);
  });

  await test(11, 'Quick questions → story, no tool_use (duplicate generate calls ignored)', async (d) => {
    const c = await coachByEmail(magicA);
    const p2 = await personalize(magic.jar, c.coach_id, {
      mode: 'quick',
      narrative: 'I coach founders who are tired of carrying everything alone.',
      niches: JSON.stringify(['Business', 'Executive & leadership']),
      credentials: JSON.stringify(['ICF']),
      clients_coached: '6–25',
    });
    expect(d, p2.body.generate === true, 'Page 2 saved; generate=true');
    const [a, b] = await Promise.all([generate(magic.jar, c.coach_id), generate(magic.jar, c.coach_id)]);
    const started = [a.body.started, b.body.started].sort().join(',');
    expect(d, started === 'false,true', `two simultaneous generate calls → only one run starts (${started})`);
    const { p, sawProcessing } = await waitForStory(magic.jar, c.coach_id);
    shimmerEvidence.push(sawProcessing);
    const n = words(p.coach_story);
    expect(d, p.bio_status === 'done' && n >= 150 && n <= 200, `done, ${n} words`);
    const row = await coachByEmail(magicA);
    expect(d, JSON.stringify(row.coaching_niche) === '["Executive & leadership","Business"]' && row.credential[0] === 'ICF' && row.clients_coached === '6–25', `saved niche=${row.coaching_niche} credential=${row.credential} clients=${row.clients_coached}`);
    const k = await counts(c.coach_id);
    expect(d, k.llm === 1 && k.tool === 0, `llm_use=${k.llm}, tool_use=${k.tool}`);
  });

  await test(12, 'Skip with every field empty → no generation, not_started, no story', async (d) => {
    const email = `skip.${RUN}.acceptance@example.com`;
    const s = await magicSignUp(email, 'Skip Test');
    const c = await coachByEmail(email);
    const p2 = await personalize(s.jar, c.coach_id, { mode: 'auto', narrative: '', website_url: '' });
    expect(d, p2.status === 200 && p2.body.generate === false, `Skip → generate=${p2.body.generate} (client does not call /story/generate)`);
    await sleep(1500);
    const p = await portfolio(s.jar, c.coach_id);
    const k = await counts(c.coach_id);
    expect(d, p.bio_status === 'not_started' && p.coach_story === null, `bio_status=${p.bio_status}, coach_story=${p.coach_story}`);
    expect(d, k.llm === 0 && k.tool === 0, `llm_use=${k.llm}, tool_use=${k.tool}`);
  });

  await test(13, 'Shimmer while processing, real text once done (polling)', async (d) => {
    expect(d, shimmerEvidence.length === 3 && shimmerEvidence.every(Boolean), `API reported processing during ${shimmerEvidence.filter(Boolean).length}/3 runs, then done`);
    expect(d, bundle.includes('Generating your story from what you shared — this usually takes a few seconds.'), 'shimmer copy present in the UI');
  }, 'submit Page 2 and watch the Portfolio shimmer resolve without refreshing.');

  await test(14, 'Every field: Save persists via PATCH and survives reload', async (d) => {
    const c = await coachByEmail(GOOGLE_EMAIL);
    const values = {
      coach_name: 'Jordan A. Blake',
      headline: 'Leadership coach for first-time managers',
      story_heading: 'How I Help New Managers',
      coach_story: 'Edited story paragraph one.\n\nEdited story paragraph two.',
      linkedin_handle: 'https://www.linkedin.com/in/jordan-blake/',
      coach_email: GOOGLE_EMAIL,
    };
    for (const [field, value] of Object.entries(values)) {
      const res = await req(google.jar, `/api/v1/app/coaches/${c.coach_id}`, json('PATCH', { [field]: value }));
      expect(d, res.status === 200, `PATCH ${field} → ${res.status}`);
      const fresh = await portfolio(google.jar, c.coach_id);
      const want = field === 'linkedin_handle' ? 'linkedin.com/in/jordan-blake' : value;
      expect(d, fresh[field] === want, `reload shows ${field} = ${JSON.stringify(fresh[field]).slice(0, 50)}`);
    }
    const bad = await req(google.jar, `/api/v1/app/coaches/${c.coach_id}`, json('PATCH', { bio_status: 'done' }));
    expect(d, bad.status === 400, `non-editable column rejected (${bad.status})`);
    const other = await coachByEmail(LINKEDIN_EMAIL);
    const forbidden = await req(google.jar, `/api/v1/app/coaches/${other.coach_id}`, json('PATCH', { headline: 'hijack' }));
    expect(d, forbidden.status === 403, `editing another coach is refused (${forbidden.status})`);
  }, 'edit each field, press Cancel — the prior value shows and DevTools > Network has no PATCH.');

  await test(15, 'Photo upload replaces the image in MinIO and updates photo_s3_key', async (d) => {
    const c = await coachByEmail(magicA);
    expect(d, c.photo_s3_key === null, 'email coach starts without a photo');
    const upload = async (file) => {
      const fd = new FormData();
      fd.append('file', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), path.basename(file));
      const res = await req(magic.jar, `/api/v1/app/coaches/${c.coach_id}/photo`, { method: 'POST', body: fd });
      const { photo_s3_key: key } = await res.json();
      const p = await (await req(magic.jar, `/api/v1/app/coaches/${c.coach_id}`, json('PATCH', { photo_s3_key: key }))).json();
      return { key, bytes: Buffer.from(await (await fetch(p.photo_presigned_url)).arrayBuffer()) };
    };
    const fixtures = path.join(__dirname, 'fixtures');
    const first = await upload(path.join(fixtures, 'photo-a.jpg'));
    expect(d, first.key === `coaches/${c.coach_id}/photo.jpg`, `uploaded to ${first.key}`);
    expect(d, (await coachByEmail(magicA)).photo_s3_key === first.key, 'photo_s3_key updated via PATCH');
    const second = await upload(path.join(fixtures, 'photo-b.jpg'));
    expect(d, second.key === first.key && !second.bytes.equals(first.bytes) && second.bytes.length > 1000, 'second upload overwrote the same key with a different image');
    const foreignKey = `coaches/${(await coachByEmail(GOOGLE_EMAIL)).coach_id}/photo.jpg`;
    const foreign = await req(magic.jar, `/api/v1/app/coaches/${c.coach_id}`, json('PATCH', { photo_s3_key: foreignKey }));
    expect(d, foreign.status === 400, `pointing photo_s3_key at another coach's file is refused (${foreign.status})`);
  }, 'on the Portfolio click the pencil on the photo (or "Add photo") and pick an image.');

  await test(16, 'Package buttons are inert', async (d) => {
    expect(d, !/\/api\/[^"']*package/i.test(bundle), 'no package API referenced in the UI');
    expect(d, (await req(google.jar, '/api/v1/app/packages')).status === 404, 'no package endpoint exists');
  }, 'click all 4 "Add package" buttons — nothing happens and the Console stays clean.');

  await test(17, 'Presigned photo URL resolves to the uploaded image', async (d) => {
    const c = await coachByEmail(LINKEDIN_EMAIL);
    const p1 = await portfolio(linkedin.jar, c.coach_id);
    await sleep(1100);
    const p2 = await portfolio(linkedin.jar, c.coach_id);
    expect(d, /X-Amz-Signature=/.test(p1.photo_presigned_url || ''), 'photo_presigned_url is a presigned MinIO URL');
    expect(d, p1.photo_presigned_url !== p2.photo_presigned_url, 'a new URL is minted on each call');
    const bytes = Buffer.from(await (await fetch(p1.photo_presigned_url)).arrayBuffer());
    const original = Buffer.from(await (await fetch(`${APP}/auth-shim/photos/priya.jpg`)).arrayBuffer());
    expect(d, bytes.equals(original), `URL returns the exact ${bytes.length} bytes of the claim photo`);
    expect(d, !/^https?:/.test(c.photo_s3_key), 'database stores only the object key');
  }, 'copy photo_presigned_url from DevTools > Network and open it in a new tab.');

  await test('T', 'Tenancy: /join?org=<code> → IN + org_id; orgs/{org_id}/… keys', async (d) => {
    const email = `org.${RUN}.acceptance@example.com`;
    const s = await magicSignUp(email, 'Institute Coach', 'acme');
    const c = await coachByEmail(email);
    expect(d, s.location === '/personalize' && c.coach_type === 'IN' && c.org_id === '11111111-1111-4111-8111-111111111111', `coach_type=${c.coach_type}, org_id=${c.org_id}`);
    const p2 = await personalize(s.jar, c.coach_id, { mode: 'auto', narrative: '' }, RESUME);
    const row = await coachByEmail(email);
    expect(d, p2.status === 200 && row.resume_s3_key === `orgs/${c.org_id}/coaches/${c.coach_id}/resume.pdf`, `resume_s3_key = ${row.resume_s3_key}`);
    const bad = await req(null, '/api/v1/auth/magic-link', json('POST', { name: 'X', email: `bad.${RUN}.acceptance@example.com`, org: 'nope' }));
    expect(d, bad.status === 400, `unknown org code rejected (${bad.status})`);
    const solo = await coachByEmail(magicA);
    expect(d, solo.coach_type === 'SO' && solo.org_id === null, '/join without org → SO, org_id null');
  });

  console.log('\n======================= SUMMARY =======================');
  const names = {
    1: 'Google', 2: 'LinkedIn', 3: 'Email submit', 4: 'Magic link', 5: 'Used/expired link', 6: 'Account conflict',
    7: 'User cancelled', 8: 'Exchange failure', 9: 'Website story', 10: 'Resume story', 11: 'Quick questions',
    12: 'Empty skip', 13: 'Shimmer', 14: 'Edit fields', 15: 'Photo upload', 16: 'Package buttons', 17: 'Photo URL', T: 'Tenancy',
  };
  for (const r of results) console.log(`${`${r.n}. ${names[r.n]} `.padEnd(24, '.')} ${r.pass ? 'PASS' : 'FAIL'}${r.manual ? '  (+ browser check)' : ''}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} automated checks passed.`);
  await db.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});

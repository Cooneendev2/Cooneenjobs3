/* Tests for worker.js (the Cloudflare Workers entry point) with the network and the static-asset store faked:
     node --no-warnings tests/worker.mjs
   The vacancy below is an obvious test record, not real data. */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TALOS_URL = 'https://api-careers-sites.talos360.com/api/careerssite/vacancies/search';
const DESCRIPTION = '<p>This is the opening paragraph of the test vacancy. It explains the role in plain words.</p>' +
  '<p><strong>Responsibilities</strong></p><ul><li>Do the first test thing</li><li>Do the second test thing</li></ul>';
const record = (over) => Object.assign({
  jobPostId: '1', jobReference: 'TEST0001', jobTitle: 'Test vacancy',
  jobDescription: DESCRIPTION, employmentType: 'Permanent', employment: 'Full-time',
  applyUrlRoute: '/Apply/TEST?i=x', remoteWork: false,
  metadata: [{ name: 'Location', value: 'Test town' }, { name: 'Skill or Department', value: 'Testing' }],
  dateCreated: '2026-09-30T10:00:00.000+00:00', expiryDate: '2099-01-01T22:59:59+00:00'
}, over);
let FIXTURE = JSON.stringify({ careersSiteVacancies: [record()] });

// worker.js and the handler are copied to a temporary folder for every test, so each test starts with an empty
// in-memory cache (the handler keeps one for the life of the server).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmpDirs = [];
async function load() {
  const dir = mkdtempSync(join(tmpdir(), 'cooneen-worker-'));
  tmpDirs.push(dir);
  mkdirSync(join(dir, 'functions', 'api'), { recursive: true });
  copyFileSync(join(ROOT, 'worker.js'), join(dir, 'worker.js'));
  copyFileSync(join(ROOT, 'functions', 'api', 'jobs.js'), join(dir, 'functions', 'api', 'jobs.js'));
  return import(pathToFileURL(join(dir, 'worker.js')).href);
}
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); });
const mkEnv = () => {
  const seen = [];
  return {
    seen,
    ASSETS: { async fetch(req) { seen.push(new URL(req.url).pathname); return new Response('<!doctype html>ASSET', { status: 200, headers: { 'content-type': 'text/html' } }); } }
  };
};
const mkCtx = () => ({ waitUntil() {} });
function installFetch(records) {
  const calls = [];
  FIXTURE = JSON.stringify({ careersSiteVacancies: records || [record()] });
  globalThis.fetch = async (u) => { calls.push(String(u)); return new Response(FIXTURE, { status: 200, headers: { 'content-type': 'application/json' } }); };
  return calls;
}
function installCache() {
  const store = new Map(); let puts = 0, matches = 0;
  globalThis.caches = { default: {
    async match(r) { matches++; const x = store.get(r.url); return x && x.clone(); },
    async put(r, x) { puts++; store.set(r.url, x.clone()); }
  } };
  return { get puts() { return puts; }, get matches() { return matches; } };
}

test('/api/jobs goes to the handler; everything else goes to the static files', async () => {
  const calls = installFetch(); installCache();
  const w = (await load()).default; const env = mkEnv(); const ctx = mkCtx();
  let r = await w.fetch(new Request('https://x.example/api/jobs'), env, ctx);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.jobs.length, 1);
  assert.equal(b.jobs[0].title, 'Test vacancy');
  assert.equal(b.jobs[0].url, 'https://cooneensgroup1.talosats-careers.com/job/1');   // the full vacancy page, not the apply form
  assert.equal(b.jobs[0].overview, 'This is the opening paragraph of the test vacancy. It explains the role in plain words.');
  assert.deepEqual(env.seen, []);
  r = await w.fetch(new Request('https://x.example/?mode=kiosk'), env, ctx);
  assert.equal(await r.text(), '<!doctype html>ASSET');
  r = await w.fetch(new Request('https://x.example/admin'), env, ctx);
  assert.deepEqual(env.seen, ['/', '/admin']);
  assert.deepEqual(calls, [TALOS_URL]);
});

test('only the exact path /api/jobs is handled (no open-proxy paths); other methods are refused', async () => {
  installFetch(); installCache();
  const w = (await load()).default; const env = mkEnv(); const ctx = mkCtx();
  await w.fetch(new Request('https://x.example/api/jobs/extra'), env, ctx);
  await w.fetch(new Request('https://x.example/api/jobs.json'), env, ctx);
  assert.deepEqual(env.seen, ['/api/jobs/extra', '/api/jobs.json']);
  let r = await w.fetch(new Request('https://x.example/api/jobs', { method: 'POST', body: '{}' }), env, ctx);
  assert.equal(r.status, 405);
  r = await w.fetch(new Request('https://x.example/api/jobs', { method: 'HEAD' }), env, ctx);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '');
});

test('on *.workers.dev: no Cache API, memory cache still prevents repeat Talos calls, diagnostics say why', async () => {
  const calls = installFetch(); const cache = installCache();
  const w = (await load()).default; const env = mkEnv(); const ctx = mkCtx();
  let r = await w.fetch(new Request('https://cooneenjobs.example.workers.dev/api/jobs?diag=1'), env, ctx);
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.diagnostics.cache.edgeCacheAvailable, false);
  assert.match(b.diagnostics.cache.edgeCacheNote, /workers\.dev/);
  assert.equal(cache.puts, 0); assert.equal(cache.matches, 0);
  for (let i = 0; i < 10; i++) {
    r = await w.fetch(new Request('https://cooneenjobs.example.workers.dev/api/jobs'), env, ctx);
    assert.equal(r.headers.get('x-jobs-cache'), 'HIT');
  }
  assert.equal(calls.length, 1);
});

test('on a custom domain the Cache API is used', async () => {
  installFetch(); const cache = installCache();
  const w = (await load()).default; const env = mkEnv(); const ctx = mkCtx();
  const r = await w.fetch(new Request('https://jobs.example.com/api/jobs?diag=1'), env, ctx);
  const b = await r.json();
  assert.equal(b.diagnostics.cache.edgeCacheAvailable, true);
  assert.equal(b.diagnostics.cache.edgeCacheNote, null);
  assert.equal(cache.puts, 1);
});

// ---- the role overview (the opening of the full description) and the vacancy link ----
async function jobsFor(records) {
  installFetch(records); installCache();
  const w = (await load()).default;
  const r = await w.fetch(new Request('https://x.example/api/jobs'), mkEnv(), mkCtx());
  return (await r.json()).jobs;
}

test('overview: stops before the first section heading, list or table', async () => {
  const jobs = await jobsFor([
    record({ jobPostId: '10', jobDescription: '<p>First paragraph of the overview, long enough to count as prose.</p><p>Second paragraph, also prose, still part of the overview.</p><h3>Requirements</h3><p>Must not appear in the overview.</p>' }),
    record({ jobPostId: '11', jobReference: 'T11', jobDescription: '<p>Intro text that is long enough to be a real paragraph.</p><table><tr><td>Salary</td></tr></table><p>After the table.</p>' })
  ]);
  const byId = (id) => jobs.find((j) => j.id === id);
  assert.equal(byId('10').overview, 'First paragraph of the overview, long enough to count as prose.\n\nSecond paragraph, also prose, still part of the overview.');
  assert.equal(byId('11').overview, 'Intro text that is long enough to be a real paragraph.');
});

test('overview: a leading "About the role" label is skipped; a description that opens with a list gives no overview', async () => {
  const jobs = await jobsFor([
    record({ jobPostId: '20', jobDescription: '<p><strong>About the role</strong></p><p>The overview text comes after the label and is long enough.</p><p><strong>Key duties</strong></p><p>Not included.</p>' }),
    record({ jobPostId: '21', jobReference: 'T21', jobDescription: '<ul><li>Straight into a list</li></ul><p>Later paragraph that is long enough to be prose.</p>' }),
    record({ jobPostId: '22', jobReference: 'T22', jobDescription: '' })
  ]);
  const byId = (id) => jobs.find((j) => j.id === id);
  assert.equal(byId('20').overview, 'The overview text comes after the label and is long enough.');
  assert.equal(byId('21').overview, '');
  assert.equal(byId('22').overview, '');
});

test('overview: no more than 900 characters, ending on a whole sentence', async () => {
  const sentence = 'This sentence describes one part of the role in some detail. ';
  const jobs = await jobsFor([record({ jobPostId: '30', jobDescription: '<p>' + sentence.repeat(30) + '</p>' })]);
  const o = jobs[0].overview;
  assert.ok(o.length <= 900, 'length ' + o.length);
  assert.ok(o.length > 500);
  assert.match(o, /role in some detail\.$/);
});

test('overview: markup and scripts never reach the output', async () => {
  const jobs = await jobsFor([record({ jobPostId: '40', jobDescription: '<p>Plain <b>bold</b> &amp; <a href="javascript:alert(1)">link</a> text in a long enough opening paragraph.</p><script>alert(1)</script>' })]);
  assert.equal(jobs[0].overview, 'Plain bold & link text in a long enough opening paragraph.');
});

test('links: only the vacancy page on the careers host, built from a safe id', async () => {
  const jobs = await jobsFor([
    record({ jobPostId: '942545', jobReference: 'A' }),
    record({ jobPostId: '../../evil', jobReference: 'B' }),
    record({ jobPostId: 'ab?x=1', jobReference: 'C' })
  ]);
  const byRef = (ref) => jobs.find((j) => j.reference === ref);
  assert.equal(byRef('A').url, 'https://cooneensgroup1.talosats-careers.com/job/942545');
  for (const ref of ['B', 'C']) {
    const u = byRef(ref) && byRef(ref).url;
    assert.ok(!u || u === '', 'unsafe id produced a link: ' + u);
  }
});

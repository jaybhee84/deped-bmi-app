import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHandler } from '../supabase/functions/school-data/handler.mjs';
import { createHandler as createSyncHandler } from '../supabase/functions/sync-bmi-school-data/sync.mjs';
import { countPortalEnrolments } from '../src/utils/enrolmentTotals.js';

const division = 'https://xinkzertckylyiglqikh.supabase.co';
const school = 'https://joilvslvsioayrjshuxg.supabase.co';
const env = new Map([
  ['IECES_EXCLUSIVE_DATA', 'true'],
  ['SUPABASE_URL', division], ['SUPABASE_ANON_KEY', 'public'],
  ['SCHOOL_SUPABASE_URL', school], ['SCHOOL_SUPABASE_SERVICE_ROLE_KEY', 'private'],
]);

test('information enrolment excludes other schools, other years, and unassigned records', () => {
  const rows = [
    { schoolId: '126001', schoolYear: '2026-2027' },
    { school_id: '126001', school_year: '2026–2027' },
    { schoolId: '126002', schoolYear: '2026-2027' },
    { schoolId: '126001', schoolYear: '2025-2026' },
    { schoolId: '126001' },
  ];
  assert.equal(countPortalEnrolments(rows, '2026-2027', '126001'), 2);
  assert.equal(countPortalEnrolments(rows, '2026-2027', '126002'), 1);
});

test('exclusive mode stops the old reconciliation job before it can copy any data', async () => {
  const values = new Map([['IECES_EXCLUSIVE_DATA', 'true'], ['MIRROR_WEBHOOK_SECRET', 'secret']]);
  const handler = createSyncHandler(values, () => { throw new Error('Must not contact either database'); });
  const response = await handler(new Request(`${division}/functions/v1/sync-bmi-school-data`, {
    method: 'POST', headers: { 'x-mirror-secret': 'secret' }, body: JSON.stringify({ dry_run: false }),
  }));
  assert.equal(response.status, 410);
});
function setup(profile, respond = () => Response.json([])) {
  const calls = [];
  const handler = createHandler(env, async (input, init) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user' });
    if (url.pathname === '/rest/v1/bmi_profiles') return Response.json([profile]);
    calls.push({ url, ...init });
    return respond(url, init);
  });
  const request = async (overrides = {}) => {
    const response = await handler(new Request(`${division}/functions/v1/school-data`, {
      method: 'POST', headers: { Authorization: 'Bearer session' },
      body: JSON.stringify({ table: 'students', method: 'GET', query: '?select=id,school_id', headers: {}, ...overrides }),
    }));
    return { status: response.status, result: await response.json() };
  };
  return { request, calls };
}

test('service-role requests cannot embed other tables through school metadata', async () => {
  const { request, calls } = setup({ role: 'school', school_id: '126001' });
  const result = await request({ table: 'schools', query: '?school_id=eq.126001&select=*,bmi_profiles(*)' });
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});

test('IECES reads only the school project, with a server-enforced school filter', async () => {
  const { request, calls } = setup({ role: 'school', school_id: '126001' });
  assert.equal((await request()).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, school);
  assert.ok(calls[0].url.searchParams.getAll('school_id').includes('eq.126001'));
  assert.equal(calls[0].headers.apikey, 'private');
});

test('other schools never access the IECES project or receive its service key', async () => {
  const { request, calls } = setup({ role: 'school', school_id: '126002' });
  await request();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, division);
  assert.equal(calls[0].headers.Authorization, 'Bearer session');
  assert.equal(calls[0].headers.apikey, 'public');
});

test('a school cannot send another school records or change record ownership', async () => {
  const { request, calls } = setup({ role: 'school', school_id: '126001' });
  assert.equal((await request({ method: 'POST', body: JSON.stringify({ id: 'a', school_id: '126002' }) })).status, 403);
  assert.equal((await request({ method: 'PATCH', body: JSON.stringify({ school_id: '126001' }) })).status, 400);
  assert.equal(calls.length, 0);
});

test('portal-only fields cannot be read, filtered, or written using the school service key', async () => {
  const { request, calls } = setup({ role: 'school', school_id: '126001' });
  assert.equal((await request({ query: '?select=father_name' })).status, 400);
  assert.equal((await request({ query: '?select=id&father_name=eq.Secret' })).status, 400);
  assert.equal((await request({ method: 'PATCH', body: JSON.stringify({ father_name: 'Secret' }) })).status, 400);
  assert.equal(calls.length, 0);
});

test('IECES upsert rejects a primary key owned by another school', async () => {
  const { request, calls } = setup({ role: 'school', school_id: '126001' }, () => Response.json([{ school_id: '126002' }]));
  const response = await request({ method: 'POST', body: JSON.stringify({ id: 'collision', school_id: '126001', name: 'Learner' }) });
  assert.equal(response.status, 409);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, undefined);
});

test('division writes split mixed-school batches by destination', async () => {
  const { request, calls } = setup({ role: 'division' }, () => new Response(null, { status: 204 }));
  const rows = [{ school_id: '126001', name: 'IECES' }, { school_id: '126002', name: 'Other' }];
  assert.equal((await request({ method: 'POST', body: JSON.stringify(rows) })).result.status, 204);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    const [row] = JSON.parse(call.body);
    assert.equal(row.school_id === '126001', call.url.origin === school);
  }
});

test('division reads combine both projects before sorting and paginating', async () => {
  const { request } = setup({ role: 'division' }, url => Response.json(
    url.origin === school ? [{ id: 'i', name: 'A' }] : [{ id: 'd', name: 'Z' }],
    { headers: { 'content-range': '0-0/1' } },
  ));
  const { result } = await request({ query: '?select=id&order=name.asc&offset=1&limit=1' });
  assert.deepEqual(JSON.parse(result.body), [{ id: 'd' }]);
  assert.equal(result.headers['content-range'], '1-1/2');
});

test('school outage returns the failure without falling back to stale main data', async () => {
  const { request, calls } = setup({ role: 'school', school_id: '126001' }, () => Response.json({ message: 'Unavailable' }, { status: 503 }));
  assert.equal((await request()).result.status, 503);
  assert.equal(calls.length, 1);
});

test('specific school metadata uses its project, while the shared directory uses division', async () => {
  const { request, calls } = setup({ role: 'school', school_id: '126001' });
  await request({ table: 'schools', query: '?school_id=eq.126001&select=*' });
  await request({ table: 'schools', query: '?select=*' });
  assert.deepEqual(calls.map(call => call.url.origin), [school, division]);
  assert.equal(calls[1].url.searchParams.has('school_id'), false);
});

test('browser transport keeps auth direct and preserves routed PostgREST responses', async () => {
  const source = readFileSync(new URL('../src/utils/schoolDataFetch.js', import.meta.url), 'utf8')
    .replace("import.meta.env?.VITE_IECES_EXCLUSIVE_DATA !== 'true'", 'false');
  const { schoolDataFetch } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({ status: 200, headers: { 'content-range': '0-0/1' }, body: '[{"id":"i"}]' });
  };
  try {
    const response = await schoolDataFetch(`${division}/rest/v1/students?select=id`, { headers: { Authorization: 'Bearer session', apikey: 'public' } });
    assert.deepEqual(await response.json(), [{ id: 'i' }]);
    assert.equal(response.headers.get('content-range'), '0-0/1');
    assert.equal(calls[0].url, `${division}/functions/v1/school-data`);
    await schoolDataFetch(`${division}/auth/v1/user`);
    assert.equal(calls[1].url, `${division}/auth/v1/user`);
  } finally { globalThis.fetch = original; }
});

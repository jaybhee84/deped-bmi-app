import test from 'node:test';
import assert from 'node:assert/strict';
import { BMI_FIELDS, createHandler, project, reconcile, validLrn } from './sync.mjs';

const learner = overrides => project({
  lrn: '123456789012', registry_no: '2026-ieces-G1-0001', name: 'TEST LEARNER',
  birthdate: '2019-01-01', age: 7, sex: 'M', section: 'Grade 1',
  school_name: 'Test School', school_year: '2026–2027', dewormed: 'Y',
  parent_consent: 'Y', member_4ps: 'N', previous_sbfp_beneficiary: 'N',
  records: [{ weight: 20, height: 110 }], photo_url: null, ...overrides,
});
const baseline = data => ({ division_data: data, school_data: data });

test('only BMI-used fields are projected', () => {
  const result = project({ ...learner(), father_name: 'PRIVATE', form_137_records: {}, adviser_id: 'other-project' });
  assert.deepEqual(Object.keys(result), BMI_FIELDS);
  assert.equal('father_name' in result, false);
  assert.equal('adviser_id' in result, false);
});
test('validLrn accepts 12 or 13 digits and rejects anything else', () => {
  assert.equal(validLrn('123456789012'), '123456789012');
  assert.equal(validLrn('1234567890123'), '1234567890123');
  assert.equal(validLrn('12345678901234'), null);
  assert.equal(validLrn('12345678901'), null);
  assert.equal(validLrn('—'), null);
  assert.equal(validLrn(null), null);
});
test('a portal LRN fills every kind of BMI placeholder without sending unrelated data', () => {
  for (const lrn of [null, '', '—', '   ']) {
    const plan = reconcile(learner({ lrn }), learner(), null);
    assert.deepEqual(plan.toDivision, { lrn: '123456789012' });
    assert.deepEqual(plan.toSchool, {});
  }
});
test('independent portal and BMI edits merge in opposite directions', () => {
  const original = learner();
  const records = [{ weight: 22, height: 115 }];
  const plan = reconcile(learner({ records }), learner({ birthdate: '2019-02-01' }), baseline(original));
  assert.deepEqual(plan.toDivision, { birthdate: '2019-02-01' });
  assert.deepEqual(plan.toSchool, { records });
  assert.deepEqual(plan.conflicts, []);
});
test('existing differences and simultaneous edits are not silently overwritten', () => {
  const a = learner({ name: 'DIVISION EDIT' }), b = learner({ name: 'PORTAL EDIT' });
  for (const state of [null, baseline(learner())]) {
    const plan = reconcile(a, b, state);
    assert.deepEqual(plan.conflicts, ['name']);
    assert.deepEqual(plan.toDivision, {});
    assert.deepEqual(plan.toSchool, {});
  }
  // A later deliberate edit can resolve an existing disagreement.
  assert.deepEqual(reconcile(a, learner({ name: 'CORRECTED' }), { division_data: a, school_data: b }).toDivision,
    { name: 'CORRECTED' });
});
test('a valid LRN cannot be cleared by a stale blank in either project', () => {
  const original = learner();
  assert.deepEqual(reconcile(learner({ lrn: '' }), original, baseline(original)).toDivision, { lrn: original.lrn });
  assert.deepEqual(reconcile(original, learner({ lrn: '' }), baseline(original)).toSchool, { lrn: original.lrn });
});
test('unchanged nested JSON does not create repeated writes', () => {
  const a = learner({ records: [{ weight: 20, height: 110 }] });
  const b = learner({ records: [{ height: 110, weight: 20 }] });
  assert.deepEqual(reconcile(a, b, baseline(a)), { toDivision: {}, toSchool: {}, conflicts: [] });
});

function harness({ dry = false, rejectUpdate = false, busy = false, cursor = null, schoolChanged = false } = {}) {
  let division = { id: 'test-id', school_id: '126001', updated_at: '2026-09-01T00:00:00Z', ...learner({ lrn: null }) };
  const school = { ...division, ...learner(), father_name: 'NEVER SYNC' };
  if (schoolChanged) school.updated_at = '2026-09-08T00:01:00Z';
  const calls = [], saved = [];
  const environment = {
    MIRROR_WEBHOOK_SECRET: 'test-only-secret',
    SUPABASE_URL: 'https://xinkzertckylyiglqikh.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-division',
    SCHOOL_SUPABASE_URL: 'https://joilvslvsioayrjshuxg.supabase.co', SCHOOL_SUPABASE_SERVICE_ROLE_KEY: 'test-school',
  };
  const fetcher = async (url, init) => {
    const endpoint = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ endpoint, method: init.method || 'GET', body });
    let result;
    if (endpoint.pathname.endsWith('/acquire_bmi_school_sync')) result = busy ? null : 'test-lease';
    else if (endpoint.pathname.endsWith('/apply_bmi_school_sync')) {
      assert.deepEqual(body.p_patch, { lrn: '123456789012' });
      if (rejectUpdate) result = null;
      else { division = { ...division, ...body.p_patch }; result = division; }
    } else if (endpoint.pathname.endsWith('/checkpoint_bmi_school_sync')) { saved.push(...body.p_rows); result = null; }
    else if (endpoint.pathname.endsWith('/finish_bmi_school_sync')) result = null;
    else if (endpoint.pathname.endsWith('/bmi_school_sync_state')) result = saved;
    else if (endpoint.pathname.endsWith('/bmi_school_sync_control')) result = [{ cursor_at: cursor }];
    else if (endpoint.pathname.endsWith('/students') && !init.method) {
      assert.equal(endpoint.searchParams.get('school_id'), 'eq.126001');
      assert.ok(!endpoint.searchParams.get('select').includes('father_name'));
      const row = endpoint.hostname.startsWith('xink') ? division : school;
      const since = endpoint.searchParams.get('updated_at')?.slice(4);
      result = since && Date.parse(row.updated_at) < Date.parse(since) ? [] : [row];
    } else throw new Error(`Unexpected request ${url}`);
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const handler = createHandler({ get: name => environment[name] }, fetcher);
  const run = (secret = 'test-only-secret') => handler(new Request('https://test.invalid', {
    method: 'POST', headers: { 'x-mirror-secret': secret, 'content-type': 'application/json' },
    body: JSON.stringify({ dry_run: dry }),
  }));
  return { run, calls, saved };
}
test('dry-run compares both databases but does not write or acquire a lease', async () => {
  const h = harness({ dry: true });
  assert.equal((await h.run()).status, 200);
  assert.ok(h.calls.every(call => call.method === 'GET'));
});
test('unauthorized requests never access either database', async () => {
  const h = harness();
  assert.equal((await h.run('incorrect')).status, 401);
  assert.equal(h.calls.length, 0);
});
test('a round trip imports the LRN, saves a checkpoint, and converges without echo writes', async () => {
  const h = harness();
  assert.equal((await (await h.run()).json()).updated_division, 1);
  assert.equal(h.saved[0].division_data.lrn, '123456789012');
  assert.equal('father_name' in h.saved[0].school_data, false);
  assert.equal((await (await h.run()).json()).updated_division, 0);
});
test('a concurrent edit is skipped and not recorded as successfully synced', async () => {
  const h = harness({ rejectUpdate: true });
  assert.equal((await (await h.run()).json()).concurrent_edits, 1);
  assert.equal(h.saved.length, 0);
});
test('an overlapping invocation stops before fetching learner data', async () => {
  const h = harness({ busy: true });
  assert.equal((await h.run()).status, 202);
  assert.equal(h.calls.length, 1);
});
test('an idle incremental run does not download checkpoints or unchanged measurements', async () => {
  const h = harness({ cursor: '2026-09-08T00:00:00Z' });
  const result = await (await h.run()).json();
  assert.equal(result.incremental, true);
  assert.equal(result.matched, 0);
  assert.ok(!h.calls.some(call => call.endpoint.pathname.endsWith('/bmi_school_sync_state')));
});
test('a changed portal learner fetches its unchanged BMI counterpart before merging', async () => {
  const h = harness({ cursor: '2026-09-08T00:00:00Z', schoolChanged: true });
  const result = await (await h.run()).json();
  assert.equal(result.incremental, true);
  assert.equal(result.matched, 1);
  assert.equal(result.updated_division, 1);
  assert.ok(h.calls.some(call => call.endpoint.searchParams.get('id') === 'in.("test-id")'));
});

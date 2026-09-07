export const SCHOOL_ID = '126001';
// This list follows the student mapping in src/utils/syncService.js. Never
// send portal-only columns or cross-project auth/adviser foreign keys.
export const BMI_FIELDS = [
  'lrn', 'registry_no', 'name', 'birthdate', 'age', 'sex', 'section',
  'school_name', 'school_year', 'dewormed', 'parent_consent', 'member_4ps',
  'previous_sbfp_beneficiary', 'records', 'photo_url',
];
const SELECT = ['id', 'school_id', 'updated_at', ...BMI_FIELDS].join(',');

export const project = row => Object.fromEntries(BMI_FIELDS.map(key => [key, row[key] ?? null]));
const stable = value => JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const equal = (a, b) => stable(a) === stable(b);
const missing = value => value == null || value === '' || value === '—' ||
  (Array.isArray(value) && value.length === 0);
// DepEd LRNs are 12 digits; some portal records carry a 13-digit variant.
// Longer values are past both of those and are rejected as malformed.
export const validLrn = value => /^\d{12,13}$/.test(String(value ?? '').trim())
  ? String(value).trim() : null;

export function reconcile(division, school, state) {
  const toDivision = {}, toSchool = {}, conflicts = [];
  for (const key of BMI_FIELDS) {
    const a = division[key], b = school[key];
    if (equal(a, b)) continue;
    let value;
    if (key === 'lrn' && (!validLrn(a) || !validLrn(b))) {
      // A placeholder or stale blank can never erase a real LRN.
      value = validLrn(a) || validLrn(b);
      if (!value) continue;
    } else if (!state) {
      if (missing(a) && !missing(b)) value = b;
      else if (missing(b) && !missing(a)) value = a;
      else { conflicts.push(key); continue; }
    } else {
      const changedA = !equal(a, state.division_data[key]);
      const changedB = !equal(b, state.school_data[key]);
      if (changedA && !changedB) value = a;
      else if (changedB && !changedA) value = b;
      else { conflicts.push(key); continue; }
    }
    if (!equal(a, value)) toDivision[key] = value;
    if (!equal(b, value)) toSchool[key] = value;
  }
  return { toDivision, toSchool, conflicts };
}

export function createHandler(env, fetcher = fetch) {
  const json = (status, body) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  return async request => {
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
    const secret = env.get('MIRROR_WEBHOOK_SECRET');
    if (!secret || request.headers.get('x-mirror-secret') !== secret) return json(401, { error: 'Unauthorized' });
    let options;
    try { options = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
    if (!options || typeof options !== 'object' || Array.isArray(options)) return json(400, { error: 'Expected a JSON object' });
    const dryRun = options.dry_run !== false;
    const divisionUrl = env.get('SUPABASE_URL')?.replace(/\/$/, '');
    const divisionKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
    const schoolUrl = env.get('SCHOOL_SUPABASE_URL')?.replace(/\/$/, '');
    const schoolKey = env.get('SCHOOL_SUPABASE_SERVICE_ROLE_KEY');
    if (!divisionUrl || !divisionKey || !schoolUrl || !schoolKey) return json(500, { error: 'Both database connections must be configured' });
    if (new URL(divisionUrl).hostname !== 'xinkzertckylyiglqikh.supabase.co' ||
        new URL(schoolUrl).hostname !== 'joilvslvsioayrjshuxg.supabase.co') {
      return json(500, { error: 'Unexpected project configuration' });
    }
    async function api(base, key, path, init = {}) {
      const response = await fetcher(`${base}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: key,
          ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
          'content-type': 'application/json', ...init.headers,
        },
        signal: AbortSignal.timeout(20000),
      });
      // Error bodies may contain private learner data; don't log them.
      if (!response.ok) throw new Error(`Database request failed (${response.status})`);
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    }
    const rpc = (name, body) => api(divisionUrl, divisionKey, `rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
    async function allRows(base, key, path) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await api(base, key, `${path}&limit=1000&offset=${offset}`);
        if (!Array.isArray(page)) throw new Error('Expected database rows');
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    }
    let lease = null;
    try {
      if (!dryRun) {
        lease = await rpc('acquire_bmi_school_sync', {});
        if (!lease) return json(202, { skipped: 'already_running' });
      }
      const control = await api(divisionUrl, divisionKey, 'bmi_school_sync_control?select=cursor_at');
      const cursor = control?.[0]?.cursor_at;
      const incremental = !dryRun && options.full !== true && !!cursor;
      // Both projects stamp updated_at in database triggers. Fetch only changed
      // learners after bootstrap so a five-minute job doesn't repeatedly copy
      // thousands of unchanged measurements over the network.
      const since = incremental ? `&updated_at=gte.${encodeURIComponent(new Date(Date.parse(cursor) - 10000).toISOString())}` : '';
      let [divisionRows, schoolRows] = await Promise.all([
        allRows(divisionUrl, divisionKey, `students?school_id=eq.${SCHOOL_ID}&select=${SELECT}&order=id.asc${since}`),
        allRows(schoolUrl, schoolKey, `students?school_id=eq.${SCHOOL_ID}&select=${SELECT}&order=id.asc${since}`),
      ]);
      let states;
      if (incremental) {
        const ids = [...new Set([...divisionRows, ...schoolRows].map(row => String(row.id)))];
        divisionRows = []; schoolRows = []; states = [];
        for (let start = 0; start < ids.length; start += 100) {
          const quoted = ids.slice(start, start + 100).map(id => `"${id.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`);
          const filter = encodeURIComponent(`in.(${quoted.join(',')})`);
          const [divisionBatch, schoolBatch, stateBatch] = await Promise.all([
            allRows(divisionUrl, divisionKey, `students?school_id=eq.${SCHOOL_ID}&id=${filter}&select=${SELECT}&order=id.asc`),
            allRows(schoolUrl, schoolKey, `students?school_id=eq.${SCHOOL_ID}&id=${filter}&select=${SELECT}&order=id.asc`),
            allRows(divisionUrl, divisionKey, `bmi_school_sync_state?student_id=${filter}&select=student_id,division_data,school_data&order=student_id.asc`),
          ]);
          divisionRows.push(...divisionBatch); schoolRows.push(...schoolBatch); states.push(...stateBatch);
        }
      } else {
        states = await allRows(divisionUrl, divisionKey, 'bmi_school_sync_state?select=student_id,division_data,school_data&order=student_id.asc');
      }
      const schoolMap = new Map(schoolRows.map(row => [String(row.id), row]));
      const previous = new Map(states.map(row => [String(row.student_id), row]));
      const summary = {
        dry_run: dryRun, incremental, division_students: divisionRows.length, school_students: schoolRows.length,
        matched: 0, missing_in_school: 0, missing_in_division: 0, pending_to_division: {}, pending_to_school: {},
        conflicts: {}, updated_division: 0, updated_school: 0, created_division: 0, created_school: 0,
        concurrent_edits: 0, deferred: 0,
      };
      const divisionIds = new Set(divisionRows.map(row => String(row.id)));
      summary.missing_in_division = schoolRows.filter(row => !divisionIds.has(String(row.id))).length;
      const work = [], checkpoints = [];
      for (const division of divisionRows) {
        const school = schoolMap.get(String(division.id));
        if (!school) {
          summary.missing_in_school++;
          // A previous checkpoint means a row was deleted. Don't resurrect it.
          if (!previous.has(String(division.id))) {
            if (work.length < 100) work.push({ division, school: null });
            else summary.deferred++;
          }
          continue;
        }
        summary.matched++;
        const state = previous.get(String(division.id));
        const plan = reconcile(project(division), project(school), state);
        for (const key of Object.keys(plan.toDivision)) summary.pending_to_division[key] = (summary.pending_to_division[key] || 0) + 1;
        for (const key of Object.keys(plan.toSchool)) summary.pending_to_school[key] = (summary.pending_to_school[key] || 0) + 1;
        for (const key of plan.conflicts) summary.conflicts[key] = (summary.conflicts[key] || 0) + 1;
        if (Object.keys(plan.toDivision).length || Object.keys(plan.toSchool).length) {
          if (work.length < 100) work.push({ division, school, ...plan });
          else summary.deferred++;
        } else if (!state || !equal(state.division_data, project(division)) || !equal(state.school_data, project(school))) {
          checkpoints.push({ student_id: String(division.id), division_data: project(division), school_data: project(school) });
        }
      }
      for (const school of schoolRows) {
        if (!divisionIds.has(String(school.id)) && !previous.has(String(school.id))) {
          if (work.length < 100) work.push({ division: null, school });
          else summary.deferred++;
        }
      }
      if (dryRun) return json(200, summary);
      let next = 0;
      const workers = Array.from({ length: 5 }, async () => {
        while (next < work.length) {
          const { division, school, toDivision, toSchool } = work[next++];
          if (!division || !school) {
            const source = division || school;
            const student = { id: String(source.id), school_id: SCHOOL_ID, ...project(source) };
            let created;
            if (!division) {
              created = await rpc('create_bmi_school_sync', { p_student: student, p_lease: lease });
              if (created) summary.created_division++;
            } else {
              const rows = await api(schoolUrl, schoolKey, `students?on_conflict=id&select=${SELECT}`, {
                method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
                body: JSON.stringify(student),
              });
              created = rows?.[0];
              if (created) summary.created_school++;
            }
            if (!created) { summary.concurrent_edits++; continue; }
            checkpoints.push({ student_id: student.id,
              division_data: project(division || created), school_data: project(school || created) });
            continue;
          }
          let newDivision = division, newSchool = school;
          if (Object.keys(toDivision).length) {
            newDivision = await rpc('apply_bmi_school_sync', {
              p_student_id: String(division.id), p_expected: project(division), p_patch: toDivision, p_lease: lease,
            });
            if (!newDivision) { summary.concurrent_edits++; continue; }
            summary.updated_division++;
          }
          if (Object.keys(toSchool).length) {
            // Portal timestamps are compared atomically to avoid racing its edits.
            const query = new URLSearchParams({
              id: `eq.${school.id}`, school_id: `eq.${SCHOOL_ID}`,
              updated_at: school.updated_at == null ? 'is.null' : `eq.${school.updated_at}`, select: SELECT,
            });
            const changed = await api(schoolUrl, schoolKey, `students?${query}`, {
              method: 'PATCH', headers: { prefer: 'return=representation' },
              body: JSON.stringify({ ...toSchool, updated_at: new Date().toISOString() }),
            });
            if (changed?.length !== 1) { summary.concurrent_edits++; continue; }
            newSchool = changed[0];
            summary.updated_school++;
          }
          checkpoints.push({ student_id: String(division.id), division_data: project(newDivision), school_data: project(newSchool) });
        }
      });
      const results = await Promise.allSettled(workers);
      for (let start = 0; start < checkpoints.length; start += 200) {
        await rpc('checkpoint_bmi_school_sync', { p_rows: checkpoints.slice(start, start + 200), p_lease: lease });
      }
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      await rpc('finish_bmi_school_sync', { p_lease: lease, p_summary: summary });
      lease = null;
      return json(200, summary);
    } catch (error) {
      console.error('BMI school sync failed:', error.message);
      return json(502, { error: 'Sync failed; the next scheduled run will retry' });
    } finally {
      if (lease) {
        try { await rpc('finish_bmi_school_sync', { p_lease: lease, p_summary: { error: 'sync_failed' } }); }
        catch { /* Lease expires if the database is unavailable. */ }
      }
    }
  };
}

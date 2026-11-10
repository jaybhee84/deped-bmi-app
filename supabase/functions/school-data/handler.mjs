import { BMI_FIELDS } from '../sync-bmi-school-data/sync.mjs';

const SCHOOL = '126001';
const DIVISION_URL = 'https://xinkzertckylyiglqikh.supabase.co';
const SCHOOL_URL = 'https://joilvslvsioayrjshuxg.supabase.co';
const TABLES = new Set(['students', 'sbfp_enrolment', 'school_info_sbmi', 'schools']);
const STUDENT_FIELDS = new Set(['id', 'school_id', 'updated_at', ...BMI_FIELDS]);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status, body) => Response.json(body, { status, headers: CORS });
const envelope = async response => json(200, {
  status: response.status,
  headers: Object.fromEntries(['content-type', 'content-range'].flatMap(key =>
    response.headers.has(key) ? [[key, response.headers.get(key)]] : [])),
  body: await response.text(),
});

export function createHandler(env, fetcher = fetch) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Sign in required' });
    if (env.get('IECES_EXCLUSIVE_DATA') !== 'true') return json(503, { error: 'Exclusive IECES storage has not been activated' });
    const divisionKey = env.get('SUPABASE_ANON_KEY');
    const schoolKey = env.get('SCHOOL_SUPABASE_SERVICE_ROLE_KEY');
    if (!divisionKey || !schoolKey || env.get('SCHOOL_SUPABASE_URL')?.replace(/\/$/, '') !== SCHOOL_URL ||
        env.get('SUPABASE_URL')?.replace(/\/$/, '') !== DIVISION_URL) {
      return json(503, { error: 'School data routing is not configured' });
    }
    try {
      const authHeaders = { apikey: divisionKey, Authorization: authorization };
      const userResponse = await fetcher(`${DIVISION_URL}/auth/v1/user`, { headers: authHeaders });
      if (!userResponse.ok) return json(401, { error: 'Invalid session' });
      const user = await userResponse.json();
      const profileResponse = await fetcher(`${DIVISION_URL}/rest/v1/bmi_profiles?id=eq.${encodeURIComponent(user.id)}&select=school_id,role`, { headers: authHeaders });
      if (!profileResponse.ok) return json(403, { error: 'Profile unavailable' });
      const [profile] = await profileResponse.json();
      if (!profile || !['school', 'division'].includes(profile.role)) return json(403, { error: 'Access denied' });
      const input = await request.json();
      if (!TABLES.has(input.table) || !['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(input.method) ||
          typeof input.query !== 'string' || (input.body != null && typeof input.body !== 'string')) {
        return json(400, { error: 'Invalid data request' });
      }
      const query = new URLSearchParams(input.query);
      const forwarded = new Headers(input.headers);
      // Schema, credentials, and school scope always come from the server.
      const headers = Object.fromEntries(['accept', 'prefer', 'range', 'range-unit'].flatMap(key =>
        forwarded.has(key) ? [[key, forwarded.get(key)]] : []));
      const isManager = profile.role === 'division';
      const schoolUser = !isManager && String(profile.school_id) === SCHOOL;
      const explicitSchool = query.get('school_id');
      let destinations = schoolUser ? ['school'] : isManager ? ['division', 'school'] : ['division'];
      if (explicitSchool?.startsWith('eq.')) {
        destinations = destinations.filter(destination => (explicitSchool === `eq.${SCHOOL}`) === (destination === 'school'));
      }
      const reading = ['GET', 'HEAD'].includes(input.method);
      // The shared onboarding directory remains in division; a specific school's profile follows its data.
      if (input.table === 'schools' && reading && !explicitSchool) destinations = ['division'];
      let payload;
      if (!reading && input.method !== 'DELETE') {
        try { payload = JSON.parse(input.body); } catch { return json(400, { error: 'Invalid row data' }); }
        const rows = Array.isArray(payload) ? payload : [payload];
        if (!rows.length || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) return json(400, { error: 'Invalid rows' });
        if (input.method === 'POST' && rows.some(row => !row.school_id)) return json(400, { error: 'school_id is required' });
        if (rows.some(row => row.school_id != null && !isManager && String(row.school_id) !== String(profile.school_id))) {
          return json(403, { error: 'Cannot write another school' });
        }
        if (input.method === 'PATCH' && rows.some(row => 'school_id' in row)) return json(400, { error: 'Moving records between schools is not supported' });
        if (input.method === 'POST') destinations = destinations.filter(destination =>
          rows.some(row => (String(row.school_id) === SCHOOL) === (destination === 'school')));
        if (destinations.includes('school') && input.table === 'students' && rows.some(row =>
          (input.method !== 'POST' || String(row.school_id) === SCHOOL) && Object.keys(row).some(key => !STUDENT_FIELDS.has(key)))) {
          return json(400, { error: 'Only BMI learner fields may be written' });
        }
      }
      const send = async (destination, params, overrides = {}) => {
        const scoped = new URLSearchParams(params);
        if (!(input.table === 'schools' && reading && !explicitSchool)) {
          scoped.append('school_id', destination === 'school' ? `eq.${SCHOOL}` : `neq.${SCHOOL}`);
        }
        let body = input.body;
        if (input.method === 'POST') {
          const rows = (Array.isArray(payload) ? payload : [payload]).filter(row =>
            (String(row.school_id) === SCHOOL) === (destination === 'school'));
          body = JSON.stringify(Array.isArray(payload) ? rows : rows[0]);
        }
        const key = destination === 'school' ? schoolKey : divisionKey;
        return fetcher(`${destination === 'school' ? SCHOOL_URL : DIVISION_URL}/rest/v1/${input.table}?${scoped}`, {
          method: input.method,
          headers: {
            ...headers, ...overrides, apikey: key,
            ...(destination === 'division' ? { Authorization: authorization } :
              key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
            'content-type': 'application/json',
          },
          ...(reading || input.method === 'DELETE' ? {} : { body }),
          signal: AbortSignal.timeout(20000),
        });
      };
      if (destinations.includes('school')) {
        // Embedded joins bypass the column restrictions of the proxied table.
        if (/[():!]/.test(query.get('select') || '')) return json(400, { error: 'Embedded selections are not supported' });
        const conflict = query.get('on_conflict');
        if (conflict && conflict !== (input.table === 'sbfp_enrolment' ? 'school_id,sy' : 'id')) {
          return json(400, { error: 'Unsupported conflict key' });
        }
        if (query.has('columns')) return json(400, { error: 'Column overrides are not supported' });
        if (input.method === 'POST') {
          // Upsert filters do not protect a conflicting primary key in another school.
          const rows = (Array.isArray(payload) ? payload : [payload]).filter(row => String(row.school_id) === SCHOOL);
          for (const row of rows.filter(row => row.id != null)) {
            const lookup = new URLSearchParams({ id: `eq.${row.id}`, select: 'school_id' });
            const response = await fetcher(`${SCHOOL_URL}/rest/v1/${input.table}?${lookup}`, {
              headers: { apikey: schoolKey, ...(schoolKey.startsWith('eyJ') ? { Authorization: `Bearer ${schoolKey}` } : {}) },
              signal: AbortSignal.timeout(20000),
            });
            if (!response.ok) return json(502, { error: 'Could not validate record ownership' });
            if ((await response.json()).some(existing => String(existing.school_id) !== SCHOOL)) return json(409, { error: 'Record ID belongs to another school' });
          }
        }
      }
      // Never expose portal-only columns through the service-role connection.
      if (destinations.includes('school') && input.table === 'students') {
        if ([...query.keys()].some(key => !STUDENT_FIELDS.has(key) && !['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) ||
            (query.get('order') || '').split(',').filter(Boolean).some(order => !STUDENT_FIELDS.has(order.split('.')[0]))) {
          return json(400, { error: 'Only BMI learner fields may be queried' });
        }
        const select = query.get('select') || '*';
        if (select === '*') query.set('select', [...STUDENT_FIELDS].join(','));
        else if (select.split(',').some(field => !STUDENT_FIELDS.has(field))) return json(400, { error: 'Only BMI learner fields may be read' });
      }
      if (destinations.length === 1) return envelope(await send(destinations[0], query));
      if (!destinations.length) return envelope(new Response(reading ? '[]' : null, { status: reading ? 200 : 204 }));
      if (!reading) {
        const results = [];
        for (const destination of destinations) {
          const response = await send(destination, query);
          if (!response.ok) return envelope(response);
          const body = await response.text();
          if (body) results.push(...JSON.parse(body));
        }
        return envelope(new Response(results.length ? JSON.stringify(results) : null, { status: results.length ? 200 : 204 }));
      }
      if (input.method === 'HEAD') {
        let total = 0;
        for (const destination of destinations) {
          const response = await send(destination, query, { prefer: 'count=exact' });
          if (!response.ok) return envelope(response);
          total += Number(response.headers.get('content-range')?.split('/')[1] || 0);
        }
        return envelope(new Response(null, { headers: { 'content-range': `*/${total}` } }));
      }
      // shortcut: division-wide reads merge in memory; use a reporting service when data exceeds Edge memory limits.
      const range = headers.range?.match(/^(\d+)-(\d+)$/);
      const offset = Number(query.get('offset') || range?.[1] || 0);
      const limit = Number(query.get('limit') || (range ? Number(range[2]) - Number(range[1]) + 1 : 1000));
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 0) return json(400, { error: 'Invalid page' });
      const orders = (query.get('order') || '').split(',').filter(Boolean).map(order => order.split('.'));
      if (orders.some(([field]) => !/^[a-z_]+$/.test(field))) return json(400, { error: 'Unsupported order' });
      const selected = query.get('select');
      const added = orders.map(([field]) => field).filter(field => selected && selected !== '*' && !selected.split(',').includes(field));
      if (added.length) query.set('select', `${selected},${added.join(',')}`);
      query.delete('offset'); query.delete('limit');
      const all = [];
      for (const destination of destinations) {
        for (let start = 0; ; start += 1000) {
          query.set('offset', String(start)); query.set('limit', '1000');
          const response = await send(destination, query, { accept: 'application/json', range: `${start}-${start + 999}`, prefer: 'count=exact' });
          if (!response.ok) return envelope(response);
          const rows = await response.json();
          if (!Array.isArray(rows)) throw new Error('Expected rows');
          all.push(...rows);
          const total = Number(response.headers.get('content-range')?.split('/')[1]);
          if (!rows.length || (Number.isFinite(total) ? start + rows.length >= total : rows.length < 1000)) break;
        }
      }
      all.sort((a, b) => {
        for (const [field, direction = 'asc', nulls] of orders) {
          const x = a[field], y = b[field];
          if (x === y) continue;
          const descending = direction === 'desc';
          if (x == null || y == null) {
            const first = nulls ? nulls === 'nullsfirst' : descending;
            return (x == null ? -1 : 1) * (first ? 1 : -1);
          }
          const comparison = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
          if (comparison) return descending ? -comparison : comparison;
        }
        return 0;
      });
      const page = all.slice(offset, offset + limit).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !added.includes(key))));
      const single = headers.accept?.includes('application/vnd.pgrst.object+json');
      if (single && page.length !== 1) return envelope(Response.json({ code: 'PGRST116', message: 'Expected one row', details: `The result contains ${page.length} rows` }, { status: 406 }));
      return envelope(Response.json(single ? page[0] : page, { headers: { 'content-range': `${page.length ? `${offset}-${offset + page.length - 1}` : '*'}/${all.length}` } }));
    } catch {
      return json(502, { error: 'School data request failed; no fallback database was used' });
    }
  };
}

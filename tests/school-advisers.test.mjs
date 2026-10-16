import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Browser storage and a scriptable Supabase stand-in for public.class_advisers.
const makeStore = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
};
globalThis.localStorage = makeStore();
globalThis.sessionStorage = makeStore();
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

let serverRows = [];
let holdSelect = null;
const supabase = {
  from: () => ({
    upsert: async (rows) => {
      rows.forEach((row) => {
        serverRows = serverRows.filter((existing) => existing.id !== row.id).concat(row);
      });
      return { error: null };
    },
    delete: () => ({
      in: async (_column, ids) => {
        serverRows = serverRows.filter((row) => !ids.includes(row.id));
        return { error: null };
      },
    }),
    select: () => ({
      eq: async () => {
        const snapshot = serverRows.map((row) => ({ ...row }));
        if (holdSelect) await holdSelect;
        return { data: snapshot, error: null };
      },
    }),
  }),
};
globalThis.__testSupabase = supabase;

const orgChart = readFileSync(new URL('../src/utils/iecesOrgChart.js', import.meta.url), 'utf8');
const nameCase = readFileSync(new URL('../src/utils/nameCase.js', import.meta.url), 'utf8');
const orgNames = orgChart.slice(orgChart.indexOf('// "Juan Dela Cruz Eliot"'));
const source = readFileSync(new URL('../src/utils/schoolAdvisers.js', import.meta.url), 'utf8')
  .replace(/import \{ useCallback[^\n]*\n/, 'const useCallback = () => {}, useEffect = () => {}, useState = () => [];\n')
  .replace(/import \{ supabase \}[^\n]*\n/, 'const supabase = globalThis.__testSupabase;\n')
  .replace(/import \{ fetchIecesAdvisers[^\n]*\n/, `${nameCase.replace('export function', 'function')}\nconst fetchIecesAdvisers = async () => [];\nconst isIecesSchool = (id) => String(id) === '126001';\n${orgNames.replace('export function', 'function')}\n`);
const advisers = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const reset = () => {
  localStorage.clear();
  sessionStorage.clear();
  serverRows = [];
  holdSelect = null;
};

test('an adviser saved while a sync is in flight is not lost', async () => {
  reset();
  let release;
  holdSelect = new Promise((resolve) => { release = resolve; });
  const pageLoad = advisers.syncAdvisers('198006');
  const save = advisers.saveAdviser('198006', { grade: 'Grade 6', first: 'Juan', middle: 'Dela', family: 'Eliot' });
  release();
  holdSelect = null;
  await pageLoad;
  const result = await save;
  assert.equal(result.synced, true);
  assert.deepEqual(result.advisers.map((a) => a.displayName), ['Juan D. Eliot']);
  assert.deepEqual(advisers.loadLocalAdvisers('198006').map((a) => a.family), ['Eliot']);
  assert.equal(serverRows.length, 1);
});

test('removing an adviser deletes it on the server too', async () => {
  reset();
  const saved = await advisers.saveAdviser('198006', { grade: 'Grade 3', first: 'Ana', middle: '', family: 'Reyes' });
  await advisers.deleteAdviser('198006', saved.advisers[0].id);
  assert.equal(serverRows.length, 0);
  assert.deepEqual(advisers.loadLocalAdvisers('198006'), []);
});

test('old device teachers move only into the device\'s own school', () => {
  reset();
  localStorage.setItem('deped_bmi_teachers', JSON.stringify({ 'Grade 2': ['Maria C. Santos'] }));
  sessionStorage.setItem('sb_current_session', JSON.stringify({ school_id: '126005', auditMode: true }));
  assert.deepEqual(advisers.loadLocalAdvisers('198006'), [], 'audit mode must not receive them');

  sessionStorage.setItem('sb_current_session', JSON.stringify({ school_id: '126005' }));
  const migrated = advisers.loadLocalAdvisers('126005');
  assert.deepEqual(migrated.map((a) => [a.grade, a.displayName, a.pending]), [['Grade 2', 'Maria C. Santos', true]]);
  assert.equal(localStorage.getItem('deped_bmi_teachers'), null);
});

test('class labels match advisers by grade and loose family name', () => {
  const list = [{ id: '1', grade: 'Grade 6', family: 'Eliot', first: 'Juan', middle: '', displayName: 'Juan Eliot' }];
  assert.equal(advisers.adviserForSection(list, 'Grade 6 - Elliot')?.id, '1');
  assert.equal(advisers.adviserForSection(list, 'Grade 5 - Eliot'), null);
});

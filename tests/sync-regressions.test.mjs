import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
let local = [];
globalThis.window = {
  dispatchEvent() {},
  sqlite: { async loadStudents() { return structuredClone(local); }, async saveStudents(rows) { local = structuredClone(rows); } },
};
const source = readFileSync(new URL('../src/utils/syncService.js', import.meta.url), 'utf8')
  .replace(/import .* from '\.\/supabaseClient';/, "const supabase = { auth: { async getSession() { return { data: { session: null } }; } } }; const SUPABASE_URL = 'https://example.invalid'; const SUPABASE_ANON_KEY = 'test';")
  .replace(/import .* from '\.\/schoolLogoMap';/, "const SCHOOL_LOGO_BUCKET = 'test';");
const sync = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const student = (id, weight) => ({ id, schoolId: 'school', name: id, records: [{ weight }] });
const response = rows => ({ ok: true, headers: { get: () => `0-${rows.length}/${rows.length}` }, json: async () => rows });

test('edit during upload stays queued and survives the downloaded snapshot', async () => {
  storage.clear();
  local = [student('1', 20)];
  sync.queueStudentForSync('1');
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') {
      local = [student('1', 25)];
      sync.queueStudentForSync('1');
      return response([]);
    }
    return response([{ id: '1', name: '1', school_id: 'school', records: [{ weight: 20 }] }]);
  };
  const result = await sync.syncToServer([student('1', 20)], 'school');
  assert.equal(result.success, true);
  assert.equal(sync.getQueueLength(), 1);
  assert.equal(local[0].records[0].weight, 25);
  assert.equal(result.students[0].records[0].weight, 25);
});

test('new deletion during DELETE stays pending and cannot be resurrected by download', async () => {
  storage.clear();
  local = [student('2', 20)];
  sync.queueStudentForDelete('1');
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'DELETE') {
      sync.queueStudentForDelete('2');
      local = [];
      return response([]);
    }
    return response([{ id: '2', name: '2', records: [] }]);
  };
  const result = await sync.syncToServer(local, 'school');
  assert.equal(result.success, true);
  assert.equal(sync.getPendingSyncCount(), 1);
  assert.deepEqual(local, []);
  assert.deepEqual(result.students, []);
});

test('last learner deletion uploads even with an empty learner list', async () => {
  storage.clear();
  local = [];
  sync.queueStudentForDelete('last');
  let deleted = false;
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'DELETE') deleted = true;
    return response([]);
  };
  const result = await sync.syncToServer([], 'school');
  assert.equal(result.success, true);
  assert.equal(deleted, true);
  assert.equal(sync.getPendingSyncCount(), 0);
});

test('failed SQLite save is reported as a sync failure instead of success', async () => {
  storage.clear();
  local = [student('1', 20)];
  sync.queueStudentForSync('1');
  globalThis.fetch = async () => response([{ id: '1', name: '1', records: [{ weight: 20 }] }]);
  const save = window.sqlite.saveStudents;
  const log = console.error;
  window.sqlite.saveStudents = async () => { throw new Error('disk full'); };
  console.error = () => {};
  try {
    const result = await sync.syncToServer(local, 'school');
    assert.equal(result.success, false);
    assert.match(result.message, /disk full/);
  } finally {
    window.sqlite.saveStudents = save;
    console.error = log;
  }
});

test('failed SQLite read cannot be mistaken for an empty learner database', async () => {
  const load = window.sqlite.loadStudents;
  const log = console.error;
  window.sqlite.loadStudents = async () => { throw new Error('database unavailable'); };
  console.error = () => {};
  try { await assert.rejects(sync.localLoadStudents(), /database unavailable/); }
  finally { window.sqlite.loadStudents = load; console.error = log; }
});

test('SQLite save rollback restores original learners when insertion fails', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE students (id TEXT PRIMARY KEY, data TEXT, dirty INTEGER)');
  const db = {
    prepare: sql => sqlite.prepare(sql),
    transaction: fn => rows => {
      sqlite.exec('BEGIN');
      try { fn(rows); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const databaseSource = readFileSync(new URL('../electron/database.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = databaseSource.match(/export function saveStudents\(students, isDirty = false\) \{([\s\S]*?)\n\}\n/)[1];
  const save = new Function('db', 'students', 'isDirty', body);
  save(db, [{ id: 'original' }], false);
  assert.throws(() => save(db, [{ id: 'duplicate' }, { id: 'duplicate' }], true));
  assert.deepEqual(sqlite.prepare('SELECT id FROM students').all().map(row => row.id), ['original']);
  sqlite.close();
});

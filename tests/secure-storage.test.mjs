import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map([['legacy', 'private legacy text'], ['deped_bmi_offline_cache_division_v1', 'legacy password']]);
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
Object.defineProperty(storage, 'legacy', { enumerable: true, value: 'private legacy text' });
Object.defineProperty(storage, 'deped_bmi_offline_cache_division_v1', { enumerable: true, value: 'legacy password' });
globalThis.localStorage = storage;
globalThis.window = { dataProtection: {
  seal: value => 'protected:v1:' + Buffer.from(value).toString('base64'),
  open: value => Buffer.from(value.slice('protected:v1:'.length), 'base64').toString(),
} };
const { secureStorage } = await import('../src/utils/secureStorage.js');

test('persistent cache migrates legacy values and removes plaintext credential caches', () => {
  assert.equal(secureStorage.getItem('legacy'), 'private legacy text');
  assert.match(values.get('legacy'), /^protected:v1:/);
  assert.equal(values.has('deped_bmi_offline_cache_division_v1'), false);
  secureStorage.setItem('session', 'synthetic token');
  assert.notEqual(values.get('session'), 'synthetic token');
  assert.equal(secureStorage.getItem('session'), 'synthetic token');
  secureStorage.removeItem('session');
  assert.equal(secureStorage.getItem('session'), null);
});

test('browser recovery stores tokens only in memory without writing plaintext to disk', () => {
  const bridge = window.dataProtection;
  delete window.dataProtection;
  try {
    secureStorage.setItem('token', 'private');
    assert.equal(secureStorage.getItem('token'), 'private');
    assert.equal(values.has('token'), false);
  }
  finally { window.dataProtection = bridge; }
});

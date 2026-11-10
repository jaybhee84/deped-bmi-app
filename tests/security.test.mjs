import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, validateMacUpdate } from '../electron/security.js';
import { mergeStudentImport } from '../src/utils/mergeStudentImport.js';
import { passwordRecoveryUrl } from '../src/utils/passwordRecovery.js';

test('offline passwords have unique salts and reject plaintext, malformed hashes, and wrong passwords', () => {
  const hash = hashPassword('synthetic-password');
  assert.notEqual(hash, hashPassword('synthetic-password'));
  assert.ok(verifyPassword('synthetic-password', hash));
  assert.equal(verifyPassword('wrong', hash), false);
  assert.equal(verifyPassword('synthetic-password', 'synthetic-password'), false);
  assert.equal(verifyPassword('x', 'scrypt:broken'), false);
  assert.equal(verifyPassword(null, hash), false);
});

test('Mac downloads reject path traversal, arbitrary hosts, and mismatched filenames', () => {
  const repo = 'buzzjay84/deped-bmi-app';
  const url = `https://github.com/${repo}/releases/download/v1/app.dmg`;
  validateMacUpdate(url, 'app.dmg', repo);
  for (const [source, name] of [[url, '../app.dmg'], [url, '..\\app.dmg'], [url, 'other.dmg'],
    [url.replace('github.com', 'example.com'), 'app.dmg'], [url.replace('https:', 'http:'), 'app.dmg']]) {
    assert.throws(() => validateMacUpdate(source, name, repo));
  }
});

test('JSON imports keep learners without LRNs separate and do not mutate existing state', () => {
  const current = [{ id: 'a', name: 'A', records: [{ sy: '2026', q: 'Baseline', date: '2026-01-01' }] }];
  const incoming = [{ name: 'B', records: [] }, { name: 'C', records: [] }];
  const result = mergeStudentImport(current, incoming);
  assert.equal(result.length, 3);
  assert.notEqual(result[1].id, result[2].id);
  assert.notEqual(result[0], current[0]);
  assert.throws(() => mergeStudentImport(current, [null]));
  assert.throws(() => mergeStudentImport(current, [{ name: 'broken' }]));
});

test('JSON import merges a real LRN once without duplicating incoming measurements', () => {
  const row = { name: 'Synthetic', lrn: '000000000001', records: [] };
  const record = { sy: '2026', q: 'Baseline', date: '2026-01-01' };
  const result = mergeStudentImport([row], [{ ...row, records: [record, record] }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].records.length, 1);
  assert.equal(row.records.length, 0);
});

test('JSON imports reject another school and bind unassigned learners to the active school', () => {
  assert.throws(() => mergeStudentImport([], [{ name: 'Other', schoolId: 'other', records: [] }], 'own'), /another school/);
  assert.equal(mergeStudentImport([], [{ name: 'Own', records: [] }], 'own')[0].schoolId, 'own');
});

test('password recovery uses a configured HTTPS site and rejects arbitrary HTTP and file URLs', () => {
  const desktop = { protocol: 'file:', hostname: '', origin: 'null' };
  assert.throws(() => passwordRecoveryUrl('', desktop));
  assert.throws(() => passwordRecoveryUrl('http://example.com/reset-password', desktop));
  assert.throws(() => passwordRecoveryUrl('file:///tmp/reset-password', desktop));
  assert.equal(passwordRecoveryUrl('https://school.example/reset-password', desktop), 'https://school.example/reset-password');
});

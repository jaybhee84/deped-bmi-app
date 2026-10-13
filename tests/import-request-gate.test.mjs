import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportRequestGate } from '../src/utils/importRequestGate.js';

test('changing selection prevents a delayed file read from publishing a preview', async () => {
  const gate = createImportRequestGate();
  const current = gate.start();
  let finish;
  const read = new Promise(resolve => { finish = resolve; });
  let preview = [];
  const pending = read.then(rows => { if (current()) preview = rows; });
  gate.invalidate();
  finish(['old-year learner']);
  await pending;
  assert.deepEqual(preview, []);
});

test('new upload supersedes prior upload and closing invalidates the latest read', () => {
  const gate = createImportRequestGate();
  const first = gate.start();
  const second = gate.start();
  assert.equal(first(), false);
  assert.equal(second(), true);
  gate.invalidate();
  assert.equal(second(), false);
});

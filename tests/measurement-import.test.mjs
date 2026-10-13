import test from 'node:test';
import assert from 'node:assert/strict';
import { existingMeasurementDate, mergeMeasurementRows, measurementIdentifier, matchMeasurementLearner } from '../src/utils/measurementImport.js';

const sy = '2026–2027';
const baseline = { sy, q: 'Baseline', date: '2026-06-01', weight: 18, height: 1.1 };
const midline = { sy, q: 'Midline', date: '2026-09-01', weight: 20, height: 1.2, consent: 'Y' };
const students = [
  { id: 1, records: [baseline, midline] },
  { id: 2, records: [baseline] },
  { id: 3, records: [midline] },
];
const row = (studentId, weight, height) => ({ matched: true, studentId, weight, height });

test('real measurements clear an old unsupported status note', () => {
  const noted = [{ id: 1, records: [{ ...midline, weight: 0, height: 0, note: 'Transferred' }] }];
  const measured = mergeMeasurementRows(noted, [row(1, 22, 1.3)], sy, 'Midline', midline.date);
  assert.equal(measured[0].records[0].note, undefined);
  assert.equal(measured[0].records[0].weight, 22);
});

test('existing identifier cannot redirect another named learner row', () => {
  const a = { id: 'A', name: 'Learner A', lrn: '123456789012', registryNo: 'registry-A' };
  const b = { id: 'B', name: 'Learner B', registryNo: 'registry-B' };
  for (const identifier of [a.lrn, a.registryNo]) {
    assert.ok(matchMeasurementLearner([a, b], [a, b], identifier, b.name).error);
    assert.equal(matchMeasurementLearner([a, b], [a, b], identifier, ' learner A ').student, a);
  }
});

test('Midline updates use shared date even when learner previously had a different date', () => {
  const original = [students[0], { id: 2, records: [{ ...midline, date: '2026-10-01' }] }];
  const result = mergeMeasurementRows(original, [row(2, 22, null)], sy, 'Midline', '2026-10-14');
  assert.equal(result[1].records[0].date, midline.date);
  assert.equal(result[1].records[0].height, midline.height);
  assert.equal(original[1].records[0].date, '2026-10-01');
});

test('prefer LRN, match either identifier and save a newly entered LRN', () => {
  const learner = { ...students[0], name: 'Learner One', registryNo: '2026-G1-001' };
  assert.equal(measurementIdentifier(learner), learner.registryNo);
  const resolved = matchMeasurementLearner([learner], [learner], '001234567890', ' learner ONE ');
  assert.equal(resolved.student, learner);
  const result = mergeMeasurementRows([learner], [{ matched: true, studentId: 1, lrn: resolved.lrn }], sy, 'Midline', midline.date);
  assert.equal(result[0].lrn, '001234567890');
  assert.equal(measurementIdentifier(result[0]), '001234567890');
  assert.equal(result[0].registryNo, learner.registryNo);
  assert.deepEqual(result[0].records, learner.records);
  assert.equal(matchMeasurementLearner(result, result, result[0].lrn, '').student, result[0]);
  assert.equal(matchMeasurementLearner(result, result, learner.registryNo, '').student, result[0]);
});

test('reject invalid, ambiguous and conflicting new LRN assignments', () => {
  const learner = { id: 1, name: 'Same Name' };
  assert.ok(matchMeasurementLearner([learner], [learner], '123', learner.name).error);
  assert.ok(matchMeasurementLearner([learner], [learner, { ...learner, id: 2 }], '001234567890', learner.name).error);
  assert.ok(matchMeasurementLearner([learner], [], '001234567890', learner.name).error);
  const assigned = { ...learner, lrn: '123456789012' };
  assert.ok(matchMeasurementLearner([assigned], [assigned], '001234567890', learner.name).error);
});

test('repeat upload keeps blank rows and adds missing learner using established Midline date', () => {
  const result = mergeMeasurementRows(students, [row(1, null, null), row(2, 21, 1.25)], sy, 'Midline', '2026-10-14');
  assert.equal(result[0], students[0]);
  assert.equal(result[2], students[2]);
  assert.deepEqual(result[1].records, [baseline, { sy, q: 'Midline', date: midline.date, weight: 21, height: 1.25 }]);
  assert.deepEqual(students[1].records, [baseline]);
  assert.deepEqual(mergeMeasurementRows(result, [row(2, 21, 1.25)], sy, 'Midline', '2026-10-14'), result);
});

test('partial measurements preserve other fields, other periods, and original date', () => {
  const result = mergeMeasurementRows(students, [row(1, 22, null)], sy, 'Midline', '2026-10-14');
  assert.deepEqual(result[0].records, [baseline, { ...midline, weight: 22 }]);
  const heightOnly = mergeMeasurementRows(result, [row(1, null, 1.3)], sy, 'Midline', '2026-10-14');
  assert.deepEqual(heightOnly[0].records, [baseline, { ...midline, weight: 22, height: 1.3 }]);
});

test('first import sets date and another school year does not inherit it', () => {
  assert.equal(existingMeasurementDate(students, '2027–2028', 'Midline'), '');
  const result = mergeMeasurementRows([{ id: 1 }], [row(1, 20, 1.2)], sy, 'Midline', '2026-09-02');
  assert.equal(result[0].records[0].date, '2026-09-02');
});

test('duplicate rows merge supplied cells and unmatched rows cannot overwrite data', () => {
  const result = mergeMeasurementRows(students, [row(1, 23, null), row(1, null, 1.4), { ...row(3, 90, 2), matched: false }], sy, 'Midline', '2026-10-14');
  assert.deepEqual(result[0].records, [baseline, { ...midline, weight: 23, height: 1.4 }]);
  assert.equal(result[2], students[2]);
});

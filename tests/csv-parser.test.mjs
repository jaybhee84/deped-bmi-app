import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { matchMeasurementLearner } from '../src/utils/measurementImport.js';

// Exercise the production parser with synthetic learner records, without
// launching Electron or connecting to a school database.
const source = readFileSync(new URL('../src/components/CSVUpload.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  function parseRows(fileRows)');
const end = source.indexOf('  async function handleFile', start);
const helpers = source.slice(source.indexOf('function normalizeHeader'), source.indexOf('// Simple Badge'));
const createParser = new Function('students', 'classStudents', 'scopedStudents', 'period', 'measurementDate', 'matchMeasurementLearner', 'normalizeHeightMeters', 'calcBMI', 'getBMIStatus', 'getHAZStatus', 'Papa',
  `${helpers}\n${source.slice(start, end)}\nreturn { parseRows, readCsvRows };`);
const students = [
  { id: 'A', name: 'Learner A', registryNo: 'registry-A', records: [] },
  { id: 'B', name: 'Learner B', registryNo: 'registry-B', records: [] },
];
const parser = () => createParser(students, students, students, 'Midline', '2026-10-01', matchMeasurementLearner,
  value => value > 0 ? value > 3 ? value / 100 : value : null,
  (w, h) => w / (h * h), () => null, () => null, Papa);
const row = (id, name, weight, height, rowNo = 2) => ({ rowNo, values: {
  registry_lrn_no: id, name, midline_weight: weight, midline_height: height,
} });

test('reject all conflicting new LRN rows rather than saving the first assignment', () => {
  const result = parser().parseRows([
    row('123456789012', 'Learner A', '20', '1.2'),
    row('123456789012', 'Learner B', '21', '1.3', 3),
  ]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 2);
});

test('each sheet can use its own legacy or period-specific measurement headers', () => {
  const result = parser().parseRows([
    row('registry-A', 'Learner A', '20', '1.2'),
    { rowNo: 'Section B, row 2', values: { registry_no: 'registry-B', name: 'Learner B', weight: '21', height_m: '1.3' } },
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map(row => row.weight), [20, 21]);
});

test('numeric measurements reject status text, trailing text, and infinity', () => {
  for (const invalid of ['Transferred', 'Not in School', '20abc', 'Infinity']) {
    assert.equal(parser().parseRows([row('registry-A', 'Learner A', invalid, '1.2')]).rows.length, 0);
    assert.equal(parser().parseRows([row('registry-A', 'Learner A', '20', invalid)]).rows.length, 0);
  }
});

test('v4.0.0 class-title CSV remains readable and leading-zero LRN stays text', () => {
  const { readCsvRows, parseRows } = parser();
  const rows = readCsvRows('Grade 1 - A\nregistry_no,name,weight,height_m\n001234567890,Learner A,20,1.2');
  const result = parseRows(rows);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].lrn, '001234567890');
  assert.equal(rows[0].rowNo, 3);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { matchMeasurementLearner } from '../src/utils/measurementImport.js';
import { parseMeasurementHeight } from '../src/utils/measurementInput.js';

// Exercise the production parser with synthetic learner records, without
// launching Electron or connecting to a school database.
const source = readFileSync(new URL('../src/components/CSVUpload.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  function parseRows(fileRows)');
const end = source.indexOf('  async function handleFile', start);
const helpers = source.slice(source.indexOf('function normalizeHeader'), source.indexOf('// Simple Badge'));
const createParser = new Function('students', 'classStudents', 'scopedStudents', 'period', 'measurementDate', 'matchMeasurementLearner', 'parseMeasurementHeight', 'calcBMI', 'getBMIStatus', 'getHAZStatus', 'Papa',
  `${helpers}\n${source.slice(start, end)}\nreturn { parseRows, readCsvRows };`);
const students = [
  { id: 'A', name: 'Learner A', registryNo: 'registry-A', records: [] },
  { id: 'B', name: 'Learner B', registryNo: 'registry-B', records: [] },
];
const parser = () => createParser(students, students, students, 'Midline', '2026-10-01', matchMeasurementLearner,
  parseMeasurementHeight,
  (w, h) => w / (h * h), () => null, () => null, Papa);
const row = (id, name, weight, height, rowNo = 2) => ({ rowNo, values: {
  registry_lrn_no: id, name, midline_weight: weight, midline_height: height,
} });

test('centimeter and meter column headings preserve units and decimal heights', () => {
  for (const [heading, value] of [['Midline Height (cm)', '102.5'], ['Midline Height (m)', '1.025']]) {
    const { readCsvRows, parseRows } = parser();
    const result = parseRows(readCsvRows(`Registry / LRN No,Name,Midline Weight (kg),${heading}\nregistry-A,Learner A,15,${value}`));
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows[0].height, 1.025);
    assert.ok(Math.abs(result.rows[0].bmi - 14.27721594289114) < 1e-10);
  }
});

test('tiny heights cannot produce saved inflated BMI values', () => {
  for (const [key, value] of [['midline_height_cm', '1.025'], ['midline_height_m', '0.1025'], ['midline_height', '0.1025']]) {
    const result = parser().parseRows([{ rowNo: 2, values: { registry_no: 'registry-A', name: 'Learner A', midline_weight: '15', [key]: value } }]);
    assert.equal(result.rows.length, 0);
    assert.equal(result.errors.length, 1);
  }
});

test('older meter templates accept centimeter entries without rejecting an entire class', () => {
  const { readCsvRows, parseRows } = parser();
  const result = parseRows(readCsvRows('Registry / LRN No,Name,Midline Weight (kg),Midline Height (m)\nregistry-A,Learner A,15,102.5\nregistry-B,Learner B,17,110.3'));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map(row => row.height), [1.025, 1.103]);
});

test('Kinder whole-number heights with missing decimals upload with correct BMI', () => {
  const { readCsvRows, parseRows } = parser();
  const result = parseRows(readCsvRows('Registry / LRN No,Name,Midline Weight (kg),Midline Height (m)\nregistry-A,Learner A,15,1025\nregistry-B,Learner B,17,1103'));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows.map(row => row.height), [1.025, 1.103]);
  assert.ok(Math.abs(result.rows[0].bmi - 14.27721594289114) < 1e-10);
});

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

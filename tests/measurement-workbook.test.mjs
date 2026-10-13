import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { workbookRows, sectionSheetName } from '../src/utils/measurementWorkbook.js';
import { mergeMeasurementRows } from '../src/utils/measurementImport.js';

test('all section sheets round-trip and import together without erasing blank measurements', async () => {
  const workbook = new ExcelJS.Workbook();
  for (const [section, id, weight, height] of [
    ['Grade 2 - Ocampo', '001', 21, 1.25],
    ['Grade 2 - Rizal', '002', 22, 1.3],
    ['Grade 2 - Luna', '003', null, null],
  ]) {
    const sheet = workbook.addWorksheet(section);
    sheet.addRow(['Registry No', 'Midline Weight (kg)', 'Midline Height (m)']);
    sheet.addRow([id, weight, height]);
  }
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  const text = value => value == null ? '' : String(value);
  const rows = workbookRows(restored, text, raw => Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, text(value)])));
  assert.equal(rows.length, 3);
  assert.match(rows[1].rowNo, /Rizal/);
  assert.deepEqual(rows.map(row => row.values['Registry No']), ['001', '002', '003']);
  const original = ['001', '002', '003'].map(id => ({ id, records: [{ sy: '2026', q: 'Midline', date: '2026-10-01', weight: 20, height: 1.2 }] }));
  const imported = mergeMeasurementRows(original, rows.map(({ values }) => ({
    matched: true, studentId: values['Registry No'],
    weight: values['Midline Weight (kg)'] ? Number(values['Midline Weight (kg)']) : null,
    height: values['Midline Height (m)'] ? Number(values['Midline Height (m)']) : null,
  })), '2026', 'Midline', '2026-10-14');
  assert.equal(imported[0].records[0].weight, 21);
  assert.equal(imported[1].records[0].weight, 22);
  assert.equal(imported[2], original[2]);
});

test('long, invalid, and duplicate section names produce valid unique sheet names', () => {
  const used = new Set();
  const names = ['A/B', 'A:B', 'x'.repeat(40), 'x'.repeat(40), "'Section'"].map(section => sectionSheetName(section, used));
  assert.equal(new Set(names.map(name => name.toLowerCase())).size, names.length);
  names.forEach(name => { assert.ok(name.length <= 31); assert.doesNotMatch(name, /[\\/*?:\[\]]/); });
});

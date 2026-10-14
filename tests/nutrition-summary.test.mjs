import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

// Resolve the app's extensionless imports for Node without changing app code.
async function sourceModule(path) {
  if (String(path).endsWith('/schoolLogoMap.js')) {
    return `data:text/javascript,export const getSchoolAbbreviation = () => null;`;
  }
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  source = source.replace(/from ['"]([^.'"][^'"]+)['"]/g, (_, name) => `from '${import.meta.resolve(name)}'`);
  const imports = [...source.matchAll(/from ['"](\.\/[^'"]+)['"]/g)];
  for (const match of imports) {
    const url = new URL(match[1].endsWith('.js') ? match[1] : `${match[1]}.js`, new URL(path, import.meta.url));
    const dependency = await sourceModule(url.href);
    source = source.replace(match[0], `from '${dependency}'`);
  }
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const { buildNutritionReport } = await import(await sourceModule('../src/utils/nutritionSummaryModel.js'));
const { getBMIStatus, getHAZStatus, normalizeHeightCm, normalizeHeightMeters, formatHeightMeters, calcBMI } = await import(await sourceModule('../src/utils/bmi.js'));
const { buildNsReportClasses } = await import(await sourceModule('../src/utils/nsReportModel.js'));

test('Baseline entry, uploaded measurements and report agree for decimal centimeter heights', () => {
  for (const height of [102.5, 107.5, 110.3, 115.8]) {
    const weight = 17;
    const baselineBmi = calcBMI(weight, height);
    const savedHeight = normalizeHeightMeters(height);
    const reportHeightCm = normalizeHeightCm(savedHeight);
    const reportBmi = calcBMI(weight, reportHeightCm);
    assert.ok(Math.abs(reportBmi - baselineBmi) < 1e-10);
    const [report] = buildNsReportClasses([{
      id: 1, name: 'Learner', sex: 'M', section: 'Kinder', birthdate: '2021-01-01',
      rec: { weight, height: savedHeight, date: '2026-10-01' },
      heightCm: reportHeightCm, bmi: reportBmi,
    }]);
    assert.ok(Math.abs(report.rows[0].heightMeters - height / 100) < 1e-10);
    assert.ok(Math.abs(report.rows[0].bmi - baselineBmi) < 1e-10);
  }
});

test('uploaded centimetres convert to meters with two decimal places', () => {
  for (const input of [110, '110', 1.1, '1.10']) {
    assert.equal(normalizeHeightMeters(input), 1.1);
    assert.equal(formatHeightMeters(input), '1.10');
    assert.equal(calcBMI(20, input), calcBMI(20, 1.1));
  }
  assert.equal(formatHeightMeters(100), '1.00');
  assert.equal(formatHeightMeters(110.5), '1.105');
});
const { createNsReportWorkbook } = await import(await sourceModule('../src/utils/exportNsReportExcel.js'));

test('all-learner summary includes missing measurements and exports the same totals', async () => {
  const students = [
    { name: 'Measured', section: 'Grade 2 - A', sex: 'Male', birthdate: '2018-01-01', records: [{ sy: '2026', q: 'Baseline', date: '2026-07-01', weight: 25, height: 125 }] },
    { name: 'Missing', section: 'Grade 2 - A', sex: 'Female', records: [] },
    { name: 'Other period', section: 'Kinder - B', sex: 'M', records: [{ sy: '2026', q: 'Endline', weight: 20, height: 115 }] },
  ];
  const summary = buildNutritionReport(students, '2026', 'Baseline');
  assert.equal(summary.grand.Total.enrolment, 3);
  assert.equal(summary.grand.M.enrolment, 2);
  assert.equal(summary.grand.F.enrolment, 1);
  assert.equal(summary.grand.Total.weighed, 1);
  assert.equal(summary.grand.Total.takenHeight, 1);
  assert.equal(summary.rows.find(row => row.grade === 'Grade 2').Total.enrolment, 2);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(createNsReportWorkbook([], { schoolName: 'Test School', schoolYear: '2026', period: 'Baseline' }, null, { ...summary, title: 'SBFP SUMMARY — ALL LEARNERS' }));
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Summary']);
  const sheet = workbook.getWorksheet('Summary');
  const totalRows = [];
  sheet.eachRow(row => { if (row.getCell(2).value === 'Total') totalRows.push(row); });
  assert.equal(totalRows.at(-1).getCell(3).value, 3);
});

test('summary workbook embeds a small centered DepEd seal above its heading', async () => {
  const seal = new Uint8Array(await readFile(new URL('../src/images/deped.png', import.meta.url)));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(createNsReportWorkbook([], { schoolName: 'Test School' }, seal, {
    ...buildNutritionReport([], '2026', 'Baseline'), title: 'SBFP BENEFICIARIES',
  }));
  const sheet = workbook.getWorksheet('Summary');
  const [image] = sheet.getImages();
  assert.ok(image);
  assert.equal(image.range.ext.width, 48);
  assert.equal(image.range.ext.height, 48);
  assert.equal(image.range.tl.nativeRow, 0);
  assert.ok(image.range.tl.nativeCol >= 10);
  assert.equal(sheet.getCell('A2').value, 'Department of Education');
});

test('summary uses the measurement section and rejects non-finite measurements', () => {
  const report = buildNutritionReport([
    { section: 'Grade 3 - Current', sex: 'F', records: [{ sy: '2026', q: 'Baseline', section: 'Grade 2 - Earlier', weight: Infinity, height: Infinity }] },
  ], '2026', 'Baseline');
  assert.equal(report.rows.find(row => row.grade === 'Grade 2').F.enrolment, 1);
  assert.equal(report.rows.find(row => row.grade === 'Grade 3').F.enrolment, 0);
  assert.equal(report.grand.Total.weighed, 0);
  assert.equal(report.grand.Total.takenHeight, 0);
});

test('full sex labels use the same reference tables as M and F', () => {
  for (const [code, label] of [['M', 'Male'], ['F', ' Female ']]) {
    for (const bmi of [13, 15, 18, 23]) {
      assert.deepEqual(getBMIStatus(bmi, label, '2018-01-01', '2026-07-01'), getBMIStatus(bmi, code, '2018-01-01', '2026-07-01'));
    }
    for (const height of [110, 120, 130, 140]) {
      assert.deepEqual(getHAZStatus(height, label, '2018-01-01', '2026-07-01'), getHAZStatus(height, code, '2018-01-01', '2026-07-01'));
    }
  }
});

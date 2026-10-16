import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise SDOReports' period/population rules without rendering React.
const source = readFileSync(new URL('../src/components/SDOReports.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const helpers = [
  slice('const normalizeStr =', '\nfunction isMatchSY'),
  slice('function isMatchSY', '\nfunction isMatchPeriod'),
  slice('function isMatchPeriod', '\n/**'),
  slice('// Midline and Endline weigh only', '\nfunction computeGradeSummary'),
].join('\n');
const { reportPopulation, populationLabel } = new Function(
  'isSbfpBeneficiary',
  `${helpers}\nreturn { reportPopulation, populationLabel };`,
)((student) => student.beneficiary === true);

const learner = (id, beneficiary, periods = ['Baseline', 'Midline']) => ({
  id,
  beneficiary,
  records: periods.map((q) => ({ sy: '2026–2027', q, weight: 20, height: 1.1 })),
});
const students = [learner('ben', true), learner('other', false), learner('ben-not-weighed', true, ['Baseline'])];

test('Baseline counts every learner', () => {
  assert.equal(reportPopulation(students, '2026–2027', 'Baseline', {}).length, 3);
  assert.equal(populationLabel('Baseline'), 'Enrolment');
});

test('Midline and Endline count only SBFP beneficiaries', () => {
  for (const period of ['Midline', 'Endline']) {
    assert.deepEqual(
      reportPopulation(students, '2026–2027', period, {}).map((s) => s.id),
      ['ben', 'ben-not-weighed'],
    );
    assert.equal(populationLabel(period), 'SBFP Beneficiaries');
  }
});

test('a learner without a Baseline that year is not a beneficiary', () => {
  assert.deepEqual(reportPopulation([learner('late', true, ['Midline'])], '2026–2027', 'Midline', {}), []);
});

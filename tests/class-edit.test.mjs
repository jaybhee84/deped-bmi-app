import test from 'node:test';
import assert from 'node:assert/strict';
import { applyClassEdit, classAdviser, sectionWithAdviser } from '../src/utils/classEdit.js';
import { titleCaseName } from '../src/utils/nameCase.js';

const learners = () => [
  {
    id: 1,
    section: 'Grade 6 - Elliot',
    teacherName: 'Juan D. Elliot',
    records: [
      { sy: '2025–2026', q: 'Baseline', section: 'Grade 5 - Reyes', teacherName: 'Ana Reyes' },
      { sy: '2026–2027', q: 'Baseline', section: 'Grade 6 - Elliot', teacherName: 'Juan D. Elliot', teacherDisplayName: 'Juan D. Elliot' },
    ],
  },
  { id: 2, section: 'Grade 6 - Santos', records: [{ section: 'Grade 6 - Santos' }] },
];

test('renames the class on the learner and its records only', () => {
  const before = learners();
  const after = applyClassEdit(before, 'Grade 6 - Elliot', { section: 'Grade 6 - Eliot' });
  assert.equal(after[0].section, 'Grade 6 - Eliot');
  assert.equal(after[0].records[1].section, 'Grade 6 - Eliot');
  assert.equal(after[0].records[1].teacherName, 'Juan D. Elliot');
  assert.equal(after[0].records[0].section, 'Grade 5 - Reyes');
  assert.equal(after[1], before[1]);
});

test('changes or clears the adviser for the class', () => {
  const changed = applyClassEdit(learners(), 'Grade 6 - Elliot', { section: 'Grade 6 - Eliot', adviser: '  Juan  D. Eliot ' });
  assert.equal(changed[0].teacherName, 'Juan D. Eliot');
  assert.equal(changed[0].records[1].teacherDisplayName, 'Juan D. Eliot');
  assert.equal(changed[0].records[0].teacherName, 'Ana Reyes');

  const cleared = applyClassEdit(learners(), 'Grade 6 - Elliot', { adviser: '' });
  assert.equal('teacherName' in cleared[0].records[1], false);
  assert.equal(cleared[0].section, 'Grade 6 - Elliot');
});

test('reads the current adviser and swaps the family name in a label', () => {
  assert.equal(classAdviser(learners(), 'Grade 6 - Elliot'), 'Juan D. Elliot');
  assert.equal(classAdviser(learners(), 'Grade 6 - Santos'), '');
  assert.equal(sectionWithAdviser('Kinder - Elliot - Morning', 'Eliot'), 'Kinder - Eliot - Morning');
  assert.equal(sectionWithAdviser('Grade 6', 'Eliot'), 'Grade 6');
  assert.equal(sectionWithAdviser('Grade 6 - Elliot', 'ELIOT'), 'Grade 6 - Eliot');
});

test('class names and advisers use first-letter capitals only', () => {
  assert.equal(titleCaseName('grade 6 - ELIOT'), 'Grade 6 - Eliot');
  assert.equal(titleCaseName('DELA CRUZ'), 'Dela Cruz');
  assert.equal(titleCaseName("ma. o'NEIL-SANTOS"), "Ma. O'Neil-Santos");
  const after = applyClassEdit(learners(), 'Grade 6 - Elliot', { section: 'grade 6 - ELIOT', adviser: 'JUAN D. ELIOT' });
  assert.equal(after[0].section, 'Grade 6 - Eliot');
  assert.equal(after[0].records[1].teacherName, 'Juan D. Eliot');
});

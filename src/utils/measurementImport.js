export function existingMeasurementDate(students, sy, period) {
  return students.flatMap((student) => student.records || [])
    .find((record) => record.sy === sy && record.q === period && record.date)?.date || '';
}

export function mergeMeasurementRows(students, rows, sy, period, date) {
  const measuredDate = period === 'Midline'
    ? existingMeasurementDate(students, sy, period) || date
    : date;
  return students.map((student) => {
    const incoming = rows.filter((row) => row.matched && row.studentId === student.id
      && (row.weight != null || row.height != null || validLrn(row.lrn)));
    if (!incoming.length) return student;
    const records = student.records || [];
    const lrn = incoming.find(row => validLrn(row.lrn))?.lrn;
    if (!incoming.some(row => row.weight != null || row.height != null)) {
      return { ...student, ...(lrn ? { lrn: String(lrn) } : {}) };
    }
    const existing = records.find((record) => record.sy === sy && record.q === period);
    const merged = { ...existing, sy, q: period, date: period === 'Midline' ? measuredDate : existing?.date || measuredDate };
    for (const row of incoming) {
      if ((row.weight > 0 || row.height > 0) && merged.note) delete merged.note;
      if (row.weight != null) merged.weight = row.weight;
      if (row.height != null) merged.height = row.height;
    }
    return {
      ...student,
      ...(lrn ? { lrn: String(lrn) } : {}),
      records: [...records.filter((record) => !(record.sy === sy && record.q === period)), merged],
    };
  });
}
export function validLrn(value) {
  return /^\d{12}$/.test(String(value ?? '').trim());
}

export function measurementIdentifier(student) {
  return validLrn(student.lrn) ? String(student.lrn).trim() : student.registryNo || '';
}

export function matchMeasurementLearner(students, selected, identifier, name) {
  const normalizedName = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const id = String(identifier ?? '').trim();
  if (/^\d+$/.test(id) && !validLrn(id)) return { error: 'LRN must contain exactly 12 digits.' };
  const direct = students.filter(s => String(s.registryNo || '').trim() === id || (validLrn(id) && String(s.lrn || '').trim() === id));
  if (direct.length > 1) return { error: 'Identifier matches more than one learner.' };
  if (direct.length) {
    if (normalizedName(name) && normalizedName(name) !== normalizedName(direct[0].name)) {
      return { error: 'Registry / LRN number belongs to a different learner name. Check the identifier and name.' };
    }
    return { student: direct[0], lrn: validLrn(id) ? id : undefined };
  }
  if (!validLrn(id)) return {};
  // Replacing a registry number with a new LRN requires an unambiguous name
  // in the selected class/grade; never infer a learner from spreadsheet order.
  const matches = selected.filter(s => normalizedName(s.name) === normalizedName(name) && normalizedName(name));
  if (matches.length !== 1) return { error: 'New LRN requires a unique matching learner name in the selected class or grade.' };
  if (validLrn(matches[0].lrn) && String(matches[0].lrn).trim() !== id) return { error: 'Learner already has a different LRN. Update it in the learner profile.' };
  return { student: matches[0], lrn: id };
}

export function mergeStudentImport(current, incoming, schoolId = '') {
  if (!Array.isArray(incoming) || incoming.some(s => !s || typeof s !== 'object' ||
      typeof s.name !== 'string' || !s.name.trim() || !Array.isArray(s.records) ||
      s.records.some(r => !r || typeof r !== 'object' || Array.isArray(r)))) {
    throw new Error('Invalid learner export. Each learner needs a name and a records array.');
  }
  if (schoolId && incoming.some(s => (s.schoolId || s.school_id) && String(s.schoolId || s.school_id) !== String(schoolId))) {
    throw new Error('This export contains learners from another school.');
  }
  const merged = current.map(s => ({ ...s, records: [...(s.records || [])] }));
  for (const row of incoming) {
    const lrn = String(row.lrn ?? '').trim();
    const existing = /^\d{12}$/.test(lrn) ? merged.find(s => String(s.lrn) === lrn) : null;
    if (existing) {
      const keys = new Set(existing.records.map(r => `${r.sy}-${r.q}-${r.date}`));
      for (const record of row.records) {
        const key = `${record.sy}-${record.q}-${record.date}`;
        if (!keys.has(key)) { existing.records.push({ ...record }); keys.add(key); }
      }
    } else {
      merged.push({ ...row, ...(schoolId ? { schoolId } : {}), id: crypto.randomUUID(), records: row.records.map(r => ({ ...r })) });
    }
  }
  return merged;
}

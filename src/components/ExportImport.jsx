import React, { useRef } from 'react';
import './ExportImport.css';

export default function ExportImport({ students, setStudents }) {
  const fileRef = useRef();

  function handleExport() {
    const data = JSON.stringify(students, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `deped-bmi-students-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!Array.isArray(parsed)) {
          alert('Invalid file. Please use a file exported from this app.');
          return;
        }
        setStudents(prev => {
          const merged = [...prev];
          parsed.forEach(incoming => {
            const existing = merged.find(
              s => s.lrn === incoming.lrn && incoming.lrn !== '—'
            );
            if (existing) {
              const existingKeys = new Set(
                existing.records.map(r => `${r.sy}-${r.q}-${r.date}`)
              );
              const newRecs = incoming.records.filter(
                r => !existingKeys.has(`${r.sy}-${r.q}-${r.date}`)
              );
              existing.records = [...existing.records, ...newRecs];
            } else {
              merged.push({ ...incoming, id: Date.now() + Math.random() });
            }
          });
          return merged;
        });
        alert(`✓ Import successful! ${parsed.length} student records loaded.`);
      } catch {
        alert('Failed to read file. Make sure it is a valid JSON export.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  return (
    <div className="export-import-bar">
      <span className="export-import-label">Data:</span>
      <button className="btn-export" onClick={handleExport}>
        ⬇ Export
      </button>
      <button className="btn-import" onClick={() => fileRef.current.click()}>
        ⬆ Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImport}
      />
    </div>
  );
}

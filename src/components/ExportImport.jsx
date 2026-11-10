import React, { useRef } from 'react';
import './ExportImport.css';
import { mergeStudentImport } from '../utils/mergeStudentImport';

export default function ExportImport({ students, setStudents, schoolId }) {
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
    if (file.size > 50 * 1024 * 1024) { alert('Choose an export smaller than 50 MB.'); return; }
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        // Validate before scheduling a React update so malformed files are caught here.
        mergeStudentImport([], parsed, schoolId);
        setStudents(prev => mergeStudentImport(prev, parsed, schoolId));
        alert(`✓ Import successful! ${parsed.length} student records loaded.`);
      } catch {
        alert('Failed to read file. Make sure it is a valid JSON export.');
      }
      e.target.value = '';
    };
    reader.onerror = () => alert('Unable to read the selected file.');
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

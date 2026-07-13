import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseConfig } from "../utils/syncService";
import "./Reports.css";

export default function ForPrinting({
  sy,
  period,
  displayRows,
  handlePrint,
  setPreviewOpen,
}) {
  const [schoolName, setSchoolName] = useState("");

  useEffect(() => {
    loadSchoolName();
  }, []);

  async function loadSchoolName() {
    try {
      const config = loadSupabaseConfig();

      if (config?.url && config?.key) {
        const supabase = createClient(config.url, config.key);

        const { data, error } = await supabase
          .from("school_settings")
          .select("*")
          .limit(1)
          .single();

        if (!error && data) {
          setSchoolName(data.school_name || data.name || "");
          return;
        }
      }
    } catch (e) {
      console.error("[Supabase] Failed loading school:", e);
    }

    try {
      const localSchool = await window.sqlite.loadSchool();

      if (localSchool) {
        setSchoolName(localSchool.school_name || localSchool.name || "");
      }
    } catch (e) {
      console.error("[SQLite] Failed loading school:", e);
    }
  }
  const [zoom, setZoom] = useState(55);
  useEffect(() => {
    document.body.classList.add("print-preview-active");

    return () => {
      document.body.classList.remove("print-preview-active");
    };
  }, []);
  const sectionGroups = displayRows.reduce((acc, student) => {
    const sectionName = student.section || "No Section";

    if (!acc[sectionName]) {
      acc[sectionName] = [];
    }

    acc[sectionName].push(student);

    return acc;
  }, {});

  return (
    <div className="report-preview-overlay">
      <div className="report-preview-modal">
        <div className="report-preview-header no-print">
          <h2>Print Preview</h2>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <button
              className="btn btn-secondary"
              onClick={() => setZoom((z) => Math.max(30, z - 10))}
            >
              ➖
            </button>

            <span
              style={{
                minWidth: "60px",
                textAlign: "center",
              }}
            >
              {zoom}%
            </span>

            <button
              className="btn btn-secondary"
              onClick={() => setZoom((z) => Math.min(150, z + 10))}
            >
              ➕
            </button>

            <button className="btn btn-primary" onClick={handlePrint}>
              🖨 Print
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => setPreviewOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="report-preview-content">
          {Object.entries(sectionGroups).map(([sectionName, learners]) => (
            <div
              className="report-page"
              style={{
                transform: `scale(${zoom / 100})`,
              }}
            >
              <div className="report-heading">
                <h1>Department of Education</h1>

                {schoolName && <h2>{schoolName}</h2>}

                <h3>Nutritional Status Report</h3>

                <p>
                  <strong>School Year:</strong> {sy}
                </p>

                <p>
                  <strong>Period:</strong> {period}
                </p>

                <p>
                  <strong>Section:</strong> {sectionName}
                </p>

                <p>
                  <strong>Total Learners:</strong> {learners.length}
                </p>
              </div>

              <table className="print-table">
                <thead>
                  <tr>
                    <th>LRN</th>
                    <th>NAME</th>
                    <th>AGE</th>
                    <th>SEX</th>
                    <th>WEIGHT</th>
                    <th>HEIGHT</th>
                    <th>BMI</th>
                    <th>STATUS</th>
                  </tr>
                </thead>

                <tbody>
                  {learners.map((s) => (
                    <tr key={s.id}>
                      <td>{s.lrn}</td>
                      <td>{s.name}</td>
                      <td>{s.age}</td>
                      <td>{s.sex}</td>
                      <td>{s.lastRec?.weight ?? "—"}</td>
                      <td>{s.lastRec?.height ?? "—"}</td>
                      <td>{s.bmi ? s.bmi.toFixed(2) : "—"}</td>
                      <td>{s.status?.label ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

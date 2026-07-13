import React, { useState, useEffect } from "react";
import { BMI_CLASSIFICATIONS, HAZ_CLASSIFICATIONS } from "../utils/bmi";
import UserManagement from "./UserManagement";
import {
  saveSupabaseConfig,
  loadSupabaseConfig,
  testSupabaseConnection,
  queueAllStudentsForSync,
  saveSchoolInfo,
  saveSchoolLogoToSupabase,
} from "../utils/syncService";
import "./Settings.css";
import { SCHOOL_OPTIONS } from "../utils/schools";

// Generate short filename from school name, e.g.
// "Isabela East Central Elementary School" -> "ieces.png"
function generateLogoFilename(schoolName) {
  if (!schoolName) return "";
  const acronym = schoolName
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toLowerCase();
  return `${acronym}.png`;
}

export default function Settings({
  schoolName,
  setSchoolName,
  students,
  currentUser,
}) {
  const [school, setSchool] = useState({
    name: "",
    id: "",
    division: "",
    district: "",
    address: "",
  });

  const [schoolSaved, setSchoolSaved] = useState(false);
  const [schoolLoaded, setSchoolLoaded] = useState(false);

  // ── Logo state (fully separate from `school`) ──────────────────────────
  const [logoFile, setLogoFile] = useState(null); // raw File object selected by user
  const [logoPreview, setLogoPreview] = useState(null); // data URL for <img> preview
  const [logoSaved, setLogoSaved] = useState(false);
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoError, setLogoError] = useState(null);

  const logoFilename = generateLogoFilename(school.name);

  useEffect(() => {
    async function loadSchoolDb() {
      try {
        const schoolData = await window.sqlite.loadSchool();

        if (schoolData) {
          setSchool({
            name: schoolData.school_name || "",
            id: schoolData.school_id || "",
            division: schoolData.division || "",
            district: schoolData.district || "",
            address: schoolData.address || "",
          });

          setSchoolLoaded(true);
        }
      } catch (e) {
        console.error("[SQLite] Failed to load school:", e);
      }
    }

    loadSchoolDb();
  }, []);

  // ── Load existing logo once we know the school ID ──────────────────────
  useEffect(() => {
    async function loadLogo() {
      if (!school.id) return;
      try {
        const existing = await window.sqlite.loadSchoolLogo(school.id);
        // Expecting existing to be a data URL string, or null if none saved
        if (existing) {
          setLogoPreview(existing);
        }
      } catch (e) {
        console.error("[SQLite] Failed to load school logo:", e);
      }
    }

    loadLogo();
  }, [school.id]);

  // Supabase config state
  const [supabase, setSupabase] = useState(
    () => loadSupabaseConfig() || { url: "", key: "" },
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [supaSaved, setSupaSaved] = useState(false);
  const [registryReset, setRegistryReset] = useState(false);

  async function handleSaveSchool() {
    if (!school.id.trim()) {
      alert("School ID is required.");
      return;
    }

    if (!school.name.trim()) {
      alert("School Name is required.");
      return;
    }

    try {
      // Save locally first
      await window.sqlite.saveSchool(school);

      // Sync to Supabase if online
      if (navigator.onLine) {
        await saveSchoolInfo(school);
      }

      setSchoolName(school.name);

      setSchoolSaved(true);

      setTimeout(() => {
        setSchoolSaved(false);
      }, 2500);
    } catch (e) {
      console.error(e);

      alert("School saved locally but failed to sync to Supabase.");
    }
  }

  // ── Logo handlers ────────────────────────────────────────────────────
  function handleLogoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Logo must be under 2MB.");
      return;
    }

    setLogoError(null);
    setLogoFile(file);

    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSaveLogo() {
    if (!school.id.trim()) {
      alert("Please set and save the School ID first before uploading a logo.");
      return;
    }
    if (!logoPreview) {
      alert("Please choose a logo image first.");
      return;
    }

    setLogoSaving(true);
    setLogoError(null);

    try {
      // Save locally, keyed by school id + generated filename,
      // completely separate from the `school` info save.
      await window.sqlite.saveSchoolLogo({
        schoolId: school.id,
        filename: logoFilename,
        dataUrl: logoPreview,
      });

      // Sync to Supabase storage if online
      if (navigator.onLine) {
        await saveSchoolLogoToSupabase({
          schoolId: school.id,
          filename: logoFilename,
          dataUrl: logoPreview,
        });
      }

      setLogoSaved(true);
      setTimeout(() => setLogoSaved(false), 2500);
    } catch (e) {
      console.error(e);
      setLogoError("Logo saved locally but failed to sync to Supabase.");
    } finally {
      setLogoSaving(false);
    }
  }

  async function handleRemoveLogo() {
    if (!school.id.trim()) return;
    const confirmed = window.confirm("Remove this school's logo?");
    if (!confirmed) return;

    try {
      await window.sqlite.deleteSchoolLogo(school.id);
      setLogoFile(null);
      setLogoPreview(null);
    } catch (e) {
      console.error("[SQLite] Failed to remove logo:", e);
    }
  }

  async function handleTestAndSaveSupabase() {
    if (!supabase.url || !supabase.key) return;
    setTesting(true);
    setTestResult(null);
    const ok = await testSupabaseConnection(supabase.url, supabase.key);
    setTesting(false);
    if (ok) {
      saveSupabaseConfig(supabase.url, supabase.key);
      // Queue all local students for first-time upload
      queueAllStudentsForSync(students);
      setTestResult({
        ok: true,
        msg: "✓ Connected! All local data queued for upload.",
      });
      setSupaSaved(true);
      setTimeout(() => setSupaSaved(false), 3000);
    } else {
      setTestResult({
        ok: false,
        msg: "✗ Could not connect. Check your URL and API key.",
      });
    }
  }

  function handleClearSupabase() {
    localStorage.removeItem("deped_bmi_supabase");
    setSupabase({ url: "", key: "" });
    setTestResult(null);
    setSupaSaved(false);
  }

  function handleResetRegistryCounter() {
    const confirmed = window.confirm(
      "WARNING!\n\nThis will reset the registry counter back to 0001.\n\nContinue?",
    );

    if (!confirmed) return;

    const counters = JSON.parse(
      localStorage.getItem("deped_bmi_registry_counters") || "{}",
    );

    counters["2026-ieces-G4"] = 0;

    localStorage.setItem(
      "deped_bmi_registry_counters",
      JSON.stringify(counters),
    );

    setRegistryReset(true);

    setTimeout(() => {
      setRegistryReset(false);
    }, 3000);

    console.log(
      JSON.parse(localStorage.getItem("deped_bmi_registry_counters")),
    );

    alert("Registry counter reset");
  }

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">School information and system configuration</p>

      <div className="settings-grid">
        {/* ── School Info ── */}
        <div className="card">
          <h3 className="card-title">School Information</h3>

          {/* School Name Dropdown */}
          <div className="settings-field">
            <label className="form-label">School Name</label>

            <select
              className={`form-input ${
                schoolLoaded ? "school-configured" : ""
              }`}
              value={school.name}
              onChange={(e) =>
                setSchool((s) => ({
                  ...s,
                  name: e.target.value,
                }))
              }
            >
              <option value="">Select School</option>

              {SCHOOL_OPTIONS.filter(
                (schoolName) => schoolName !== "ALL SCHOOLS",
              ).map((schoolName) => (
                <option key={schoolName} value={schoolName}>
                  {schoolName}
                </option>
              ))}
            </select>
          </div>

          {[
            { key: "id", label: "School ID", placeholder: "e.g. 100123" },
            {
              key: "division",
              label: "Division",
              placeholder: "e.g. Division of Isabela City",
            },
            {
              key: "district",
              label: "District",
              placeholder: "e.g. East District I",
            },
            {
              key: "address",
              label: "Address",
              placeholder: "Complete school address",
            },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="settings-field">
              <label className="form-label">{label}</label>
              <input
                className={`form-input ${
                  schoolLoaded ? "school-configured" : ""
                }`}
                placeholder={placeholder}
                value={school[key]}
                onChange={(e) =>
                  setSchool((s) => ({ ...s, [key]: e.target.value }))
                }
              />
            </div>
          ))}
          <div className="settings-save-row">
            <button className="btn btn-primary" onClick={handleSaveSchool}>
              Save Settings
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                await window.sqlite.clearSchool();

                setSchool({
                  name: "",
                  id: "",
                  division: "",
                  district: "",
                  address: "",
                });

                setSchoolName("");
                setSchoolLoaded(false);
              }}
            >
              Clear School Settings
            </button>
            {schoolSaved && (
              <span className="save-confirm">✓ Settings saved!</span>
            )}
          </div>

          {/* Preview */}
          {(school.name || school.division || school.address) && (
            <div className="school-preview">
              <div className="school-preview-title">Sidebar Preview</div>
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="School logo"
                  style={{
                    width: 40,
                    height: 40,
                    objectFit: "cover",
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                />
              )}
              {school.name && (
                <div className="school-preview-name">{school.name}</div>
              )}
              {school.id && (
                <div className="school-preview-row">School ID: {school.id}</div>
              )}
              {school.division && (
                <div className="school-preview-row">{school.division}</div>
              )}
              {school.district && (
                <div className="school-preview-row">{school.district}</div>
              )}
              {school.address && (
                <div className="school-preview-row">{school.address}</div>
              )}
            </div>
          )}
        </div>

        {/* ── School Logo (separate card, separate save flow) ── */}
        <div className="card">
          <h3 className="card-title">School Logo</h3>
          <p className="settings-ref-sub">
            Upload a logo for this school. It's saved independently from the
            school information above, so it won't affect or overwrite your
            existing school data.
          </p>

          {!school.name ? (
            <div
              style={{
                padding: "12px",
                background: "#fff8e1",
                borderRadius: "8px",
              }}
            >
              Select a School Name above first — the logo filename is
              generated from it.
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    background: "#f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 28 }}>🏫</span>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {school.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Will be saved as: <code>{logoFilename}</code>
                  </div>
                </div>
              </div>

              <div className="settings-field">
                <label className="form-label">Choose Logo Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoSelect}
                  className="form-input"
                />
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  PNG or JPG, under 2MB.
                </div>
              </div>

              {logoError && (
                <div style={{ color: "#dc2626", marginBottom: 12 }}>
                  {logoError}
                </div>
              )}

              <div className="settings-save-row">
                <button
                  className="btn btn-primary"
                  onClick={handleSaveLogo}
                  disabled={logoSaving || !logoPreview}
                >
                  {logoSaving ? "Saving..." : "Save Logo"}
                </button>
                {logoPreview && (
                  <button className="btn btn-danger" onClick={handleRemoveLogo}>
                    Remove Logo
                  </button>
                )}
                {logoSaved && (
                  <span className="save-confirm">✓ Logo saved!</span>
                )}
              </div>
            </>
          )}
        </div>

        <div>
          {/* ── BMI Reference ── */}
          <div className="card">
            <h3 className="card-title">BMI Classification Reference</h3>
            <p className="settings-ref-sub">
              Official WHO BMI-for-Age reference used by DepEd (age &amp;
              sex-specific, 6–19 years).
            </p>
            <div className="bmi-ref-list">
              {[
                { label: "Severely Wasted", range: "Below 16.0" },
                { label: "Wasted", range: "16.0 – 18.4" },
                { label: "Normal", range: "18.5 – 24.9" },
                { label: "Overweight", range: "25.0 – 29.9" },
                { label: "Obese", range: "30.0 and above" },
              ].map((item) => {
                const cls = BMI_CLASSIFICATIONS.find(
                  (c) => c.label === item.label,
                );
                return (
                  <div
                    key={item.label}
                    className="bmi-ref-row"
                    style={{ background: cls?.bg }}
                  >
                    <span
                      className="bmi-ref-status"
                      style={{ color: cls?.color }}
                    >
                      {item.label}
                    </span>
                    <span
                      className="bmi-ref-range"
                      style={{ color: cls?.color }}
                    >
                      {item.range}
                    </span>
                  </div>
                );
              })}
            </div>

            <h3 className="card-title" style={{ marginTop: "1.5rem" }}>
              Height-for-Age (HAZ) Reference
            </h3>
            <p className="settings-ref-sub">
              Stunting classification by height vs age (3–19 years).
            </p>
            <div className="bmi-ref-list" style={{ marginBottom: "1rem" }}>
              {[
                { label: "Severely Stunted", range: "Below -3 SD" },
                { label: "Stunted", range: "-3 SD to -2 SD" },
                { label: "Normal", range: "-2 SD to +2 SD" },
                { label: "Tall", range: "Above +2 SD" },
              ].map((item) => {
                const cls = HAZ_CLASSIFICATIONS.find(
                  (c) => c.label === item.label,
                );
                return (
                  <div
                    key={item.label}
                    className="bmi-ref-row"
                    style={{ background: cls?.bg }}
                  >
                    <span
                      className="bmi-ref-status"
                      style={{ color: cls?.color }}
                    >
                      {item.label}
                    </span>
                    <span
                      className="bmi-ref-range"
                      style={{ color: cls?.color }}
                    >
                      {item.range}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="card">
              <h3 className="card-title">Registry Management</h3>

              <p className="settings-ref-sub">
                Reset the registry numbering sequence.
              </p>

              <div
                style={{
                  padding: "12px",
                  background: "#fff8e1",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              >
                ⚠ Only use this after all student records have been removed from
                Supabase and local storage.
              </div>

              <button
                className="btn btn-danger"
                onClick={handleResetRegistryCounter}
              >
                Reset Registry Counter
              </button>

              {registryReset && (
                <div
                  style={{
                    marginTop: "12px",
                    color: "green",
                  }}
                >
                  ✓ Registry counter reset.
                </div>
              )}
            </div>
            <h3 className="card-title" style={{ marginTop: "1.5rem" }}>
              About This App
            </h3>
            <div className="about-info">
              <div className="about-row">
                <span>App Name</span>
                <span>Nutritional Status System</span>
              </div>
              <div className="about-row">
                <span>Version</span>
                <span>1.0.0</span>
              </div>
              <div className="about-row">
                <span>Standard</span>
                <span>WHO / DepEd</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

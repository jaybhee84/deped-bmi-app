import React, { useState, useEffect } from "react";
import { BMI_CLASSIFICATIONS, HAZ_CLASSIFICATIONS } from "../utils/bmi";
import UserManagement from "./UserManagement";
import {
  saveSupabaseConfig,
  loadSupabaseConfig,
  testSupabaseConnection,
  queueAllStudentsForSync,
  saveSchoolInfo,
  bindSchoolToUser,
  fetchSchoolForUser,
  getSchoolByName, // ADD THIS
} from "../utils/syncService";
import "./Settings.css";
import { SCHOOL_OPTIONS } from "../utils/schools";
import { getSchoolLogoUrl } from "../utils/schoolLogoMap";

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
  const [schoolExists, setSchoolExists] = useState(false);
  const [schoolLogo, setSchoolLogo] = useState(null);
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    async function getVersion() {
      const version = await window.electronAPI.getAppVersion();

      setAppVersion(version);
    }

    getVersion();
  }, []);

  useEffect(() => {
    async function loadSchoolDb() {
      try {
        // 1. Try local SQLite first (fast, works offline)
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
          const logoUrl = getSchoolLogoUrl(schoolData.school_name);

          setSchoolLogo(logoUrl);
          const localLogo = await window.sqlite.loadSchoolLogo(
            schoolData.school_id,
          );

          if (localLogo) {
            setSchoolLogo(localLogo);
          }
          return;
        }

        // 2. Nothing local yet (e.g. fresh device) — check if this user
        // is already bound to a school in Supabase and pre-fill from there.
        if (currentUser?.id && navigator.onLine) {
          const boundSchool = await fetchSchoolForUser(currentUser.id);

          if (boundSchool) {
            setSchool({
              name: boundSchool.name || "",
              id: boundSchool.id || "",
              division: boundSchool.division || "",
              district: boundSchool.district || "",
              address: boundSchool.address || "",
            });

            setSchoolExists(true);

            const logoUrl = getSchoolLogoUrl(boundSchool.name);
            setSchoolLogo(logoUrl);

            await window.sqlite.saveSchool({
              school_name: boundSchool.name,
              school_id: boundSchool.id,
              division: boundSchool.division,
              district: boundSchool.district,
              address: boundSchool.address,
            });

            setSchoolName(boundSchool.name);
            setSchoolLoaded(true);
          }
        }
      } catch (e) {
        console.error("[SQLite] Failed to load school:", e);
      }
    }

    loadSchoolDb();
  }, [currentUser]);

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
        // Only create/update the school if it doesn't already exist
        if (!schoolExists) {
          await saveSchoolInfo(school);
        }

        // Always bind the user to the school
        if (currentUser?.id) {
          try {
            await bindSchoolToUser(school.id, currentUser.id);
          } catch (bindErr) {
            console.error("Failed binding school to user:", bindErr);

            alert(
              "School saved, but could not bind it to your account. You may need to set it up again next time.",
            );
          }
        }
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

  async function handleSchoolChange(schoolName) {
    if (!schoolName) {
      setSchool({
        name: "",
        id: "",
        division: "",
        district: "",
        address: "",
      });

      setSchoolExists(false);
      return;
    }

    try {
      const existingSchool = await getSchoolByName(schoolName);

      if (existingSchool) {
        setSchool({
          name: existingSchool.school_name,
          id: existingSchool.school_id,
          division: existingSchool.division || "",
          district: existingSchool.district || "",
          address: existingSchool.address || "",
        });

        setSchoolExists(true);
      } else {
        setSchool({
          name: schoolName,
          id: "",
          division: "",
          district: "",
          address: "",
        });

        setSchoolExists(false);
      }
    } catch (err) {
      console.error(err);
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
            <label className="form-label">
              School Name
              {schoolLoaded && (
                <span
                  style={{
                    fontWeight: "normal",
                    color: "#888",
                    marginLeft: "8px",
                  }}
                >
                  (bound to your account — clear settings to change)
                </span>
              )}
            </label>

            <select
              className={`form-input ${
                schoolLoaded ? "school-configured" : ""
              }`}
              value={school.name}
              disabled={schoolLoaded}
              onChange={(e) => handleSchoolChange(e.target.value)}
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
                disabled={
                  schoolExists &&
                  ["id", "division", "district", "address"].includes(key)
                }
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
              {schoolLogo && (
                <div
                  style={{
                    textAlign: "center",
                    marginBottom: "16px",
                  }}
                >
                  <img
                    src={schoolLogo}
                    alt="School Logo"
                    style={{
                      width: "100px",
                      height: "100px",
                      objectFit: "contain",
                    }}
                  />
                </div>
              )}
              <div className="school-preview-title">All Rights Reserved</div>

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
                <span>{appVersion}</span>
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

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
  unbindSchoolFromUser,
  fetchSchoolForUser,
  getSchoolByName,
} from "../utils/syncService";
import "./Settings.css";
import { SCHOOL_OPTIONS } from "../utils/schools";
import { getSchoolLogoUrl } from "../utils/schoolLogoMap";

// Pre-defined list of Districts
const DISTRICT_OPTIONS = [
  "East District I",
  "East District II",
  "West District I",
  "West District II",
  "West District III",
  "North DIstrict I",
  "North District II",
  "North District III",
  "Island District I",
  "Island District II",
  "Island District III",
];

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

  // Process school options: filter out "ALL SCHOOLS" and high schools, then sort alphabetically
  const processedSchools = SCHOOL_OPTIONS.filter((name) => {
    if (name === "ALL SCHOOLS") return false;
    // Remove any high school variants (e.g., High School, NHS, BHS, HS)
    const lowerName = name.toLowerCase();
    return (
      !lowerName.includes("high school") &&
      !lowerName.includes("nhs") &&
      !lowerName.endsWith(" hs")
    );
  }).sort((a, b) => a.localeCompare(b));

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

        // 2. Nothing local yet — check if this user is already bound in Supabase
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
        if (!schoolExists) {
          await saveSchoolInfo(school);
        }

        if (currentUser?.id) {
          try {
            const success = await bindSchoolToUser(school.id, currentUser.id);

            window.dispatchEvent(
              new CustomEvent("school-bound", {
                detail: {
                  schoolId: school.id,
                  schoolName: school.name,
                },
              }),
            );
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
                ></span>
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
              {processedSchools.map((schoolName) => (
                <option key={schoolName} value={schoolName}>
                  {schoolName}
                </option>
              ))}
            </select>
          </div>

          {/* School ID Field */}
          <div className="settings-field">
            <label className="form-label">School ID</label>
            <input
              className={`form-input ${schoolLoaded ? "school-configured" : ""}`}
              placeholder="e.g. 100123"
              value={school.id}
              disabled={schoolExists}
              onChange={(e) => setSchool((s) => ({ ...s, id: e.target.value }))}
            />
          </div>

          {/* Division Field */}
          <div className="settings-field">
            <label className="form-label">Division</label>
            <input
              className={`form-input ${schoolLoaded ? "school-configured" : ""}`}
              placeholder="e.g. Division of Isabela City"
              value={school.division}
              disabled={schoolExists}
              onChange={(e) =>
                setSchool((s) => ({ ...s, division: e.target.value }))
              }
            />
          </div>

          {/* District Select Dropdown */}
          <div className="settings-field">
            <label className="form-label">District</label>
            <select
              className={`form-input ${schoolLoaded ? "school-configured" : ""}`}
              value={school.district}
              disabled={schoolExists}
              onChange={(e) =>
                setSchool((s) => ({ ...s, district: e.target.value }))
              }
            >
              <option value="">Select District</option>
              {DISTRICT_OPTIONS.map((dist) => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>
          </div>

          {/* Address Field */}
          <div className="settings-field">
            <label className="form-label">Address</label>
            <input
              className={`form-input ${schoolLoaded ? "school-configured" : ""}`}
              placeholder="Complete school address"
              value={school.address}
              disabled={schoolExists}
              onChange={(e) =>
                setSchool((s) => ({ ...s, address: e.target.value }))
              }
            />
          </div>

          <div className="settings-save-row">
            <button className="btn btn-primary" onClick={handleSaveSchool}>
              Save Settings
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                try {
                  if (currentUser?.id && navigator.onLine) {
                    await unbindSchoolFromUser(currentUser.id);
                  }

                  await window.sqlite.clearSchool();
                  await window.sqlite.saveStudents([]);

                  setSchool({
                    name: "",
                    id: "",
                    division: "",
                    district: "",
                    address: "",
                  });

                  setSchoolName("");
                  setSchoolLoaded(false);
                  setSchoolExists(false);
                  setSchoolLogo(null);

                  window.dispatchEvent(
                    new CustomEvent("school-bound", {
                      detail: {
                        schoolId: null,
                        schoolName: "",
                      },
                    }),
                  );
                } catch (err) {
                  console.error(err);
                  alert("Failed to clear school settings.");
                }
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
                <div style={{ textAlign: "center", marginBottom: "16px" }}>
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
                <div style={{ marginTop: "12px", color: "green" }}>
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

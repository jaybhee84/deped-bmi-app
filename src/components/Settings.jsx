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
import { RELEASE_NOTES } from "../data/releaseNotes";

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
  const latestRelease = RELEASE_NOTES[appVersion];
  useEffect(() => {
    async function getVersion() {
      const version = await window.electronAPI.getAppVersion();

      setAppVersion(version);
    }

    getVersion();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSchoolDb() {
      if (!currentUser?.id) return;

      try {
        // 1. Try local SQLite first (fast, works offline) — but only trust
        // it if it was bound by THIS user. A different (or brand-new)
        // account on the same device gets nothing here, not the previous
        // user's school.
        const schoolData = await window.sqlite.loadSchool(currentUser.id);

        if (cancelled) return;

        if (schoolData) {
          setSchool({
            name: schoolData.school_name || "",
            id: schoolData.school_id || "",
            division: schoolData.division || "",
            district: schoolData.district || "",
            address: schoolData.address || "",
          });

          // Mark the form as "loaded" immediately — don't make Save/logout
          // wait on the logo lookup below.
          setSchoolLoaded(true);

          const logoUrl = getSchoolLogoUrl(schoolData.school_name);
          setSchoolLogo(logoUrl);

          // Background: prefer a locally-cached custom logo if present.
          // Fire-and-forget so it can't block or race Save/logout.
          window.sqlite
            .loadSchoolLogo(schoolData.school_id)
            .then((localLogo) => {
              if (!cancelled && localLogo) setSchoolLogo(localLogo);
            })
            .catch((e) =>
              console.error("[SQLite] Failed to load school logo:", e),
            );

          return;
        }

        // 2. Nothing local for THIS user — check if they're already bound
        // to a school in Supabase (e.g. new device, or new account bound
        // to an existing school) and pre-fill from there.
        if (navigator.onLine) {
          const boundSchool = await fetchSchoolForUser(currentUser.id);

          if (cancelled || !boundSchool) return;

          setSchool({
            name: boundSchool.name || "",
            id: boundSchool.id || "",
            division: boundSchool.division || "",
            district: boundSchool.district || "",
            address: boundSchool.address || "",
          });

          setSchoolExists(true);
          setSchoolName(boundSchool.name);

          // Mark the form ready right away — the logo and the local-cache
          // write below happen in the background and must never block
          // Save or logout.
          setSchoolLoaded(true);

          const logoUrl = getSchoolLogoUrl(boundSchool.name);
          setSchoolLogo(logoUrl);

          window.sqlite
            .saveSchool(
              {
                name: boundSchool.name,
                id: boundSchool.id,
                division: boundSchool.division,
                district: boundSchool.district,
                address: boundSchool.address,
              },
              currentUser.id,
            )
            .catch((e) =>
              console.error("[SQLite] Failed to cache school locally:", e),
            );
        }
      } catch (e) {
        console.error("[SQLite] Failed to load school:", e);
      }
    }

    loadSchoolDb();

    return () => {
      cancelled = true;
    };
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
      // Save locally first, scoped to the current account
      await window.sqlite.saveSchool(school, currentUser?.id);

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
                const confirmed = window.confirm(
                  "This will unlink this account from its school. " +
                  "Local data on this device will be cleared either way.\n\n" +
                  "Continue?"
                );

                if (!confirmed) return;

                let serverUnbindFailed = false;

                try {
                  // Always attempt this — not just when navigator.onLine
                  // looked true — since that flag can be stale/wrong, and
                  // skipping it silently left the account bound in
                  // Supabase while the device looked cleared.
                  if (currentUser?.id) {
                    await unbindSchoolFromUser(currentUser.id);
                  }
                } catch (err) {
                  console.error("Failed to unbind school on server:", err);
                  serverUnbindFailed = true;
                }

                try {
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

                  if (serverUnbindFailed) {
                    alert(
                      "This device has been cleared, but the account is " +
                      "still bound to the school on the server (likely " +
                      "no internet connection). Try again while online " +
                      "to fully unlink this account."
                    );
                  }
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
                      width: "180px",
                      height: "180px",
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
            {latestRelease && (
              <>
                <h3 className="card-title" style={{ marginTop: "1.5rem" }}>
                  📋 Release Notes
                </h3>

                <div
                  style={{
                    background: "#F8FAFC",
                    border: "1px solid #E5E7EB",
                    borderRadius: 10,
                    padding: 16,
                    maxHeight: 260,
                    overflowY: "auto",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#1E3A5F",
                      marginBottom: 10,
                      fontSize: "15px",
                    }}
                  >
                    {latestRelease.title}
                  </div>

                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 20,
                      color: "#374151",
                      lineHeight: 1.7,
                    }}
                  >
                    {latestRelease.notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

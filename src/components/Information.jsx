import { secureStorage } from '../utils/secureStorage';
import React, { useState, useEffect, useMemo } from "react";
import { BMI_CLASSIFICATIONS, HAZ_CLASSIFICATIONS } from "../utils/bmi";
import {
  fetchSchoolById,
  fetchSchoolForUser,
} from "../utils/syncService";
import { RELEASE_NOTES } from "../data/releaseNotes";
import "./Information.css";
import { getSchoolLogoUrl } from "../utils/schoolLogoMap";
import buzzjayLogo from "../images/buzzj1.png";
import { supabase } from "../utils/supabaseClient";
import { countPortalEnrolments, normalizeSchoolYear } from "../utils/enrolmentTotals";
import {
  DEFAULT_SBFP_CONFIG,
  loadSbfpConfig,
} from "../utils/sbfpConfig";

function loadCachedSbfpConfig() {
  try {
    const cached = secureStorage.getItem("sbfp_cached_config");
    return cached ? JSON.parse(cached) : DEFAULT_SBFP_CONFIG;
  } catch {
    return DEFAULT_SBFP_CONFIG;
  }
}

function criterionGradeScope(config, criterion) {
  const restriction = config.criterionGradeRestrictions?.[criterion];
  if (restriction === undefined) return "All grade levels";
  if (restriction.length === 0) return "No grade levels selected";
  return restriction;
}

export default function Information({
  schoolName,
  setSchoolName,
  currentUser,
  schoolYear,
  students = [], // Connected student data footprint mapped from workspace payload structure
}) {
  const [school, setSchool] = useState({
    name: "",
    id: "",
    division: "",
    district: "",
    address: "",
  });

  const [schoolLoaded, setSchoolLoaded] = useState(false);
  const [schoolLogo, setSchoolLogo] = useState(null);
  const [appVersion, setAppVersion] = useState("");
  const [sbfpConfig, setSbfpConfig] = useState(loadCachedSbfpConfig);

  // Pull the real release notes for whatever version is actually running,
  // instead of hardcoded mock content.
  const versionNotes = RELEASE_NOTES[appVersion] || null;
  const releaseNotes = versionNotes?.silent
    ? RELEASE_NOTES["2.0.0"]
    : versionNotes;

  const [cloudEnrolment, setCloudEnrolment] = useState(null);
  const [enrolmentError, setEnrolmentError] = useState(false);
  const localEnrolment = useMemo(() => countPortalEnrolments(
    students, schoolYear, currentUser?.school_id || "",
  ), [students, currentUser?.school_id, schoolYear]);
  const totalLearnersEnrolled = cloudEnrolment ?? localEnrolment;

  useEffect(() => {
    let cancelled = false;
    setCloudEnrolment(null);
    setEnrolmentError(false);
    if (!navigator.onLine || !currentUser?.school_id || !schoolYear) return;
    supabase.from("students").select("id", { count: "exact", head: true })
      .eq("school_id", String(currentUser.school_id))
      .eq("school_year", normalizeSchoolYear(schoolYear))
      .then(({ count, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("[Information] Unable to refresh enrolment:", error.message);
          setEnrolmentError(true);
        } else setCloudEnrolment(count);
      });
    return () => { cancelled = true; };
  }, [currentUser?.school_id, schoolYear, students]);

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setAppVersion);
    }
  }, []);

  useEffect(() => {
    if (!navigator.onLine) return;

    loadSbfpConfig().then((config) => {
      if (!config) return;
      setSbfpConfig(config);
      try {
        secureStorage.setItem("sbfp_cached_config", JSON.stringify(config));
      } catch (error) {
        console.warn("Unable to cache the SBFP configuration.", error);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sessionSchoolId = String(currentUser?.school_id || "");
    const present = (value) => value && String(value).trim().toUpperCase() !== "N/A" ? value : "";
    const matches = (row) => row && (!sessionSchoolId ||
      String(row.school_id || row.id || "") === sessionSchoolId);

    async function loadSchoolDb() {
      let cached = null;
      try {
        const local = await window.sqlite?.loadSchool?.(currentUser?.id);
        if (matches(local)) cached = local;
        const directory = await window.sqlite?.getSchoolById?.(sessionSchoolId || cached?.school_id);
        if (matches(directory)) {
          cached = {
            ...directory, ...cached,
            district: present(cached?.district) || present(directory.district),
            address: present(cached?.address) || present(directory.address),
          };
        }
      } catch (error) {
        console.warn("[Information] Unable to load cached school:", error.message);
      }

      const show = (row) => {
        if (cancelled) return;
        const name = row?.name || row?.school_name || currentUser?.school_name || schoolName || "";
        setSchool({
          name,
          id: row?.school_id || row?.id || sessionSchoolId,
          division: present(row?.division) || "Division of Isabela City",
          district: present(row?.district),
          address: present(row?.address),
        });
        setSchoolLogo(row?.logo_url || getSchoolLogoUrl(name));
        setSchoolLoaded(true);
      };
      show(cached);
      try {
        const logo = await window.sqlite?.loadSchoolLogo?.(sessionSchoolId || cached?.school_id);
        if (logo && !cancelled) setSchoolLogo(logo);
      } catch (error) {
        console.warn("[Information] Unable to load cached logo:", error.message);
      }
      if (!navigator.onLine) return;
      try {
        // Audit mode must refresh the viewed school, not the admin's bound school.
        const remote = sessionSchoolId
          ? await fetchSchoolById(sessionSchoolId)
          : await fetchSchoolForUser(currentUser?.id);
        if (!matches(remote) || cancelled) return;
        const merged = {
          ...cached, ...remote,
          district: present(remote.district) || present(cached?.district),
          address: present(remote.address) || present(cached?.address),
        };
        show(merged);
        if (remote.name) setSchoolName(remote.name);
        if (window.sqlite?.saveSchool && !currentUser?.auditMode) {
          await window.sqlite.saveSchool({
            school_name: merged.name,
            school_id: merged.school_id || merged.id,
            division: merged.division || "Division of Isabela City",
            district: merged.district,
            address: merged.address,
          }, currentUser.id);
        }
      } catch (error) {
        console.warn("[Information] Unable to refresh school:", error.message);
      }
    }
    loadSchoolDb();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.school_id, currentUser?.school_name, currentUser?.auditMode, setSchoolName, schoolName]);

  return (
    <div className="page">
      <h1 className="page-title">School Information</h1>
      <p className="page-sub">
        Active system telemetry profile and reference records
      </p>

      <div className="settings-grid school-information-grid">
        {/* ── CARD 1: School Profile Workspace ── */}
        <div className="information-card-column">
          <div className="card">
            <h3 className="card-title">School Profile</h3>

            <div
              className="school-preview"
              style={{ marginTop: 0, borderTop: "none", paddingTop: 0 }}
            >
            {schoolLogo && (
              <div
                style={{
                  textAlign: "center",
                  marginBottom: "20px",
                  paddingTop: "10px",
                }}
              >
                <img
                  src={schoolLogo}
                  alt="School Logo"
                  style={{
                    width: "160px",
                    height: "160px",
                    objectFit: "contain",
                    filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.08))",
                  }}
                />
              </div>
            )}

            {school.name ? (
              <>
                <div
                  className="school-preview-name"
                  style={{
                    color: "#1e293b",
                    textAlign: "center",
                    marginBottom: "16px",
                  }}
                >
                  {school.name}
                </div>
                <div className="school-preview-row">
                  <strong>School ID:</strong> {school.id || "N/A"}
                </div>
                <div className="school-preview-row">
                  <strong>Division:</strong> Division of Isabela City
                </div>
                <div className="school-preview-row">
                  <strong>District:</strong> {school.district || "N/A"}
                </div>
                <div className="school-preview-row">
                  <strong>Complete Address:</strong> {school.address || "N/A"}
                </div>

                <div
                  style={{
                    marginTop: "14px",
                    paddingTop: "12px",
                    borderTop: "1px dashed #cbd5e1",
                  }}
                >
                  <div
                    className="school-preview-row"
                    style={{ fontSize: "13px", color: "#0f172a" }}
                  >
                    <strong>Learners Enrolled ({schoolYear}):</strong>{" "}
                    <span style={{ color: "#2563eb", fontWeight: "700" }}>
                      {totalLearnersEnrolled}
                    </span>
                  </div>
                  {cloudEnrolment === null && (
                    <p style={{ fontSize: "12px", marginBottom: 0 }} role="status">
                      {enrolmentError ? "Cloud count unavailable. Showing locally loaded records for this school year." : "Showing locally loaded records until the cloud count is available."}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div
                style={{
                  padding: "20px 0",
                  color: "#64748b",
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                No active school workspace bound to this account footprint.
              </div>
            )}
            </div>
          </div>

          <div className="card sbfp-grades-card">
            <h3 className="card-title">Official SBFP Beneficiary Criteria</h3>
            <p className="settings-ref-sub">
              Current grade-level and nutritional-status selections from SDO
              Settings.
            </p>

            <div className="sbfp-information-group">
              <div className="sbfp-information-label">
                Automatically Included Grade Levels
              </div>
              {sbfpConfig.grades?.length > 0 ? (
                <div className="sbfp-grade-tags">
                  {sbfpConfig.grades.map((grade) => (
                    <span className="sbfp-grade-tag" key={grade}>
                      {grade}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="sbfp-grades-empty">
                  No grade levels selected for automatic inclusion.
                </div>
              )}
            </div>

            <div className="sbfp-information-group">
              <div className="sbfp-information-label">
                Nutritional Status Criteria
              </div>
              {sbfpConfig.criteria?.length > 0 ? (
                <div className="sbfp-criteria-list">
                  {sbfpConfig.criteria.map((criterion) => {
                    const scope = criterionGradeScope(sbfpConfig, criterion);
                    return (
                      <div className="sbfp-criterion-row" key={criterion}>
                        <span className="sbfp-criterion-name">{criterion}</span>
                        {Array.isArray(scope) ? (
                          <div className="sbfp-criterion-grades">
                            {scope.map((grade) => (
                              <span className="sbfp-scope-tag" key={grade}>
                                {grade}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="sbfp-criterion-scope">{scope}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="sbfp-grades-empty">
                  No nutritional status criteria selected.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CARD 2: BMI Reference Charts & Framework Metadata ── */}
        <div className="information-reference-column">
          <div className="card information-reference-card">
            <h3 className="card-title">BMI Classification Reference</h3>
            <p className="settings-ref-sub">
              Official WHO BMI-for-Age reference used by DepEd (6–19 years).
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
            <div className="bmi-ref-list" style={{ marginBottom: "1.5rem" }}>
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

            <h3 className="card-title">System Diagnostics</h3>
            <div className="about-info">
              <div className="about-row">
                <span>App Name</span>
                <span>Nutritional Status System</span>
              </div>
              <div className="about-row">
                <span>Core Framework Version</span>
                <span>{appVersion || "1.0.0"}</span>
              </div>
              <div className="about-row">
                <span>Data Standard</span>
                <span>WHO / DepEd Growth Reference</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CARD 3: Release Notes Pane Block ── */}
        <div className="sdo-information-art" aria-hidden="true">
          <img src={buzzjayLogo} alt="" />
        </div>

        <div className="card settings-full-span" style={{ marginTop: "6px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: "10px",
              marginBottom: "12px",
            }}
          >
            <h3 className="card-title" style={{ margin: 0 }}>
              System Release Notes
            </h3>
            {releaseNotes && (
              <span
                style={{
                  fontSize: "12px",
                  background: "#e0f2fe",
                  color: "#0369a1",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontWeight: "600",
                }}
              >
                {releaseNotes.title}
              </span>
            )}
          </div>

          {releaseNotes ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {(releaseNotes.sections || []).map((section, sIndex) => (
                <div key={sIndex}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#1e293b",
                      marginBottom: "6px",
                    }}
                  >
                    {section.heading}
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {(section.items || []).map((item, iIndex) => (
                      <li
                        key={iIndex}
                        style={{
                          fontSize: "13px",
                          color: "#334155",
                          lineHeight: "1.5",
                        }}
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                fontSize: "13px",
                color: "#94a3b8",
                fontStyle: "italic",
              }}
            >
              No release notes available for this version yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

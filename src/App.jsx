import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import SDODashboard from "./components/SDODashboard";
import SDOInformation from "./components/SDOInformation";
import SDOSettings from "./components/SDOSettings";
import Students from "./components/Students";
import SDOStudents from "./components/SDOStudents";
import Profile from "./components/Profile";
import BatchEntry from "./components/BatchEntry";
import Reports from "./components/Reports";
import SDOReports from "./components/SDOReports";
import Settings from "./components/Settings";
import ExportImport from "./components/ExportImport";
import SyncStatus from "./components/SyncStatus";
import Login from "./components/Login";
import SBFPBeneficiaries from "./components/SBFPBeneficiaries";
import { getSession, logout, canEdit, ROLES } from "./utils/auth";
import {
  localLoadStudents,
  localSaveStudents,
  queueStudentForSync,
  syncToServer,
  syncFromServer,
  isOnline,
  isSupabaseConfigured,
  fetchSchoolForUser,
} from "./utils/syncService";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(getSession);
  const [page, setPage] = useState("dashboard");
  const [profileId, setProfileId] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState("ALL SCHOOLS");
  const [selectedPeriod, setSelectedPeriod] = useState("Baseline");
  const [selectedSY, setSelectedSY] = useState("2026–2027");
  const [schoolName, setSchoolName] = useState("");

  useEffect(() => {
    async function loadSchoolName() {
      try {
        const school = await window.sqlite.loadSchool();

        setSchoolName(school?.school_name || "");
      } catch (e) {
        console.error("[SQLite] Failed to load school:", e);
      }
    }

    loadSchoolName();
  }, []);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    window.electronAPI?.onUpdateReady?.(() => setUpdateReady(true));
  }, []);

  const isSDO = session?.role === ROLES.DIVISION;
  const readOnly = !canEdit(session);

  // Returns this device's configured school_id (set via Settings), or null.
  // Division-office devices never configure a school, so this naturally
  // stays null for them — which tells syncFromServer/syncToServer to fetch
  // across all schools instead of scoping to one.
  async function getLocalSchoolId() {
    try {
      const school = await window.sqlite.loadSchool();
      return school?.school_id || null;
    } catch (e) {
      console.error("[Sync] Failed to read local school_id:", e);
      return null;
    }
  }

  // ── Persist + sync ────────────────────────────────────────
  useEffect(() => {
    async function saveStudentsToDb() {
      await localSaveStudents(students);
    }

    saveStudentsToDb();
  }, [students]);

  useEffect(() => {
    async function pushToServer() {
      if (!isOnline() || !isSupabaseConfigured()) return;
      const schoolId = await getLocalSchoolId();
      syncToServer(students, schoolId);
    }
    pushToServer();
  }, [students]);

  useEffect(() => {
    async function handleOnline() {
      if (!isSupabaseConfigured()) return;
      const latestStudents = await localLoadStudents();
      const schoolId = await getLocalSchoolId();

      await syncToServer(latestStudents, schoolId);
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  useEffect(() => {
    async function startupSync() {
      if (!session?.id) return;

      try {
        const boundSchool = await fetchSchoolForUser(session.id);

        if (!boundSchool) {
          setStudents([]);
          await localSaveStudents([]);
          return;
        }

        const serverData = await syncFromServer(boundSchool.id);

        if (serverData.success && Array.isArray(serverData.students)) {
          await localSaveStudents(serverData.students);
          setStudents(serverData.students);
        }
      } catch (err) {
        console.error(err);
        setStudents([]);
      }
    }

    startupSync();
  }, [session]);

  function updateStudents(updaterOrValue) {
    setStudents((prev) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(prev)
          : updaterOrValue;
      next.forEach((student) => {
        const old = prev.find((p) => p.id === student.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(student)) {
          queueStudentForSync(student.id);
        }
      });
      return next;
    });
  }

  async function handleLogin(sess) {
    setSession(sess);
    setPage("dashboard");

    try {
      const boundSchool = await fetchSchoolForUser(sess.id);

      if (!boundSchool) {
        setStudents([]);
        await localSaveStudents([]);
        return;
      }

      const result = await syncFromServer(boundSchool.id);

      if (result.success && Array.isArray(result.students)) {
        await localSaveStudents(result.students);
        setStudents(result.students);
      }
    } catch (err) {
      console.error(err);
      setStudents([]);
      await localSaveStudents([]);
    }
  }

  function handleLogout() {
    logout();
    setSession(null);
    setPage("dashboard");

    // Windows/Electron sometimes leaves keyboard input routed to a stale
    // internal window state after this transition — symptom: the Login
    // screen's fields don't accept typing until the user switches away
    // from the app and back. Forcing a native focus-toggle right after
    // logout fixes that at the source instead of relying on the user to
    // work around it.
    setTimeout(() => {
      window.electronAPI?.forceRefocusWindow?.();
    }, 50);
  }

  function viewProfile(student) {
    setProfileId(student.id);
    setPage("profile");
  }

  function handleSetPage(id) {
    setPage(id);
    if (id !== "profile") setProfileId(null);
  }

  if (!session) return <Login onLogin={handleLogin} />;

  // allSchoolsData for SDO dashboard
  const allSchoolsData = { [schoolName || "Current School"]: students };

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        setPage={handleSetPage}
        schoolName={schoolName}
        session={session}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {/* Top bar */}
        <div className="top-bar no-print">
          {updateReady && (
            <div
              style={{
                background: "#16A34A",
                color: "#fff",
                padding: "8px 16px",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              ✅ Update downloaded —
              <button
                onClick={() => window.electronAPI.restartForUpdate()}
                style={{ marginLeft: 8, cursor: "pointer" }}
              >
                Restart Now
              </button>{" "}
              (or it'll install automatically when you close the app)
            </div>
          )}
          <div className="top-bar-left">
            <span className="welcome-msg">
              <strong>
                WELCOME, {(session.username || "USER").toUpperCase()}
              </strong>
            </span>
          </div>
          <div className="top-bar-right">
            {!readOnly && (
              <ExportImport students={students} setStudents={updateStudents} />
            )}
            <SyncStatus students={students} />
          </div>
        </div>

        {/* ── Dashboard ── */}
        {page === "dashboard" &&
          (isSDO ? (
            <SDODashboard
              allSchoolsData={allSchoolsData}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
              selectedPeriod={selectedPeriod}
              setSelectedPeriod={setSelectedPeriod}
              selectedSY={selectedSY}
              setSelectedSY={setSelectedSY}
            />
          ) : (
            <Dashboard students={students} />
          ))}

        {/* ── Students ── */}
        {page === "students" &&
          (isSDO ? (
            <SDOStudents
              students={students}
              onViewProfile={viewProfile}
              readOnly={true}
            />
          ) : (
            <Students
              students={students}
              selectedSchool={selectedSchool}
              setStudents={readOnly ? undefined : updateStudents}
              onViewProfile={viewProfile}
              readOnly={readOnly}
            />
          ))}

        {/* ── Profile (shared) ── */}
        {page === "profile" && (
          <Profile
            studentId={profileId}
            students={students}
            setStudents={readOnly ? undefined : updateStudents}
            onBack={() => setPage("students")}
            readOnly={readOnly}
          />
        )}

        {/* ── Batch Entry (school only) ── */}
        {page === "batch" &&
          !readOnly &&
          (() => {
            const schoolConfigured = schoolName?.trim();

            if (!schoolConfigured) {
              return (
                <div className="access-denied">
                  <div className="access-denied-icon">🏫</div>

                  <h2>School Setup Required</h2>

                  <p>
                    Before entering learner data, please configure your school
                    information first.
                  </p>

                  <div className="setup-steps">
                    <p>
                      <strong>Required Information:</strong>
                    </p>

                    <ul>
                      <li>School Name</li>
                      <li>School ID</li>
                      <li>Division</li>
                      <li>District</li>
                    </ul>

                    <p>
                      Once completed, all learners entered into the system will
                      automatically be assigned to your school.
                    </p>
                  </div>

                  <div
                    className="settings-link"
                    onClick={() => setPage("settings")}
                  >
                    👉 Click here to go to Settings
                  </div>
                </div>
              );
            }

            return (
              <BatchEntry students={students} setStudents={updateStudents} />
            );
          })()}

        {/* ── SBFP Beneficiaries (school only) ── */}
        {page === "sbfp" && !isSDO && (
          <SBFPBeneficiaries
            students={students}
            setStudents={readOnly ? undefined : updateStudents}
          />
        )}

        {/* ── Reports ── */}
        {page === "reports" &&
          (isSDO ? (
            <SDOReports
              allSchoolsData={allSchoolsData}
              selectedSchool={selectedSchool}
              setSelectedSchool={setSelectedSchool}
            />
          ) : (
            <Reports students={students} selectedSchool={selectedSchool} />
          ))}

        {/* ── Settings (school only) ── */}
        {page === "settings" && !readOnly && (
          <Settings
            schoolName={schoolName}
            setSchoolName={setSchoolName}
            students={students}
            currentUser={session}
          />
        )}

        {/* ── SDO-only pages ── */}
        {page === "sdo-info" && isSDO && <SDOInformation />}
        {page === "sdo-settings" && isSDO && (
          <SDOSettings currentUser={session} />
        )}

        {/* ── Access denied ── */}
        {readOnly && ["batch", "settings"].includes(page) && (
          <div className="access-denied">
            <div className="access-denied-icon">🔒</div>
            <h2>Access Restricted</h2>
            <p>This section is only available to School users.</p>
          </div>
        )}
      </main>
    </div>
  );
}

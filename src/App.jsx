import React, { useState, useEffect, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import SDODashboard from "./components/SDODashboard";
import SDOInformation from "./components/SDOInformation";
import SDOSettings from "./components/SDOSettings";
import Database from "./components/Database";
import SDOStudents from "./components/SDODatabase";
import Profile from "./components/Profile";
import BatchEntry from "./components/BatchEntry";
import Reports from "./components/Reports";
import SDOReports from "./components/SDOReports";
import Information from "./components/Information";
import ExportImport from "./components/ExportImport";
import SyncStatus from "./components/SyncStatus";
import Login from "./components/Login";
import SBFPBeneficiaries from "./components/SBFPBeneficiaries";
import ReleaseNotesModal from "./components/ReleaseNotesModal";
import OnboardingModal from "./components/OnboardingModal";
import { SchoolProvider } from "./context/SchoolContext";
import { RELEASE_NOTES } from "./data/releaseNotes";
import { getSession, logout, canEdit, ROLES } from "./utils/auth";
import { hydrateLogoCache, preloadAllSchoolLogos } from "./utils/logoCache";
import { supabase } from "./utils/supabaseClient";
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

// ── Subcomponent: Main Shell Layout ───────────────────────────────────────
function AppContent({
  session,
  setSession,
  page,
  setPage,
  profileId,
  setProfileId,
  autoOpenAddRecord,
  openProfileForMeasurement,
  selectedSchool,
  setSelectedSchool,
  dashboardSchool,
  setDashboardSchool,
  reportsSchool,
  setReportsSchool,
  selectedPeriod,
  setSelectedPeriod,
  selectedSY,
  setSelectedSY,
  schoolName,
  setSchoolName,
  showReleaseNotes,
  setShowReleaseNotes,
  releaseData,
  updateReady,
  readOnly,
  isSDO,
  safeStudents,
  allSchoolsData,
  updateStudents,
  handleLogout,
  viewProfile,
  handleSetPage,
  showOnboarding,
  setShowOnboarding,
}) {
  return (
    <div className="app-shell" style={{ position: "relative" }}>
      <Sidebar
        page={page}
        setPage={handleSetPage}
        schoolName={schoolName}
        session={session}
        onLogout={handleLogout}
      />

      <main className="main-content">
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

        <div className="top-bar no-print">
          <div className="top-bar-left">
            <span className="welcome-msg">
              <strong>
                WELCOME,{" "}
                {(
                  session.username ||
                  session.firstname ||
                  "USER"
                ).toUpperCase()}
              </strong>
            </span>
          </div>
          <div className="top-bar-right">
            {!readOnly && (
              <ExportImport
                students={safeStudents}
                setStudents={updateStudents}
              />
            )}
            <SyncStatus students={safeStudents} />
          </div>
        </div>

        {page === "dashboard" &&
          (isSDO ? (
            <SDODashboard
              allSchoolsData={allSchoolsData}
              selectedSchool={dashboardSchool}
              setSelectedSchool={setDashboardSchool}
              selectedPeriod={selectedPeriod}
              setSelectedPeriod={setSelectedPeriod}
              selectedSY={selectedSY}
              setSelectedSY={setSelectedSY}
            />
          ) : (
            <Dashboard
              students={safeStudents}
              currentUser={session}
              onOpenProfile={openProfileForMeasurement}
            />
          ))}

        {page === "database" &&
          (isSDO ? (
            <SDOStudents
              students={safeStudents}
              onViewProfile={viewProfile}
              readOnly={true}
            />
          ) : (
            <Database
              students={safeStudents}
              selectedSchool={selectedSchool}
              setStudents={readOnly ? undefined : updateStudents}
              onViewProfile={viewProfile}
              readOnly={readOnly}
            />
          ))}

        {page === "profile" && (
          <Profile
            studentId={profileId}
            students={safeStudents}
            setStudents={readOnly ? undefined : updateStudents}
            onBack={() => setPage("database")}
            readOnly={readOnly}
            supabase={supabase}
            autoOpenAddRecord={autoOpenAddRecord}
          />
        )}

        {page === "batch" &&
          !readOnly &&
          (() => {
            const schoolConfigured =
              String(session?.school_id || "").trim() || schoolName?.trim();

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
              <BatchEntry
                students={safeStudents}
                setStudents={updateStudents}
                currentUser={session}
              />
            );
          })()}

        {page === "sbfp" && !isSDO && (
          <SBFPBeneficiaries
            students={safeStudents}
            setStudents={readOnly ? undefined : updateStudents}
            currentUser={session}
          />
        )}

        {page === "reports" &&
          (isSDO ? (
            <SDOReports
              allSchoolsData={allSchoolsData}
              selectedSchool={reportsSchool}
              setSelectedSchool={setReportsSchool}
            />
          ) : (
            <Reports students={safeStudents} selectedSchool={selectedSchool} />
          ))}

        {page === "settings" && !readOnly && (
          <Information
            schoolName={schoolName}
            setSchoolName={setSchoolName}
            currentUser={session}
            students={safeStudents}
          />
        )}

        {page === "sdo-info" && isSDO && <SDOInformation />}
        {page === "sdo-settings" && isSDO && (
          <SDOSettings currentUser={session} />
        )}

        {readOnly && ["batch", "settings"].includes(page) && (
          <div className="access-denied">
            <div className="access-denied-icon">🔒</div>
            <h2>Access Restricted</h2>
            <p>This section is only available to School users.</p>
          </div>
        )}
      </main>

      <ReleaseNotesModal
        open={showReleaseNotes}
        version={releaseData?.title}
        sections={releaseData?.sections || []}
        onClose={() => setShowReleaseNotes(false)}
      />

      {showOnboarding && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999999,
          }}
        >
          <OnboardingModal
            user={session}
            onComplete={(updatedUserProfile) => {
              const freshUserSession = {
                ...session,
                ...updatedUserProfile,
              };
              sessionStorage.setItem(
                "sb_current_session",
                JSON.stringify(freshUserSession),
              );
              setSession(freshUserSession);
              setShowOnboarding(false);
              window.dispatchEvent(
                new CustomEvent("school-bound", {
                  detail: {
                    schoolId: updatedUserProfile.school_id,
                    schoolName:
                      updatedUserProfile.school_name ||
                      "Bound School Workspace",
                  },
                }),
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Root Master Component ───────────────────────────────────────────────────
export default function App() {
  // Uses sessionStorage so closing the app always forces login on next boot
  const [session, setSession] = useState(() => {
    const memorySession = sessionStorage.getItem("sb_current_session");
    if (memorySession) {
      try {
        return JSON.parse(memorySession);
      } catch (e) {
        return null;
      }
    }
    // Clean up outdated session tokens without wiping offline credentials
    localStorage.removeItem("sb_auth_token");
    localStorage.removeItem("sb_user_session");
    localStorage.removeItem("deped_bmi_session");
    return null;
  });

  const [page, setPage] = useState("dashboard");
  const [profileId, setProfileId] = useState(null);
  const [autoOpenAddRecord, setAutoOpenAddRecord] = useState(false);
  const [students, setStudents] = useState([]);

  const [selectedSchool, setSelectedSchool] = useState("ALL SCHOOLS");
  const [dashboardSchool, setDashboardSchool] = useState("ALL SCHOOLS");
  const [reportsSchool, setReportsSchool] = useState("CONSOLIDATED");
  const [selectedPeriod, setSelectedPeriod] = useState("Baseline");
  const [selectedSY, setSelectedSY] = useState("2026-2027");
  const [schoolName, setSchoolName] = useState("");
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [releaseData, setReleaseData] = useState(null);

  const [checkingSchoolBinding, setCheckingSchoolBinding] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    async function verifySchoolBinding() {
      if (!session) {
        setCheckingSchoolBinding(false);
        return;
      }

      const normalizedRole = String(session.role || "")
        .toLowerCase()
        .trim();
      if (normalizedRole !== "school-based" && normalizedRole !== "school") {
        setCheckingSchoolBinding(false);
        return;
      }

      if (session.school_id && String(session.school_id).trim() !== "") {
        setShowOnboarding(false);
        setCheckingSchoolBinding(false);
        return;
      }

      try {
        let localSchool = null;
        if (window.sqlite?.loadSchool) {
          localSchool = await window.sqlite.loadSchool(session.id);
        } else if (window.electron?.ipcRenderer) {
          localSchool = await window.electron.ipcRenderer.invoke(
            "get-school-by-id",
            session.school_id,
          );
        }

        if (localSchool && (localSchool.school_id || localSchool.id)) {
          const resolvedSchoolId = localSchool.school_id || localSchool.id;
          const resolvedSchoolName =
            localSchool.school_name || localSchool.name || schoolName;

          setSession((prev) => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              school_id: resolvedSchoolId,
              school_name: resolvedSchoolName,
            };
            sessionStorage.setItem(
              "sb_current_session",
              JSON.stringify(updated),
            );
            return updated;
          });

          setShowOnboarding(false);
          setCheckingSchoolBinding(false);
          return;
        }

        if (isOnline()) {
          const onlineSchool = await fetchSchoolForUser(session.id);
          if (onlineSchool && (onlineSchool.id || onlineSchool.school_id)) {
            const resolvedSchoolId = onlineSchool.school_id || onlineSchool.id;
            const resolvedSchoolName =
              onlineSchool.school_name || onlineSchool.name || schoolName;

            setSession((prev) => {
              if (!prev) return prev;
              const updated = {
                ...prev,
                school_id: resolvedSchoolId,
                school_name: resolvedSchoolName,
              };
              sessionStorage.setItem(
                "sb_current_session",
                JSON.stringify(updated),
              );
              return updated;
            });

            setShowOnboarding(false);
            setCheckingSchoolBinding(false);
            return;
          }
        }

        setShowOnboarding(true);
      } catch (err) {
        console.error("❌ Error verifying configuration pipeline:", err);
        setShowOnboarding(true);
      } finally {
        setCheckingSchoolBinding(false);
      }
    }

    verifySchoolBinding();
  }, [session]);

  useEffect(() => {
    async function loadSchoolName() {
      if (!session?.id) {
        setSchoolName("");
        return;
      }

      if (session.school_name) {
        setSchoolName(session.school_name);
        setSelectedSchool(session.school_name);
        return;
      }

      try {
        const boundSchool = await fetchSchoolForUser(session.id);
        setSchoolName(boundSchool?.name || boundSchool?.school_name || "");
        if (boundSchool?.name || boundSchool?.school_name) {
          setSelectedSchool(boundSchool.name || boundSchool.school_name);
        }
      } catch (e) {
        console.error(e);
        setSchoolName("");
      }
    }

    if (session && !checkingSchoolBinding) {
      loadSchoolName();
    }
  }, [session, checkingSchoolBinding]);

  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    window.electronAPI?.onUpdateReady?.(() => setUpdateReady(true));
  }, []);

  useEffect(() => {
    async function checkReleaseNotes() {
      if (!window.electronAPI?.getAppVersion) return;
      const version = await window.electronAPI.getAppVersion();
      const lastSeen = localStorage.getItem("last_seen_version");

      if (version !== lastSeen && RELEASE_NOTES[version]) {
        setReleaseData(RELEASE_NOTES[version]);
        setShowReleaseNotes(true);
        localStorage.setItem("last_seen_version", version);
      }
    }
    checkReleaseNotes();
  }, []);

  // Warm the local school-logo cache after login — SDO users only, since
  // they're the ones who browse between all ~65 schools in SDODashboard.
  // School-based users only ever see their own school's logo, which is
  // already persisted locally via saveSchool()'s logo_url handling.
  // hydrateLogoCache() pulls whatever's already on this machine into memory
  // (instant if returning); preloadAllSchoolLogos() then quietly downloads
  // anything still missing (real work only the first time on a new machine,
  // or when a new school logo gets added later). Neither call blocks the UI.
  useEffect(() => {
    const normalizedRole = String(session?.role || "")
      .toLowerCase()
      .trim();
    if (!session?.id || normalizedRole !== "division") return;

    let cancelled = false;
    hydrateLogoCache().then(() => {
      if (!cancelled) preloadAllSchoolLogos();
    });
    return () => {
      cancelled = true;
    };
  }, [session?.id, session?.role]);

  const isSDO =
    String(session?.role || "")
      .toLowerCase()
      .trim() === "division";
  const readOnly = !canEdit(session);

  async function getLocalSchoolId() {
    try {
      if (session?.school_id) return session.school_id;
      if (!window.sqlite?.loadSchool) return null;
      const school = await window.sqlite.loadSchool(session?.id);
      return school?.school_id || null;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  useEffect(() => {
    async function saveStudentsToDb() {
      if (students.length > 0) {
        await localSaveStudents(students);
      }
    }
    saveStudentsToDb();
  }, [students]);

  useEffect(() => {
    async function pushToServer() {
      if (!isOnline() || !isSupabaseConfigured() || students.length === 0)
        return;
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
  }, [students]);

  useEffect(() => {
    async function startupSync() {
      if (!session?.id || checkingSchoolBinding) return;

      try {
        const normalizedRole = String(session.role || "")
          .toLowerCase()
          .trim();
        if (normalizedRole === "division") {
          const serverData = await syncFromServer(null);
          if (serverData.success && Array.isArray(serverData.students)) {
            await localSaveStudents(serverData.students);
            setStudents(serverData.students);
          }
          return;
        }

        const targetId = session.school_id || (await getLocalSchoolId());
        if (!targetId) {
          setStudents([]);
          await localSaveStudents([]);
          return;
        }

        const serverData = await syncFromServer(targetId);
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
  }, [session, checkingSchoolBinding]);

  function updateStudents(updaterOrValue) {
    setStudents((prev) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(prev)
          : updaterOrValue;
      const safeNext = Array.isArray(next) ? next : [];
      const safePrev = Array.isArray(prev) ? prev : [];

      // --- Deduplicate next state to clean duplicate IDs ---
      const uniqueMap = new Map();
      safeNext.forEach((s) => {
        if (s && s.id) {
          uniqueMap.set(String(s.id), s);
        }
      });
      const deduplicatedNext = Array.from(uniqueMap.values());

      deduplicatedNext.forEach((student) => {
        const old = safePrev.find((p) => p && p.id === student.id);
        if (!old || JSON.stringify(old) !== JSON.stringify(student)) {
          queueStudentForSync(student.id);
        }
      });
      return deduplicatedNext;
    });
  }

  async function loadSchoolStudents(schoolId) {
    if (!schoolId) {
      setStudents([]);
      await localSaveStudents([]);
      return;
    }
    const result = await syncFromServer(schoolId);
    if (result.success && Array.isArray(result.students)) {
      await localSaveStudents(result.students);
      setStudents(result.students);
    }
  }

  async function handleLogin(sess) {
    if (sess) {
      sessionStorage.setItem("sb_current_session", JSON.stringify(sess));
    }
    setSession(sess);
    setPage("dashboard");
  }

  useEffect(() => {
    async function handleSchoolBound(event) {
      const { schoolId, schoolName: boundSchoolName } = event.detail;
      setSchoolName(boundSchoolName || "");
      if (boundSchoolName) {
        setSelectedSchool(boundSchoolName);
      }

      setSession((prev) => {
        if (!prev) return prev;
        if (prev.school_id === schoolId && !boundSchoolName) return prev;
        const updated = {
          ...prev,
          school_id: schoolId || prev.school_id,
          school_name: boundSchoolName || prev.school_name,
        };
        sessionStorage.setItem("sb_current_session", JSON.stringify(updated));
        return updated;
      });

      if (!schoolId) {
        setStudents([]);
        await localSaveStudents([]);
        return;
      }
      await loadSchoolStudents(schoolId);
    }
    window.addEventListener("school-bound", handleSchoolBound);
    return () => window.removeEventListener("school-bound", handleSchoolBound);
  }, [session]);

  function handleLogout() {
    logout();
    sessionStorage.clear();

    // Explicitly clean up active session keys only, DO NOT call localStorage.clear()
    localStorage.removeItem("sb_auth_token");
    localStorage.removeItem("sb_user_session");
    localStorage.removeItem("deped_bmi_session");

    setSession(null);
    setStudents([]);
    setSchoolName("");
    setPage("dashboard");

    // Reset school-scoped view state
    setSelectedSchool("ALL SCHOOLS");
    setDashboardSchool("ALL SCHOOLS");
    setReportsSchool("CONSOLIDATED");
    setSelectedPeriod("Baseline");
    setSelectedSY("2026-2027");
    setTimeout(() => {
      window.electronAPI?.forceRefocusWindow?.();
    }, 50);
  }

  function viewProfile(student) {
    if (!student) return;
    setProfileId(student.id);
    setAutoOpenAddRecord(false);
    setPage("profile");
  }

  // Used by Dashboard's "double-click a learner name" shortcut so teachers
  // can jump straight to adding a missing weight/height measurement.
  function openProfileForMeasurement(studentId, opts = {}) {
    if (!studentId) return;
    setProfileId(studentId);
    setAutoOpenAddRecord(!!opts.autoOpenAddRecord);
    setPage("profile");
  }

  function handleSetPage(id) {
    setPage(id);
    if (id !== "profile") {
      setProfileId(null);
      setAutoOpenAddRecord(false);
    }
  }

  const safeStudents = Array.isArray(students) ? students : [];

  const allSchoolsData = useMemo(() => {
    const normalizedRole = String(session?.role || "")
      .toLowerCase()
      .trim();
    if (normalizedRole !== "division") {
      return { [schoolName || "Current School"]: safeStudents };
    }
    return safeStudents.reduce((acc, student) => {
      if (!student) return acc;
      const school = student.schoolName || "Unknown School";
      if (!acc[school]) acc[school] = [];
      acc[school].push(student);
      return acc;
    }, {});
  }, [safeStudents, session, schoolName]);

  if (!session) return <Login onLogin={handleLogin} />;

  if (checkingSchoolBinding) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "18px",
          fontWeight: "bold",
          fontFamily: "sans-serif",
          color: "#4B5563",
        }}
      >
        Checking School Configuration Context...
      </div>
    );
  }

  return (
    <SchoolProvider initialUser={session}>
      <AppContent
        session={session}
        setSession={setSession}
        page={page}
        setPage={setPage}
        profileId={profileId}
        setProfileId={setProfileId}
        autoOpenAddRecord={autoOpenAddRecord}
        openProfileForMeasurement={openProfileForMeasurement}
        selectedSchool={selectedSchool}
        setSelectedSchool={setSelectedSchool}
        dashboardSchool={dashboardSchool}
        setDashboardSchool={setDashboardSchool}
        reportsSchool={reportsSchool}
        setReportsSchool={setReportsSchool}
        selectedPeriod={selectedPeriod}
        setSelectedPeriod={setSelectedPeriod}
        selectedSY={selectedSY}
        setSelectedSY={setSelectedSY}
        schoolName={schoolName}
        setSchoolName={setSchoolName}
        showReleaseNotes={showReleaseNotes}
        setShowReleaseNotes={setShowReleaseNotes}
        releaseData={releaseData}
        updateReady={updateReady}
        readOnly={readOnly}
        isSDO={isSDO}
        safeStudents={safeStudents}
        allSchoolsData={allSchoolsData}
        updateStudents={updateStudents}
        handleLogout={handleLogout}
        viewProfile={viewProfile}
        handleSetPage={handleSetPage}
        showOnboarding={showOnboarding}
        setShowOnboarding={setShowOnboarding}
      />
    </SchoolProvider>
  );
}

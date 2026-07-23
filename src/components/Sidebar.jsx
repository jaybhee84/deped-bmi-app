import React, { useEffect, useState } from "react";
import { ROLES } from "../utils/auth";
import "./Sidebar.css";

const SCHOOL_NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "database", icon: "🎒", label: "Database" },
  { id: "batch", icon: "📋", label: "Baseline Entry" },
  { id: "sbfp", icon: "🍱", label: "SBFP Beneficiaries" },
  { id: "reports", icon: "📄", label: "Reports" },
  { id: "settings", icon: "⚙️", label: "Information" },
];

const SDO_NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "database", icon: "🎒", label: "Database" },
  { id: "reports", icon: "📄", label: "Reports" },
  { id: "sdo-info", icon: "ℹ️", label: "Information" },
  { id: "sdo-settings", icon: "⚙️", label: "SDO Settings" },
];

export default function Sidebar({
  page,
  setPage,
  schoolName,
  session,
  onLogout,
}) {
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setVersion);
    }
  }, []);

  // Windows / Global Update Event Messages
  useEffect(() => {
    if (window.electronAPI?.onUpdateMessage) {
      const unsubscribe = window.electronAPI.onUpdateMessage((message) => {
        alert(message);
        window.electronAPI?.forceRefocusWindow?.();
      });
      return unsubscribe;
    }
  }, []);

  // macOS Progress listener
  useEffect(() => {
    if (window.electronAPI?.onDownloadProgress) {
      const unsubscribe = window.electronAPI.onDownloadProgress((percent) => {
        setUpdateStatus(`Downloading update… ${percent}%`);
      });
      return unsubscribe;
    }
  }, []);

  const isSDO = session?.role === ROLES.DIVISION;
  const navItems = isSDO ? SDO_NAV : SCHOOL_NAV;
  const activeSchoolName = schoolName || session?.school_name || "";

  const handleCheckForUpdates = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setUpdateStatus("Checking for updates…");

    try {
      if (!window.electronAPI?.checkForUpdates) {
        alert("Electron API is unavailable.");
        return;
      }

      const result = await window.electronAPI.checkForUpdates();

      if (!result?.success) {
        alert(`Update check failed:\n${result?.error || "Unknown error"}`);
        setUpdateStatus("");
        return;
      }

      // 1. Check if user is already up to date (All Platforms)
      if (!result.updateAvailable) {
        alert(
          `You are already using the latest version (v${result.currentVersion || version}).`,
        );
        setUpdateStatus("");
        return;
      }

      // 2. macOS Flow (Manual DMG Download)
      if (result.platform === "darwin") {
        const wantsDownload = window.confirm(
          `Update available: v${result.latestVersion} (you're on v${result.currentVersion}).\n\n` +
            `Download it now? It'll save to your Downloads folder and open automatically.`,
        );
        window.electronAPI?.forceRefocusWindow?.();
        if (!wantsDownload) {
          setUpdateStatus("");
          return;
        }

        if (!result.dmgUrl) {
          alert(
            "No DMG download file was found on the release page. Opening browser releases page instead.",
          );
          await window.electronAPI?.openReleasesPage?.();
          setUpdateStatus("");
          return;
        }

        setUpdateStatus("Downloading update… 0%");
        const download = await window.electronAPI.downloadUpdateMac({
          dmgUrl: result.dmgUrl,
          dmgName: result.dmgName,
        });
        setUpdateStatus("");

        if (download?.success) {
          alert(
            "Downloaded! Drag DepEd BMI App into Applications, then relaunch to finish updating.",
          );
        } else {
          alert(
            `Download failed:\n${download?.error || "Unknown error"}\n\nOpening the releases page so you can download manually.`,
          );
          await window.electronAPI?.openReleasesPage?.();
        }
      }
      // 3. Windows Flow (Auto-Updater handles download in background)
      else {
        setUpdateStatus("Downloading update in background…");
        alert(
          `Update available: v${result.latestVersion}!\n\nThe installer is downloading in the background. You will be prompted to restart once it finishes.`,
        );
      }
    } catch (err) {
      alert(`Error checking updates:\n${err.message}`);
      setUpdateStatus("");
    } finally {
      setIsChecking(false);
      window.electronAPI?.forceRefocusWindow?.();
    }
  };

  return (
    <aside className="sidebar no-print">
      <div className="sidebar-header">
        <div className="sidebar-logo">School-Based Feeding Program</div>
        <div className="sidebar-sub">Nutritional Status System</div>
        {isSDO ? (
          <div className="sidebar-school">
            {session?.divisionName || "Isabela City Schools Division Office"}
          </div>
        ) : (
          activeSchoolName && (
            <div className="sidebar-school">{activeSchoolName}</div>
          )
        )}
        {isSDO && (
          <div className="sidebar-view-tag">
            <span aria-hidden="true">🏛️</span> SDO / Division View
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${
              page === item.id || (item.id === "database" && page === "profile")
                ? "active"
                : ""
            }`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-name">
            {(session?.username || session?.fullName || "User").toUpperCase()}
          </div>
          <div className="user-position">{session?.position || "Operator"}</div>
          <div className={`user-role-tag ${session?.role || "School-Based"}`}>
            {isSDO ? "🏥 Division Personnel" : "🏫 School-Based"}
          </div>
          {version && (
            <div
              style={{
                fontSize: "12px",
                color: "#cbd5e1",
                marginBottom: "10px",
                textAlign: "center",
              }}
            >
              Version {version}
            </div>
          )}

          <button
            className="update-btn"
            disabled={isChecking}
            onClick={handleCheckForUpdates}
          >
            {isChecking ? "⏳ Checking…" : "🔄 Check for Updates"}
          </button>

          {updateStatus && (
            <div
              style={{
                fontSize: "11px",
                color: "#cbd5e1",
                marginTop: "6px",
                marginBottom: "6px",
                textAlign: "center",
              }}
            >
              {updateStatus}
            </div>
          )}

          <button
            className="logout-btn"
            onClick={() => {
              const ok = window.confirm("Are you sure you want to sign out?");
              window.electronAPI?.forceRefocusWindow?.();
              if (ok) onLogout();
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}

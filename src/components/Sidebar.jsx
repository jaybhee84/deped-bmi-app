import React, { useEffect, useState } from "react";
import { ROLES } from "../utils/auth";
import "./Sidebar.css";

// Updated: Changed "Settings" label to "Information" to match workspace flow requirements
const SCHOOL_NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "database", icon: "🎒", label: "Database" },
  { id: "batch", icon: "📋", label: "Baseline Entry" },
  { id: "sbfp", icon: "🍱", label: "SBFP Beneficiaries" },
  { id: "reports", icon: "📄", label: "Reports" },
  { id: "settings", icon: "⚙️", label: "Information" }, // <-- Changed here
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

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setVersion);
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI?.onUpdateMessage) {
      const unsubscribe = window.electronAPI.onUpdateMessage((message) => {
        alert(message);
        window.electronAPI?.forceRefocusWindow?.();
      });
      return unsubscribe;
    }
  }, []);

  const isSDO = session?.role === ROLES.DIVISION;
  const navItems = isSDO ? SDO_NAV : SCHOOL_NAV;

  // Safe fallback to resolve school name text from state or new sync profile cache layer
  const activeSchoolName = schoolName || session?.school_name || "";

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
            {isSDO ? "🏥 Division" : "🏫 School"}
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
            onClick={async () => {
              try {
                if (!window.electronAPI?.checkForUpdates) return;
                const result = await window.electronAPI.checkForUpdates();

                if (!result?.success) {
                  alert(
                    `Update check failed:\n${result?.error || "Unknown error"}`,
                  );
                }
              } catch (err) {
                alert(`Error checking updates:\n${err.message}`);
              } finally {
                window.electronAPI?.forceRefocusWindow?.();
              }
            }}
          >
            🔄 Check for Updates
          </button>

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

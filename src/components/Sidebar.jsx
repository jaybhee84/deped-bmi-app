import React from "react";
import { ROLES } from "../utils/auth";
import "./Sidebar.css";

const SCHOOL_NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "students", icon: "🎒", label: "Database" },
  { id: "batch", icon: "📋", label: "Batch Entry" },
  { id: "sbfp", icon: "🍱", label: "SBFP Beneficiaries" },
  { id: "reports", icon: "📄", label: "Reports" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

const SDO_NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "students", icon: "🎒", label: "Database" },
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
  const isSDO = session?.role === ROLES.DIVISION;
  const navItems = isSDO ? SDO_NAV : SCHOOL_NAV;

  return (
    <aside className="sidebar no-print">
      <div className="sidebar-header">
        <div className="sidebar-logo">School-Based Feeding Program</div>
        <div className="sidebar-sub">Nutritional Status System</div>
        {isSDO ? (
          <div className="sidebar-sdo-tag">
            {session?.divisionName || "Isabela City Schools Division Office"}
          </div>
        ) : (
          schoolName && <div className="sidebar-school">{schoolName}</div>
        )}
        {isSDO && <div className="sidebar-sdo-tag">SDO / Division View</div>}
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${
              page === item.id || (item.id === "students" && page === "profile")
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
            {session?.username || session?.fullName || "User"}
          </div>
          <div className="user-position">{session?.position}</div>
          <div className={`user-role-tag ${session?.role}`}>
            {isSDO ? "🏥 Division" : "🏫 School"}
          </div>
          <button
            className="logout-btn"
            onClick={() => {
              const ok = window.confirm("Are you sure you want to sign out?");
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

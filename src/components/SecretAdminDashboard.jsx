import React from "react";
import SDOAllowedUsers from "./SDOAllowedUsers";
import { supabase } from "../utils/supabase";
import "./Sidebar.css";

// "admin1" satisfies the creator check in SDOAllowedUsers so the panel can
// see and manage the protected creator emails too. The email intentionally
// reflects the real, dedicated backing account (not a personal account) so
// "Added by" attribution in the allowlist stays honest.
const ADMIN_USER = {
  username: "admin1",
  email: "bmi-secret-admin@deped-bmi.internal",
  fullName: "System Administrator",
};

const USERS_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M16 11a4 4 0 1 0-3.47-5.98A5 5 0 0 1 14 8.5c0 .88-.23 1.7-.63 2.42A6.5 6.5 0 0 1 18.5 17v1H22v-1a6 6 0 0 0-6-6ZM8.5 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM8.5 13C4.91 13 2 15.46 2 18.5V20h13v-1.5C15 15.46 12.09 13 8.5 13Z" />
  </svg>
);

export default function SecretAdminDashboard({ onExit }) {
  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <div className="sidebar-header">
          <div className="sidebar-logo">School-Based Feeding Program</div>
          <div className="sidebar-sub">Nutritional Status System</div>
          <div className="sidebar-view-tag">
            <span aria-hidden="true">🔑</span> Admin Access
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item active" type="button">
            <span className="nav-icon nav-icon-users">{USERS_ICON}</span>
            <span>Allowed Users</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-name">ADMIN</div>
            <div className="user-position">System Administrator</div>
            <button
              className="logout-btn"
              onClick={async () => {
                const ok = window.confirm("Exit the admin panel?");
                window.electronAPI?.forceRefocusWindow?.();
                if (!ok) return;
                await supabase.auth.signOut();
                onExit();
              }}
            >
              Exit Admin
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <SDOAllowedUsers currentUser={ADMIN_USER} />
      </main>
    </div>
  );
}

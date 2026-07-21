import React, { createContext, useContext, useState, useEffect } from "react";

// 1. Explicitly export the context object so consumers can access it if needed
export const SchoolContext = createContext(null);

export const SchoolProvider = ({ children, initialUser }) => {
  const [user, setUser] = useState(initialUser);
  const [schoolDetails, setSchoolDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  // Synchronize internal state whenever the top-level session user updates
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  // The Metadata Tunnel: Queries school profiles safely across environments (Electron vs. Web Browser)
  useEffect(() => {
    async function fetchSchoolMetadata() {
      if (user?.school_id) {
        setLoading(true);
        try {
          let details = null;

          // Check if running inside the native desktop Electron shell environment
          if (window.sqlite && window.sqlite.loadSchoolWithLogo) {
            // FIXED: This used to call window.electron.ipcRenderer.invoke(
            // "get-school-by-id", user.school_id), which reads the
            // `global_schools` table — that's the master school directory
            // used only for offline autocomplete during onboarding
            // (district/address auto-fill), NOT the actual device/user
            // binding. A device that never had that specific school
            // selected from the onboarding dropdown locally (e.g. a
            // second device logging into an already-bound account) would
            // always get `null` back from that table, even though the
            // binding itself was valid — producing the
            // "Tunnel blocked: Missing an active School ID configuration
            // profile mapping" false negative.
            //
            // The correct source of truth is the `schools` table, keyed
            // by `bound_user_id`, resolved via loadSchool(userId) /
            // loadSchoolWithLogo(userId) — already bridged in preload.js
            // as window.sqlite.loadSchool / window.sqlite.loadSchoolWithLogo.
            details = await window.sqlite.loadSchoolWithLogo(user.id);
          } else if (window.sqlite && window.sqlite.loadSchool) {
            // Fallback if loadSchoolWithLogo isn't available in this build
            details = await window.sqlite.loadSchool(user.id);
          } else {
            // WEB BROWSER FALLBACK:
            // Intercepts crash and maps structural parameters safely from the user profile session data
            console.warn(
              "Electron API not detected. Constructing web fallback scope context properties.",
            );
            details = {
              school_id: user.school_id,
              school_name: user.school_name || "Web Preview School",
              name: user.school_name || "Web Preview School",
            };
          }

          // Local SQLite has no row bound to this user yet (e.g. fresh
          // device) but the session already carries a school_id (from
          // Supabase or a prior "school-bound" event). Fall back to
          // constructing details from the session itself rather than
          // leaving the context unresolved.
          if (!details || (!details.school_id && !details.id)) {
            details = {
              school_id: user.school_id,
              school_name: user.school_name || "",
              name: user.school_name || "",
            };
          }

          setSchoolDetails(details);
        } catch (err) {
          console.error("Failed to resolve school context properties:", err);
          setSchoolDetails(null);
        } finally {
          setLoading(false);
        }
      } else {
        setSchoolDetails(null);
        setLoading(false);
      }
    }

    fetchSchoolMetadata();
  }, [user]);

  /**
   * The Query Tunnel Pipeline
   * Intercepts local system requests and structurally guarantees that
   * the active school_id is seamlessly injected into every query footprint safely.
   */
  const executeLocalQuery = async (channel, payload = {}) => {
    const activeSchoolId = user?.school_id || schoolDetails?.school_id;

    if (!activeSchoolId && user?.role === "School-Based") {
      throw new Error(
        "Action restricted: Profile workspace requires an active school connection.",
      );
    }

    const securePayload = {
      ...payload,
      school_id: activeSchoolId, // Injecting the verified tunnel parameter
    };

    // Environment-safe execution routing
    if (window.electron && window.electron.ipcRenderer) {
      return await window.electron.ipcRenderer.invoke(channel, securePayload);
    } else {
      console.warn(
        `Browser simulation executed local fallback query mock on channel: ${channel}`,
        securePayload,
      );
      return { success: true, mocked: true, data: [] };
    }
  };

  const refreshUserSession = (updatedUser) => {
    setUser(updatedUser);
  };

  return (
    <SchoolContext.Provider
      value={{
        school: schoolDetails,
        user,
        executeLocalQuery,
        refreshUserSession,
        loading,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

// 2. Custom hook for quick connection mappings
export const useSchoolScope = () => {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error(
      "useSchoolScope must be used within a SchoolProvider tunnel.",
    );
  }
  return context;
};

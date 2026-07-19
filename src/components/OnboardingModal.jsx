import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../utils/supabase";
import { SCHOOL_OPTIONS } from "../utils/schools";
import { getSchoolLogoUrl } from "../utils/schoolLogoMap";

const DISTRICT_OPTIONS = [
  "East District I",
  "East District II",
  "West District I",
  "West District II",
  "West District III",
  "North District I",
  "North District II",
  "North District III",
  "Island District I",
  "Island District II",
  "Island District III",
];

export default function OnboardingModal({ user, onComplete }) {
  const [name, setName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [isPreExisting, setIsPreExisting] = useState(false);

  const [isSchoolOpen, setIsSchoolOpen] = useState(false);
  const [isDistrictOpen, setIsDistrictOpen] = useState(false);

  const schoolRef = useRef(null);
  const districtRef = useRef(null);

  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const processedSchools = SCHOOL_OPTIONS.filter((schoolName) => {
    if (schoolName === "ALL SCHOOLS") return false;
    const lowerName = schoolName.toLowerCase();
    return (
      !lowerName.includes("high school") &&
      !lowerName.includes("nhs") &&
      !lowerName.endsWith(" hs")
    );
  }).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    function handleClickOutside(event) {
      if (schoolRef.current && !schoolRef.current.contains(event.target)) {
        setIsSchoolOpen(false);
      }
      if (districtRef.current && !districtRef.current.contains(event.target)) {
        setIsDistrictOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    async function checkSchoolSetup() {
      if (!name) {
        setSchoolId("");
        setDistrict("");
        setAddress("");
        setIsPreExisting(false);
        return;
      }

      try {
        let school = null;

        if (window.electron?.ipcRenderer) {
          school = await window.electron.ipcRenderer.invoke(
            "get-school-by-name",
            name.trim(),
          );
        }

        if (!school && navigator.onLine) {
          const { data } = await supabase
            .from("schools")
            .select("*")
            .eq("name", name.trim())
            .maybeSingle();
          school = data;
        }

        if (school) {
          setSchoolId(school.school_id || "");
          setDistrict(school.district || "");
          setAddress(school.address || "");
          setIsPreExisting(true);
        } else {
          setSchoolId("");
          setDistrict("");
          setAddress("");
          setIsPreExisting(false);
        }
      } catch (e) {
        console.error(
          "Failed looking up school configuration profile state:",
          e,
        );
      }
    }
    checkSchoolSetup();
  }, [name]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    const targetName = name.trim();
    const targetSchoolId = schoolId.trim();

    if (!targetName || !targetSchoolId) {
      setMsg("School Name and School ID are required.");
      return;
    }

    setLoading(true);

    try {
      const generatedLogoUrl = getSchoolLogoUrl(targetName);

      if (!isPreExisting) {
        const { error: schoolInsertError } = await supabase
          .from("schools")
          .insert({
            school_id: targetSchoolId,
            name: targetName,
            district: district,
            address: address,
            logo_url: generatedLogoUrl,
          });

        if (schoolInsertError) {
          if (schoolInsertError.code === "23505") {
            throw new Error(
              "This School ID is already assigned to another school entry.",
            );
          }
          throw schoolInsertError;
        }
      }

      const { data: updatedProfile, error: profileError } = await supabase
        .from("profiles")
        .update({
          school_id: targetSchoolId,
          school_name: targetName,
        })
        .eq("id", user.id)
        .select()
        .single();

      if (profileError) throw profileError;

      const localSchoolPayload = {
        school_id: targetSchoolId,
        school_name: targetName,
        logo_url: generatedLogoUrl,
        district: district,
        address: address,
        created_by: user.id,
      };

      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke(
          "save-school-locally",
          localSchoolPayload,
        );
        await window.electron.ipcRenderer.invoke("update-local-profile", {
          id: updatedProfile.id,
          email: updatedProfile.email,
          role: updatedProfile.role,
          school_id: targetSchoolId,
          school_name: targetName,
          password_hash: null,
        });
      }

      onComplete(updatedProfile);
    } catch (err) {
      setMsg(
        err.message || "An error occurred during verification configurations.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboard-overlay">
      <style>{`
        .onboard-overlay {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          background: rgba(15, 23, 42, 0.75) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 99999 !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        }
        .onboard-card {
          background: #ccefe9 !important; 
          padding: 40px !important;
          border-radius: 24px !important;
          width: 100% !important;
          max-width: 480px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 20px !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3) !important;
          border: 1px solid rgba(255, 255, 255, 0.5) !important;
        }
        .onboard-header {
          text-align: center !important;
          margin-bottom: 8px !important;
        }
        .onboard-title {
          margin: 0 0 6px 0 !important;
          color: #0f2d30 !important; /* Maximum contrast dark teal header */
          font-size: 28px !important;
          font-weight: 700 !important;
          letter-spacing: -0.01em !important;
        }
        .onboard-subtitle {
          margin: 0 !important;
          color: #2e4d50 !important; /* Bold, high contrast description */
          font-size: 14px !important;
          font-weight: 600 !important;
        }
        .onboard-group {
          display: flex !important;
          flex-direction: column !important;
          gap: 6px !important;
          position: relative !important;
        }
        .onboard-label {
          font-size: 14px !important;
          font-weight: 700 !important;
          color: #173b3e !important; /* Clear dark text */
        }
        .onboard-asterisk {
          color: #c92a2a !important;
          margin-left: 2px !important;
        }
        /* inputs and dropdown wrappers using distinct contrast styles */
        .onboard-input, .onboard-trigger {
          padding: 12px 14px !important;
          border: 1.5px solid #7ea3a6 !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          background: #ffffff !important;
          color: #0f2d30 !important;
          outline: none !important;
          box-sizing: border-box !important;
          transition: all 0.2s ease !important;
        }
        .onboard-trigger {
          cursor: pointer !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          user-select: none !important;
        }
        .onboard-input::placeholder, .onboard-trigger.placeholder span {
          color: #688689 !important;
        }
        .onboard-input:focus, .onboard-trigger.active {
          border-color: #173b3e !important;
          box-shadow: 0 0 0 3px rgba(23, 59, 62, 0.15) !important;
        }
        .onboard-input:disabled, .onboard-trigger.disabled {
          background: #e1edea !important;
          color: #5c7577 !important;
          border-color: #a4bebf !important;
          cursor: not-allowed !important;
        }
        .onboard-arrow {
          font-size: 10px !important;
          color: #2e4d50 !important;
          font-weight: bold !important;
          transition: transform 0.2s ease !important;
        }
        .onboard-trigger.active .onboard-arrow {
          transform: rotate(180deg) !important;
        }
        .onboard-menu {
          position: absolute !important;
          top: calc(100% + 4px) !important;
          left: 0 !important;
          right: 0 !important;
          background: #ffffff !important;
          border: 1.5px solid #173b3e !important;
          border-radius: 8px !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2) !important;
          max-height: 180px !important;
          overflow-y: auto !important;
          margin: 0 !important;
          padding: 4px !important;
          list-style: none !important;
          z-index: 100000 !important;
        }
        .onboard-item {
          padding: 10px 12px !important;
          cursor: pointer !important;
          font-size: 14px !important;
          border-radius: 6px !important;
          color: #173b3e !important;
          transition: all 0.15s ease !important;
        }
        .onboard-item:hover {
          background: #eef9f7 !important;
          color: #0f2d30 !important;
        }
        .onboard-item.selected {
          background: #b2e7dd !important;
          color: #0f2d30 !important;
          font-weight: 700 !important;
        }
        .onboard-error {
          color: #ffffff !important;
          background: #c92a2a !important;
          padding: 12px 14px !important;
          border-radius: 8px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
        }
        /* Deep slate button for clear contrast and dynamic action visual weight */
        .onboard-btn {
          padding: 14px !important;
          background: #173b3e !important;
          color: #ffffff !important;
          border: none !important;
          border-radius: 8px !important;
          cursor: pointer !important;
          font-weight: 700 !important;
          font-size: 15px !important;
          margin-top: 12px !important;
          transition: all 0.2s ease !important;
          box-shadow: 0 4px 12px rgba(23, 59, 62, 0.2) !important;
        }
        .onboard-btn:hover:not(:disabled) {
          background: #0f2d30 !important;
          box-shadow: 0 6px 16px rgba(23, 59, 62, 0.3) !important;
        }
        .onboard-btn:disabled {
          background: #9ebbbf !important;
          color: #ffffff !important;
          cursor: not-allowed !important;
          box-shadow: none !important;
        }
      `}</style>

      <form onSubmit={handleSubmit} className="onboard-card">
        <div className="onboard-header">
          <h3 className="onboard-title">School Setup</h3>
          <p className="onboard-subtitle">Linking User/Profile to School</p>
        </div>

        {msg && <div className="onboard-error">{msg}</div>}

        {/* Custom School Select Dropdown Container */}
        <div className="onboard-group" ref={schoolRef}>
          <label className="onboard-label">
            School <span className="onboard-asterisk">*</span>
          </label>
          <div
            className={`onboard-trigger ${!name ? "placeholder" : ""} ${isSchoolOpen ? "active" : ""}`}
            onClick={() => setIsSchoolOpen(!isSchoolOpen)}
          >
            <span>{name || "Select School"}</span>
            <span className="onboard-arrow">▼</span>
          </div>

          {isSchoolOpen && (
            <ul className="onboard-menu">
              {processedSchools.map((schoolName) => (
                <li
                  key={schoolName}
                  className={`onboard-item ${name === schoolName ? "selected" : ""}`}
                  onClick={() => {
                    setName(schoolName);
                    setIsSchoolOpen(false);
                  }}
                >
                  {schoolName}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Input Field: School ID */}
        <div className="onboard-group">
          <label className="onboard-label">
            School ID <span className="onboard-asterisk">*</span>
          </label>
          <input
            type="text"
            placeholder={
              isPreExisting ? "" : "Enter custom School ID (e.g., 126001)"
            }
            className="onboard-input"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            disabled={isPreExisting}
            required
          />
        </div>

        {/* Custom District Select Dropdown Container */}
        <div className="onboard-group" ref={districtRef}>
          <label className="onboard-label">District</label>
          <div
            className={`onboard-trigger ${!district ? "placeholder" : ""} ${isDistrictOpen ? "active" : ""} ${isPreExisting ? "disabled" : ""}`}
            onClick={() => !isPreExisting && setIsDistrictOpen(!isDistrictOpen)}
          >
            <span>{district || "Select District"}</span>
            <span className="onboard-arrow">▼</span>
          </div>

          {isDistrictOpen && !isPreExisting && (
            <ul className="onboard-menu">
              <li
                className={`onboard-item ${district === "" ? "selected" : ""}`}
                onClick={() => {
                  setDistrict("");
                  setIsDistrictOpen(false);
                }}
              >
                Select District
              </li>
              {DISTRICT_OPTIONS.map((dist) => (
                <li
                  key={dist}
                  className={`onboard-item ${district === dist ? "selected" : ""}`}
                  onClick={() => {
                    setDistrict(dist);
                    setIsDistrictOpen(false);
                  }}
                >
                  {dist}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Input Field: Complete Address */}
        <div className="onboard-group">
          <label className="onboard-label">Complete Address</label>
          <input
            type="text"
            placeholder={isPreExisting ? "" : "Enter school address"}
            className="onboard-input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={isPreExisting}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !name || !schoolId}
          className="onboard-btn"
        >
          {loading ? "Saving..." : "Save Configuration"}
        </button>
      </form>
    </div>
  );
}

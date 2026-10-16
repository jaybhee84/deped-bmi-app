import React, { useState, useRef, useEffect } from "react";
import {
  buildFullName,
  suggestUsername,
  ROLES,
  SCHOOL_POSITIONS,
  DIVISION_POSITIONS,
  saveSession,
  cacheOfflineCredentials,
  deleteOfflineCredentials,
  attemptOfflineLogin,
  hasOfflineCredentials,
} from "../utils/auth";
import { supabase } from "../utils/supabase";
import { fetchAllSchools } from "../utils/syncService";
import { SCHOOL_OPTIONS, officialSchoolId } from "../utils/schools";
import "./Login.css";
import logo from "../images/sbfp.png";

// ── Local Background Images (PNG) ─────────────────────────────────────────
import bg1 from "../images/bg1.png";
import bg2 from "../images/bg2.png";
import bg3 from "../images/bg3.png";
import bg4 from "../images/bg4.png";
import bg5 from "../images/bg5.png";
import bg6 from "../images/bg6.png";
import bg7 from "../images/bg7.png";
import bg8 from "../images/bg8.png";
import bg9 from "../images/bg9.png";

const BG_IMAGES = [bg1, bg2, bg3, bg4, bg5, bg6, bg7, bg8, bg9];

const CREATOR_SDO_EMAIL = "jaybhee84@gmail.com";
const CREATOR_SCHOOL_EMAIL = "jl3hee@gmail.com";

const SECRET_ADMIN_USERNAME = "jaybhee84";
const SECRET_ADMIN_PASSWORD = "admin123";
const SECRET_LOGO_CLICKS = 5;
const SECRET_LOGO_CLICK_WINDOW_MS = 1500;

// Dedicated Supabase account (division role) used only to back the secret
// admin panel, so its Allowed Users actions pass real RLS checks. Kept
// separate from the visible gate credentials and from any real personal
// account so exposure of either one doesn't compromise the other.
const SECRET_ADMIN_BACKING_EMAIL = "bmi-secret-admin@deped-bmi.internal";
const SECRET_ADMIN_BACKING_PASSWORD = "lWdg2iIucmkUKc11XuxXrU5";

// ── Subcomponent: Secret admin login ──────────────────────────────────────
function SecretAdminLogin({ onSuccess, onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (
      username.trim() !== SECRET_ADMIN_USERNAME ||
      password !== SECRET_ADMIN_PASSWORD
    ) {
      setError("Invalid admin credentials.");
      return;
    }

    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: SECRET_ADMIN_BACKING_EMAIL,
      password: SECRET_ADMIN_BACKING_PASSWORD,
    });
    setLoading(false);

    if (signInError) {
      setError("Admin panel backing account isn't set up yet.");
      return;
    }
    onSuccess();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-field">
        <label className="form-label">Admin Username</label>
        <input
          className="form-input login-input"
          value={username}
          autoFocus
          onChange={(e) => {
            setUsername(e.target.value);
            setError("");
          }}
          required
        />
      </div>
      <div className="login-field">
        <label className="form-label">Admin Password</label>
        <input
          className="form-input login-input"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          required
        />
      </div>
      {error && <div className="login-error">{error}</div>}
      <button type="submit" className="login-btn" disabled={loading}>
        {loading ? "Verifying…" : "Enter Admin Panel"}
      </button>
      <button type="button" className="back-link" onClick={onBack}>
        ← Back to Sign In
      </button>
    </form>
  );
}

// ── Subcomponent: Secret admin menu ───────────────────────────────────────
function SecretAdminMenu({ onManageUsers, onAudit, onSignOut }) {
  return (
    <div className="role-picker">
      <p className="role-picker-title">Admin Panel</p>
      <div className="role-picker-cards">
        <button type="button" className="role-card" onClick={onManageUsers}>
          <span className="role-card-icon">🗂️</span>
          <span className="role-card-label">Allowed Users</span>
        </button>
        <button type="button" className="role-card" onClick={onAudit}>
          <span className="role-card-icon">🕵️</span>
          <span className="role-card-label">Audit / Test as User</span>
        </button>
      </div>
      <button type="button" className="back-link" onClick={onSignOut}>
        ← Sign Out of Admin Panel
      </button>
    </div>
  );
}

// ── Subcomponent: Audit mode role + school picker ─────────────────────────
function AuditPicker({ onConfirm, onBack }) {
  const [role, setRole] = useState(ROLES.SCHOOL);
  const [schools, setSchools] = useState([]);
  // "id:<school_id>" for a registered school, "name:<school name>" for a
  // division school that has no account yet (its School ID is typed below).
  const [selectedSchoolKey, setSelectedSchoolKey] = useState("");
  const [typedSchoolId, setTypedSchoolId] = useState("");
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (role !== ROLES.SCHOOL || schools.length > 0) return;
    let cancelled = false;
    setSchoolsLoading(true);
    fetchAllSchools()
      .then((list) => {
        if (!cancelled) setSchools(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Could not load schools.");
      })
      .finally(() => {
        if (!cancelled) setSchoolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, schools.length]);

  // Every division school can be audited, registered or not.
  const sameName = (a, b) =>
    String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  // Their School IDs come from the official division list (same as SwiSS).
  const unregisteredSchools = SCHOOL_OPTIONS.filter((name) => name !== "ALL SCHOOLS")
    .map((name) => ({ name, id: officialSchoolId(name) }))
    .filter(
      (school) =>
        !schools.some(
          (s) => sameName(s.name, school.name) || (school.id && String(s.id) === school.id),
        ),
    );
  const pickingUnregistered = selectedSchoolKey.startsWith("name:");
  const pickedSchool = pickingUnregistered
    ? unregisteredSchools.find((school) => `name:${school.name}` === selectedSchoolKey)
    : null;
  // Only a school DepEd has not given an ID yet needs one typed in.
  const needsTypedId = pickingUnregistered && !pickedSchool?.id;

  function resolveAuditSchool() {
    if (selectedSchoolKey.startsWith("id:")) {
      const school = schools.find((s) => `id:${s.id}` === selectedSchoolKey);
      return school ? { school } : { error: "Please choose a school to audit." };
    }
    if (!pickedSchool) return { error: "Please choose a school to audit." };
    const name = pickedSchool.name;
    if (pickedSchool.id) return { school: { id: pickedSchool.id, name } };
    const id = typedSchoolId.trim();
    if (!/^\d{6}$/.test(id)) {
      return { error: `Enter the 6-digit DepEd School ID of ${name}.` };
    }
    const taken = schools.find((s) => String(s.id) === id);
    if (taken) {
      return { error: `School ID ${id} already belongs to ${taken.name}.` };
    }
    return { school: { id, name } };
  }

  async function handleConfirm() {
    setError("");
    const isSchoolAudit = role === ROLES.SCHOOL;
    const resolved = isSchoolAudit ? resolveAuditSchool() : {};
    const selectedSchool = resolved.school;

    if (isSchoolAudit && !selectedSchool) {
      setError(resolved.error);
      return;
    }

    setLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        throw new Error("Admin session expired. Please sign in again.");
      }

      const { data: profile, error: profileErr } = await supabase
        .from("bmi_profiles")
        .select("*")
        .eq("id", userData.user.id)
        .single();
      if (profileErr || !profile) {
        throw new Error("Could not load the admin backing profile.");
      }

      const session = {
        ...userData.user,
        ...profile,
        role: isSchoolAudit ? ROLES.SCHOOL : ROLES.DIVISION,
        school_id: isSchoolAudit ? selectedSchool.id : null,
        school_name: isSchoolAudit ? selectedSchool.name : "",
        username: "admin1",
        fullname: isSchoolAudit
          ? `Audit Mode — ${selectedSchool.name}`
          : "Audit Mode — Division",
        position: "System Administrator",
        auditMode: true,
      };

      onConfirm(session);
    } catch (err) {
      setError(err.message || "Failed to enter audit mode.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="role-picker">
      <p className="role-picker-title">Audit / test the app as:</p>
      <div className="role-picker-cards">
        <button
          type="button"
          className={`role-card${role === ROLES.SCHOOL ? " selected" : ""}`}
          onClick={() => {
            setRole(ROLES.SCHOOL);
            setError("");
          }}
        >
          <span className="role-card-icon">🏫</span>
          <span className="role-card-label">School Based</span>
        </button>
        <button
          type="button"
          className={`role-card${role === ROLES.DIVISION ? " selected" : ""}`}
          onClick={() => {
            setRole(ROLES.DIVISION);
            setError("");
          }}
        >
          <span className="role-card-icon">🏢</span>
          <span className="role-card-label">SDO Based</span>
        </button>
      </div>

      {role === ROLES.SCHOOL && (
        <div className="login-field">
          <label className="form-label">School to Audit</label>
          <select
            className="form-input login-input form-select"
            value={selectedSchoolKey}
            onChange={(e) => {
              setSelectedSchoolKey(e.target.value);
              setTypedSchoolId("");
              setError("");
            }}
            disabled={schoolsLoading}
          >
            <option value="">
              {schoolsLoading ? "Loading schools…" : "Select a school…"}
            </option>
            {schools.length > 0 && (
              <optgroup label="Registered schools">
                {schools.map((s) => (
                  <option key={s.id} value={`id:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            {unregisteredSchools.length > 0 && (
              <optgroup label="No account yet">
                {unregisteredSchools.map((school) => (
                  <option key={school.name} value={`name:${school.name}`}>
                    {school.name}
                    {school.id ? ` (${school.id})` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

      {role === ROLES.SCHOOL && pickingUnregistered && !needsTypedId && (
        <p className="audit-school-hint">
          School ID {pickedSchool.id} · no account yet, so it starts with no learner data.
        </p>
      )}

      {role === ROLES.SCHOOL && needsTypedId && (
        <div className="login-field">
          <label className="form-label">School ID</label>
          <input
            className="form-input login-input"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit DepEd School ID"
            value={typedSchoolId}
            onChange={(e) => setTypedSchoolId(e.target.value.replace(/\D/g, ""))}
          />
          <p className="audit-school-hint">
            DepEd has not published this school's ID yet. Enter it to continue.
          </p>
        </div>
      )}

      {error && <div className="login-error">{error}</div>}

      <button
        type="button"
        className="login-btn"
        disabled={loading}
        onClick={handleConfirm}
      >
        {loading ? "Entering…" : "Enter Audit Mode"}
      </button>
      <button type="button" className="back-link" onClick={onBack}>
        ← Back
      </button>
    </div>
  );
}

// ── Subcomponent: Role picker ─────────────────────────────────────────────
function RolePicker({ onPick }) {
  return (
    <div className="role-picker">
      <p className="role-picker-title">I am registering as:</p>
      <div className="role-picker-cards">
        <button
          type="button"
          className="role-card"
          onClick={() => onPick(ROLES.SCHOOL)}
        >
          <span className="role-card-icon">🏫</span>
          <span className="role-card-label">School Based</span>
        </button>
        <button
          type="button"
          className="role-card"
          onClick={() => onPick(ROLES.DIVISION)}
        >
          <span className="role-card-icon">🏢</span>
          <span className="role-card-label">SDO Based</span>
        </button>
      </div>
      <button type="button" className="back-link" onClick={() => onPick(null)}>
        ← Back to Sign In
      </button>
    </div>
  );
}

// ── Subcomponent: Forgot Password ─────────────────────────────────────────
function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "http://localhost:5173/reset-password",
    });

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Password reset link has been sent to your email.");
  }

  return (
    <form className="reg-form" onSubmit={handleReset}>
      <h3>Forgot Password</h3>

      <div className="login-field">
        <label className="form-label">DepEd Email</label>
        <input
          className="form-input login-input"
          type="email"
          placeholder="Enter your registered email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      {error && <div className="login-error">{error}</div>}

      {message && (
        <div
          style={{
            color: "#15803d",
            marginBottom: "10px",
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          {message}
        </div>
      )}

      <button type="submit" className="login-btn">
        Send Reset Link
      </button>

      <button type="button" className="back-link" onClick={onBack}>
        ← Back to Login
      </button>
    </form>
  );
}

// ── Subcomponent: Register form ───────────────────────────────────────────
function RegisterForm({ role, onSuccess, onBack }) {
  const isSchool = role === ROLES.SCHOOL;
  const positions = isSchool ? SCHOOL_POSITIONS : DIVISION_POSITIONS;

  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    middleInitial: "",
    email: "",
    position: positions[0],
    username: "",
    usernameTouched: false,
    password: "",
    confirmPw: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const upd = (field, val) => {
    setForm((f) => ({ ...f, [field]: val }));
    setError("");
  };

  const suggestedUser = suggestUsername(form.firstName, form.lastName);

  useEffect(() => {
    if (!form.usernameTouched) return;
    const finalUsername = form.username.trim();
    if (!finalUsername) {
      setError("Username is required.");
      return;
    }
    if (!/^[a-zA-Z0-9._]+$/.test(finalUsername)) {
      setError(
        "Username can only contain letters, numbers, dots and underscores.",
      );
      return;
    }
    setError("");
  }, [suggestedUser, form.username, form.usernameTouched]);

  async function handleRegister(e) {
    e.preventDefault();
    const finalUsername = form.username.trim();
    const normalizedEmail = form.email.trim().toLowerCase();

    if (!form.lastName.trim() || !form.firstName.trim()) {
      setError("Last name and first name are required.");
      return;
    }

    if (!form.email.trim()) {
      setError("DepEd Email is required.");
      return;
    }

    const isCreatorSdo = role === ROLES.DIVISION && normalizedEmail === CREATOR_SDO_EMAIL;
    const isCreatorSchool = role === ROLES.SCHOOL && normalizedEmail === CREATOR_SCHOOL_EMAIL;

    if (
      !normalizedEmail.endsWith("@deped.gov.ph") &&
      !isCreatorSdo &&
      !isCreatorSchool
    ) {
      setError("Registration requires an official @deped.gov.ph email address.");
      return;
    }

    if (!finalUsername) {
      setError("Username is required.");
      return;
    }

    const normalizedUsername = finalUsername.toLowerCase();
    if (normalizedUsername === "admin1" && !isCreatorSdo) {
      setError("The admin1 username is reserved for the system creator's SDO account.");
      return;
    }
    if (normalizedUsername === "admin" && !isCreatorSchool) {
      setError("The admin username is reserved for the system creator's School-Based account.");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (form.password !== form.confirmPw) {
      setError("Passwords do not match.");
      return;
    }

    try {
      if (!isCreatorSdo && !isCreatorSchool) {
        const { data: allowed, error: allowError } = await supabase.rpc(
          "is_app_email_allowed",
          { app_key: "bmi", candidate_email: normalizedEmail },
        );

        if (allowError || !allowed) {
          setError(
            "Email not authorized to register. Contact your administrator.",
          );
          return;
        }
      }

      const fullName = buildFullName(
        form.lastName,
        form.firstName,
        form.middleInitial,
      );

      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: form.password,
        options: {
          data: {
            username: finalUsername,
            lastname: form.lastName.trim(),
            firstname: form.firstName.trim(),
            middleinitial: form.middleInitial.trim(),
            fullname: fullName,
            role,
            position: form.position,
          },
        },
      });

      if (error) {
        console.error("SIGNUP ERROR", error);
        setError(error.message);
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    }
  }

  if (success) {
    return (
      <div className="reg-success">
        <div className="reg-success-icon">✅</div>
        <h3>Registration Successful!</h3>
        <p>Your account has been created.</p>
        <div className="reg-success-creds">
          <span>Username:</span>
          <strong>{form.username}</strong>
        </div>
        <p className="reg-success-hint">
          Please remember your username and password.
        </p>
        <button type="button" className="login-btn" onClick={onSuccess}>
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <form className="reg-form" onSubmit={handleRegister}>
      <div className="reg-role-banner">
        <span>{isSchool ? "🏫" : "🏥"}</span>
        <span>{isSchool ? "School Based" : "SDO Based"} Registration</span>
      </div>

      <div className="reg-name-grid">
        <div className="login-field">
          <label className="form-label">
            Last Name <span className="req">*</span>
          </label>
          <input
            className="form-input login-input"
            placeholder="e.g. Santos"
            value={form.lastName}
            onChange={(e) => upd("lastName", e.target.value)}
            required
          />
        </div>
        <div className="login-field">
          <label className="form-label">
            First Name <span className="req">*</span>
          </label>
          <input
            className="form-input login-input"
            placeholder="e.g. Maria"
            value={form.firstName}
            onChange={(e) => upd("firstName", e.target.value)}
            required
          />
        </div>
        <div className="login-field mi-field">
          <label className="form-label">
            M.I. <span className="optional">(optional)</span>
          </label>
          <input
            className="form-input login-input"
            placeholder="A"
            maxLength={2}
            value={form.middleInitial}
            onChange={(e) => upd("middleInitial", e.target.value)}
          />
        </div>
      </div>

      <div className="login-field">
        <label className="form-label">
          DepEd Email <span className="req">*</span>
        </label>
        <input
          className="form-input login-input"
          type="email"
          value={form.email}
          onChange={(e) => upd("email", e.target.value)}
          required
        />
      </div>

      {isSchool && (
        <div className="login-field">
          <label className="form-label">
            Position <span className="req">*</span>
          </label>
          <select
            className="form-input login-input form-select"
            value={form.position}
            onChange={(e) => upd("position", e.target.value)}
          >
            {positions.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      <div className="login-field">
        <label className="form-label">
          Username <span className="req">*</span>
          <span className="optional"> (auto-filled, you can change this)</span>
        </label>
        <input
          className="form-input login-input"
          placeholder="e.g. msantos"
          value={form.username}
          onChange={(e) => {
            const val = e.target.value.replace(/\s/g, "");
            setForm((f) => ({ ...f, username: val, usernameTouched: true }));
            setError("");
          }}
          required
        />
      </div>

      <div className="login-field">
        <label className="form-label">
          Password <span className="req">*</span>
        </label>
        <div className="pw-wrap">
          <input
            className="form-input login-input"
            type={showPw ? "text" : "password"}
            placeholder="At least 6 characters"
            value={form.password}
            onChange={(e) => upd("password", e.target.value)}
            required
          />
          <button
            type="button"
            className="pw-toggle"
            onClick={() => setShowPw((v) => !v)}
            tabIndex={-1}
          >
            {showPw ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      <div className="login-field">
        <label className="form-label">
          Confirm Password <span className="req">*</span>
        </label>
        <input
          className="form-input login-input"
          type="password"
          placeholder="Re-enter your password"
          value={form.confirmPw}
          onChange={(e) => upd("confirmPw", e.target.value)}
          required
        />
      </div>

      {error && <div className="login-error">{error}</div>}

      <button type="submit" className="login-btn">
        Register
      </button>
      <button type="button" className="back-link" onClick={onBack}>
        ← Back
      </button>
    </form>
  );
}

// ── Main Login component ──────────────────────────────────────────────────
export default function Login({
  onLogin,
  onAdminLogin,
  onAdminAudit,
  startView = "login",
}) {
  const [view, setView] = useState(startView);
  const [regRole, setRegRole] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const logoClickCount = useRef(0);
  const logoClickTimer = useRef(null);

  function handleLogoClick() {
    logoClickCount.current += 1;
    if (logoClickCount.current >= SECRET_LOGO_CLICKS) {
      logoClickCount.current = 0;
      clearTimeout(logoClickTimer.current);
      setView("secret-admin");
      return;
    }
    clearTimeout(logoClickTimer.current);
    logoClickTimer.current = setTimeout(() => {
      logoClickCount.current = 0;
    }, SECRET_LOGO_CLICK_WINDOW_MS);
  }

  // Track both active and previous slide index for seamless overlay transitions
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const [prevBgIndex, setPrevBgIndex] = useState(null);

  const usernameInputRef = useRef(null);

  // Preload background images into browser cache to eliminate initial load white/blank spots
  useEffect(() => {
    BG_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // Background Slideshow Timer (cycles every 5 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBgIndex((prevIndex) => {
        setPrevBgIndex(prevIndex);
        return (prevIndex + 1) % BG_IMAGES.length;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (view !== "login") return;

    const focusUsername = () => {
      if (
        document.activeElement &&
        document.activeElement !== document.body &&
        document.activeElement !== usernameInputRef.current
      ) {
        return;
      }
      usernameInputRef.current?.focus();
    };

    const t = setTimeout(focusUsername, 50);
    window.addEventListener("focus", focusUsername);

    return () => {
      clearTimeout(t);
      window.removeEventListener("focus", focusUsername);
    };
  }, [view]);

  useEffect(() => {
    window.electronAPI?.forceRefocusWindow?.();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();

    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);
    setError("");

    const identifier = username.trim().toLowerCase();
    let email = identifier;
    let lookupError;
    try {
      if (!identifier.includes("@")) {
        ({ data: email, error: lookupError } = await supabase.rpc(
          "get_email_by_username",
          { lookup_username: identifier },
        ));
        if (!email && identifier === "admin") {
          ({ data: email, error: lookupError } = await supabase.rpc(
            "dashboard_login_email",
            { candidate_username: identifier },
          ));
        }
      }
    } catch (networkErr) {
      return attemptOfflineFallback(networkErr);
    }

    if (lookupError) {
      if (isNetworkish(lookupError)) return attemptOfflineFallback(lookupError);
      setLoading(false);
      setError("Invalid username or password.");
      return;
    }

    if (!email) {
      const normalizedUsername = username.trim();

      // A completed remote lookup is authoritative: remove an account that
      // no longer exists in Supabase from both offline caches.
      deleteOfflineCredentials(normalizedUsername);
      try {
        await window.sqlite?.deleteLocalProfile?.({
          username: normalizedUsername,
        });
      } catch (deleteError) {
        console.error("Failed deleting stale local profile:", deleteError);
      }

      setLoading(false);
      setError("Invalid username or password.");
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (isNetworkish(error)) return attemptOfflineFallback(error);
        setLoading(false);
        setError("Invalid username or password.");
        return;
      }

      const { error: ownerAccessError } = await supabase.rpc(
        "ensure_owner_app_access",
        { app_key: "bmi" },
      );
      if (ownerAccessError) {
        setLoading(false);
        await supabase.auth.signOut();
        setError("Could not verify application access. Please try again.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("bmi_profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      setLoading(false);

      if (!profile && (!profileError || profileError.code === "PGRST116")) {
        const normalizedUsername = username.trim();
        deleteOfflineCredentials(normalizedUsername);
        try {
          await window.sqlite?.deleteLocalProfile?.({
            id: data.user.id,
            email,
            username: normalizedUsername,
          });
        } catch (deleteError) {
          console.error("Failed deleting stale local profile:", deleteError);
        }
        await supabase.auth.signOut();
        setError("This account no longer exists.");
        return;
      }

      if (profileError || !profile) {
        setError(
          "Signed in, but couldn't load your profile. Please try again.",
        );
        return;
      }

      const session = {
        ...data.user,
        ...profile,
      };

      saveSession(session);
      cacheOfflineCredentials(session, password);
      onLogin(session);
    } catch (err) {
      return attemptOfflineFallback(err);
    }

    function isNetworkish(err) {
      const msg = (err?.message || "").toLowerCase();
      return (
        err?.name === "TypeError" ||
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("failed to fetch") ||
        msg.includes("load failed")
      );
    }

    function attemptOfflineFallback(originalErr) {
      const cachedProfile = attemptOfflineLogin(username.trim(), password);
      setLoading(false);

      if (cachedProfile) {
        const session = {
          ...cachedProfile,
          loginTime: new Date().toISOString(),
        };
        saveSession(session);
        onLogin(session);
        return;
      }

      if (hasOfflineCredentials(username.trim())) {
        setError("Incorrect password.");
      } else if (navigator.onLine === false) {
        setError(
          "Offline access is not active for this account yet. Connect to the internet and sign in once to enable offline login on this device.",
        );
      } else {
        setError(
          "Unable to connect to the online account service. Check your internet connection and sign in once to enable offline login on this device.",
        );
      }
      console.warn("Falling back to offline login due to:", originalErr);
    }
  }

  function handlePickRole(role) {
    if (!role) {
      setView("login");
      return;
    }
    setRegRole(role);
    setView("register");
  }

  return (
    <div className="login-screen">
      {/* Dynamic Continuous Animated Background Slider */}
      <div className="login-bg-slider">
        {BG_IMAGES.map((imgUrl, index) => {
          let slideClass = "login-bg-slide";
          if (index === currentBgIndex) slideClass += " active";
          else if (index === prevBgIndex) slideClass += " prev";

          return (
            <div
              key={index}
              className={slideClass}
              style={{ backgroundImage: `url(${imgUrl})` }}
            />
          );
        })}
        {/* Dark Teal Gradient Overlay */}
        <div className="login-bg-overlay" />
      </div>

      {/* Main Login/Register Card */}
      <div
        className={`login-card ${view === "register" ? "register-card" : ""}`}
      >
        <div className="login-header">
          <div className="login-logo" onClick={handleLogoClick}>
            <img src={logo} alt="OK sa DepEd Logo" className="login-logo-img" />
          </div>
          <h1 className="login-title">School-Based Feeding Program</h1>
          <p className="login-sub">Nutritional Status System</p>
        </div>

        {/* Sign In View (Kept As Is) */}
        {view === "login" && (
          <>
            <form className="login-form" onSubmit={handleLogin}>
              <div className="login-field">
                <label className="form-label">Username or email</label>
                <input
                  className="form-input login-input"
                  placeholder="Enter username or email"
                  value={username}
                  ref={usernameInputRef}
                  autoComplete="username"
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError("");
                  }}
                  required
                />
              </div>
              <div className="login-field">
                <label className="form-label">Password</label>
                <div className="pw-wrap">
                  <input
                    className="form-input login-input"
                    type={showPw ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    autoComplete="current-password"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPw((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPw ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              {error && <div className="login-error">{error}</div>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
            <button
              type="button"
              className="register-link-btn"
              onClick={() => setView("pick-role")}
            >
              Register here
            </button>
            <div className="forgot-password-wrap">
              <button
                type="button"
                className="forgot-password-btn"
                onClick={() => setView("forgot-password")}
              >
                Forgot Password?
              </button>
            </div>

            <div className="login-offline-hint">
              💡 You can sign in without internet once you've signed in
              successfully online on this device before.
            </div>
          </>
        )}

        {view === "pick-role" && <RolePicker onPick={handlePickRole} />}

        {/* Only Register Form uses the internal scroll container */}
        {view === "register" && (
          <div className="login-body">
            <RegisterForm
              role={regRole}
              onSuccess={() => setView("login")}
              onBack={() => setView("pick-role")}
            />
          </div>
        )}

        {view === "forgot-password" && (
          <ForgotPassword onBack={() => setView("login")} />
        )}

        {view === "secret-admin" && (
          <SecretAdminLogin
            onSuccess={() => setView("secret-menu")}
            onBack={() => setView("login")}
          />
        )}

        {view === "secret-menu" && (
          <SecretAdminMenu
            onManageUsers={onAdminLogin}
            onAudit={() => setView("secret-audit")}
            onSignOut={async () => {
              await supabase.auth.signOut();
              setView("login");
            }}
          />
        )}

        {view === "secret-audit" && (
          <AuditPicker
            onConfirm={onAdminAudit}
            onBack={() => setView("secret-menu")}
          />
        )}
      </div>

      {/* Ultra-Subtle Watermark Text */}
      <div className="login-bg-text">Jaybhee Bazan</div>
    </div>
  );
}

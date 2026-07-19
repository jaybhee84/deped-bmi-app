import React, { useState, useRef, useEffect } from "react";
import {
  buildFullName,
  suggestUsername,
  ROLES,
  SCHOOL_POSITIONS,
  DIVISION_POSITIONS,
  saveSession,
  cacheOfflineCredentials,
  attemptOfflineLogin,
  hasOfflineCredentials,
} from "../utils/auth";
import { supabase } from "../utils/supabase";
import "./Login.css";
import logo from "../images/ok-sa-deped.png";

console.log("Logo:", logo);

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
          <span className="role-card-icon">🏥</span>
          <span className="role-card-label">SDO Based</span>
        </button>
      </div>
      <button type="button" className="back-link" onClick={() => onPick(null)}>
        ← Back to Sign In
      </button>
    </div>
  );
}

//---Forgot Password--------
function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleReset(e) {
    e.preventDefault(); // Prevents page reload on Enter press
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
    // CHANGED TO <form>
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
        <div style={{ color: "green", marginBottom: "10px" }}>{message}</div>
      )}

      {/* CHANGED TO type="submit" */}
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

  React.useEffect(() => {
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
  }, [suggestedUser]);

  async function handleRegister(e) {
    e.preventDefault(); // Prevents page reload on Enter press
    const finalUsername = form.username.trim();

    if (!form.lastName.trim() || !form.firstName.trim()) {
      setError("Last name and first name are required.");
      return;
    }

    if (!form.email.trim()) {
      setError("DepEd Email is required.");
      return;
    }

    if (!finalUsername) {
      setError("Username is required.");
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
      const fullName = buildFullName(
        form.lastName,
        form.firstName,
        form.middleInitial,
      );

      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (error) {
        console.error("SIGNUP ERROR", error);
        setError(error.message);
        return;
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        username: finalUsername,
        email: form.email,
        lastname: form.lastName,
        firstname: form.firstName,
        middleinitial: form.middleInitial,
        fullname: fullName,
        role,
        position: form.position,
      });

      if (profileError) {
        console.error("PROFILE ERROR", profileError);
        setError(profileError.message);
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
    // CHANGED TO <form>
    <form className="reg-form" onSubmit={handleRegister}>
      <div className="reg-role-banner">
        <span>{isSchool ? "🏫" : "🏥"}</span>
        <span>{isSchool ? "School Based" : "SDO Based"} Registration</span>
      </div>

      {/* Name fields */}
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

      {/* Password */}
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

      {/* CHANGED TO type="submit" */}
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
export default function Login({ onLogin }) {
  const [view, setView] = useState("login");
  const [regRole, setRegRole] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const usernameInputRef = useRef(null);

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

    if (!navigator.onLine) {
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
      } else {
        setError(
          "You're offline, and this account hasn't signed in on this device before. Connect to the internet to sign in for the first time.",
        );
      }
      return;
    }

    try {
      // Look up the email for this username via a secure RPC call.
      // (Direct SELECTs against `profiles` are blocked for anonymous
      // users by RLS, so this has to go through the function instead.)
      const { data: email, error: lookupError } = await supabase.rpc(
        "get_email_by_username",
        { lookup_username: username.trim() },
      );

      if (lookupError || !email) {
        setLoading(false);
        setError("Invalid username or password.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        setError("Invalid username or password.");
        return;
      }

      // Now that we're authenticated, RLS allows fetching the full profile.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      setLoading(false);

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
      setLoading(false);
      setError(err.message);
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
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img src={logo} alt="OK sa DepEd Logo" className="login-logo-img" />
          </div>
          <h1 className="login-title">School-Based Feeding Program</h1>
          <p className="login-sub">Nutritional Status System</p>
        </div>

        {view === "login" && (
          <>
            <form className="login-form" onSubmit={handleLogin}>
              <div className="login-field">
                <label className="form-label">Username</label>
                <input
                  className="form-input login-input"
                  placeholder="Enter your Username"
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

            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                background: "#F3F4F6",
                border: "1px solid #E5E7EB",
                borderRadius: 8,
                color: "#6B7280",
                fontSize: 12.5,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              💡 You can sign in without internet once you've signed in
              successfully online on this device before.
            </div>
          </>
        )}

        {view === "pick-role" && <RolePicker onPick={handlePickRole} />}

        {view === "register" && (
          <RegisterForm
            role={regRole}
            onSuccess={() => setView("login")}
            onBack={() => setView("pick-role")}
          />
        )}

        {view === "forgot-password" && (
          <ForgotPassword onBack={() => setView("login")} />
        )}
      </div>

      <div className="login-bg-text">Jaybhee Bazan</div>
    </div>
  );
}

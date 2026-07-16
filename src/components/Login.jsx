import React, { useState, useRef, useEffect } from 'react';
import {
  buildFullName,
  suggestUsername,
  ROLES,
  SCHOOL_POSITIONS,
  DIVISION_POSITIONS,
} from '../utils/auth';
import {
  saveSession,
  cacheOfflineCredentials,
  attemptOfflineLogin,
  hasOfflineCredentials,
} from '../utils/auth';
import { supabase } from '../utils/supabase';
import './Login.css';
import logo from '../images/ok-sa-deped.png';
console.log('Logo:', logo);


// ── Subcomponent: Role picker ─────────────────────────────────────────────
function RolePicker({ onPick }) {
  return (
    <div className="role-picker">
      <p className="role-picker-title">I am registering as:</p>
      <div className="role-picker-cards">
        <button className="role-card" onClick={() => onPick(ROLES.SCHOOL)}>
          <span className="role-card-icon">🏫</span>
          <span className="role-card-label">School Based</span>
        </button>
        <button className="role-card" onClick={() => onPick(ROLES.DIVISION)}>
          <span className="role-card-icon">🏥</span>
          <span className="role-card-label">SDO Based</span>
        </button>
      </div>
      <button className="back-link" onClick={() => onPick(null)}>← Back to Sign In</button>
    </div>
  );
}
//---Forgot Password--------
function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleReset() {
    setError('');
    setMessage('');

    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: 'http://localhost:5173/reset-password',
      }
    );

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(
      'Password reset link has been sent to your email.'
    );
  }

  return (
    <div className="reg-form">
      <h3>Forgot Password</h3>

      <div className="login-field">
        <label className="form-label">
          DepEd Email
        </label>

        <input
          className="form-input login-input"
          type="email"
          placeholder="Enter your registered email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {error && (
        <div className="login-error">{error}</div>
      )}

      {message && (
        <div
          style={{
            color: 'green',
            marginBottom: '10px',
          }}
        >
          {message}
        </div>
      )}

      <button
        className="login-btn"
        onClick={handleReset}
      >
        Send Reset Link
      </button>

      <button
        className="back-link"
        onClick={onBack}
      >
        ← Back to Login
      </button>
    </div>
  );
}
// ── Subcomponent: Register form ───────────────────────────────────────────
function RegisterForm({ role, onSuccess, onBack }) {
  const isSchool = role === ROLES.SCHOOL;
  const positions = isSchool ? SCHOOL_POSITIONS : DIVISION_POSITIONS;

 const [form, setForm] = useState({
  lastName:      '',
  firstName:     '',
  middleInitial: '',
  email: '',
  position:      positions[0],
  username:      '',
  usernameTouched: false,
  password:      '',
  confirmPw:     '',
});
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const upd = (field, val) => { setForm(f => ({ ...f, [field]: val })); setError(''); };

// Auto-suggest username from name, but allow editing
const suggestedUser = suggestUsername(form.firstName, form.lastName);

// Sync suggested username into form when name changes
React.useEffect(() => {
  const finalUsername = form.username.trim();
if (!finalUsername) {
  setError('Username is required.'); return;
}
if (!/^[a-zA-Z0-9._]+$/.test(finalUsername)) {
  setError('Username can only contain letters, numbers, dots and underscores.'); return;
}
}, [suggestedUser]);

  async function handleRegister() {
  const finalUsername = form.username.trim();

  if (!form.lastName.trim() || !form.firstName.trim()) {
    setError('Last name and first name are required.');
    return;
  }

  if (!form.email.trim()) {
    setError('DepEd Email is required.');
    return;
  }

  if (!finalUsername) {
    setError('Username is required.');
    return;
  }

  if (form.password.length < 6) {
    setError('Password must be at least 6 characters.');
    return;
  }

  if (form.password !== form.confirmPw) {
    setError('Passwords do not match.');
    return;
  }

  try {
    const fullName = buildFullName(
      form.lastName,
      form.firstName,
      form.middleInitial
    );

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (error) {
  console.error('SIGNUP ERROR', error);
  setError(error.message);
  return;
}

    const { error: profileError } = await supabase
  .from('profiles')
  .insert({
  id: data.user.id,
  username: finalUsername,
  email: form.email,
  lastname: form.lastName,
  firstname: form.firstName,
  middleinitial: form.middleInitial,
  fullname: fullName,
  role,
  position: form.position,
})

    if (profileError) {
  console.error('PROFILE ERROR', profileError);
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
        <p className="reg-success-hint">Please remember your username and password.</p>
        <button className="login-btn" onClick={onSuccess}>Go to Sign In</button>
      </div>
    );
  }

  return (
    <div className="reg-form">
      <div className="reg-role-banner">
        <span>{isSchool ? '🏫' : '🏥'}</span>
        <span>{isSchool ? 'School Based' : 'SDO Based'} Registration</span>
      </div>

      {/* Name fields */}
      <div className="reg-name-grid">
        <div className="login-field">
          <label className="form-label">Last Name <span className="req">*</span></label>
          <input className="form-input login-input" placeholder="e.g. Santos"
            value={form.lastName} onChange={e => upd('lastName', e.target.value)} />
        </div>
        <div className="login-field">
          <label className="form-label">First Name <span className="req">*</span></label>
          <input className="form-input login-input" placeholder="e.g. Maria"
            value={form.firstName} onChange={e => upd('firstName', e.target.value)} />
        </div>
        <div className="login-field mi-field">
          <label className="form-label">M.I. <span className="optional">(optional)</span></label>
          <input className="form-input login-input" placeholder="A"
            maxLength={2}
            value={form.middleInitial} onChange={e => upd('middleInitial', e.target.value)} />
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
    onChange={e => upd('email', e.target.value)}
  />
</div>
      {/* Position — school only */}
      {isSchool && (
        <div className="login-field">
          <label className="form-label">Position <span className="req">*</span></label>
          <select className="form-input login-input form-select"
            value={form.position} onChange={e => upd('position', e.target.value)}>
            {positions.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}

      {/* Username — editable, auto-filled from name */}
<div className="login-field">
  <label className="form-label">
    Username <span className="req">*</span>
    <span className="optional"> (auto-filled, you can change this)</span>
  </label>
  <input
    className="form-input login-input"
    placeholder="e.g. msantos"
    value={form.username}
    onChange={e => {
      const val = e.target.value.replace(/\s/g, '');
      setForm(f => ({ ...f, username: val, usernameTouched: true }));
      setError('');
    }}
  />
</div>

      {/* Password */}
      <div className="login-field">
        <label className="form-label">Password <span className="req">*</span></label>
        <div className="pw-wrap">
          <input className="form-input login-input" type={showPw ? 'text' : 'password'}
            placeholder="At least 6 characters"
            value={form.password} onChange={e => upd('password', e.target.value)} />
          <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
            {showPw ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      <div className="login-field">
        <label className="form-label">Confirm Password <span className="req">*</span></label>
        <input className="form-input login-input" type="password"
          placeholder="Re-enter your password"
          value={form.confirmPw} onChange={e => upd('confirmPw', e.target.value)} />
      </div>
      {error && <div className="login-error">{error}</div>}
      <button className="login-btn" onClick={handleRegister}>Register</button>
      <button className="back-link" onClick={onBack}>← Back</button>
    </div>
  );
}
// ── Main Login component ──────────────────────────────────────────────────
export default function Login({ onLogin }) {
  // view: 'login' | 'pick-role' | 'register'
  const [view,     setView]    = useState('login');
  const [regRole,  setRegRole] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]   = useState('');
  const [loading,  setLoading] = useState(false);
  const [showPw,   setShowPw]  = useState(false);

  const usernameInputRef = useRef(null);

  // ── Focus recovery ──────────────────────────────────────────────────────
  // Fixes: "after logging out and returning to this screen, clicking the
  // username/password field does nothing — only Tab focuses it."
  //
  // Root cause: this is a known Electron/Chromium quirk. When this screen
  // remounts (e.g. right after logout), the very first click a user makes
  // can get consumed by Chromium as a "reactivate the window" click rather
  // than also focusing the DOM element underneath the cursor. Tab always
  // works because keyboard navigation only runs once the window already
  // has focus. Relying on React's `autoFocus` (which calls .focus() the
  // instant the input mounts) can race with that window-activation state
  // and leave things half-focused.
  //
  // Fix: focus the field manually on a short delay after mount (letting
  // the window settle first), and again whenever the OS window regains
  // focus while nothing on the page is actually focused.
  useEffect(() => {
    if (view !== 'login') return;

    const focusUsername = () => {
      // Don't steal focus from a field the user is already using.
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
    window.addEventListener('focus', focusUsername);

    return () => {
      clearTimeout(t);
      window.removeEventListener('focus', focusUsername);
    };
  }, [view]);

  // One-time backup for the Windows/Electron keyboard-focus-stuck bug
  // (see App.jsx handleLogout for the primary fix). Only fires once when
  // this screen first mounts, so it won't fight with normal typing.
  useEffect(() => {
    window.electronAPI?.forceRefocusWindow?.();
  }, []);

  async function handleLogin(e) {
  e.preventDefault();

  if (!username.trim() || !password) {
    setError('Please enter your username and password.');
    return;
  }

  setLoading(true);
  setError('');

  // ── Offline path ──────────────────────────────────────────────────
  // No internet: skip Supabase entirely and check this device's local
  // cache, which is only populated after a previous successful online
  // login for this exact username.
  if (!navigator.onLine) {
    const cachedProfile = attemptOfflineLogin(username.trim(), password);
    setLoading(false);

    if (cachedProfile) {
      const session = { ...cachedProfile, loginTime: new Date().toISOString() };
      saveSession(session);
      onLogin(session);
      return;
    }

    if (hasOfflineCredentials(username.trim())) {
      setError('Incorrect password.');
    } else {
      setError(
        "You're offline, and this account hasn't signed in on this device before. Connect to the internet to sign in for the first time."
      );
    }
    return;
  }

  // ── Online path ───────────────────────────────────────────────────
  try {
    const { data: profile, error: profileError } =
      await supabase
        .from('profiles')
        .select('*')
        .eq('username', username.trim())
        .single();

    if (profileError || !profile) {
      setLoading(false);
      setError('Invalid username or password.');
      return;
    }

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });

    setLoading(false);

    if (error) {
      setError('Invalid username or password.');
      return;
    }

    const session = {
      ...data.user,
      ...profile,
    };

    saveSession(session);

    // Cache these credentials so this same account can sign back in on
    // this device even without internet next time.
    cacheOfflineCredentials(session, password);

    onLogin(session);

  } catch (err) {
    setLoading(false);
    setError(err.message);
  }
}
  function handlePickRole(role) {
    if (!role) { setView('login'); return; }
    setRegRole(role);
    setView('register');
  }

  return (
    <div className="login-screen">
      <div className="login-card">

        {/* Header — always visible */}
        <div className="login-header">
  <div className="login-logo">
  <img
    src={logo}
    alt="OK sa DepEd Logo"
    className="login-logo-img"
  />
</div>
          <h1 className="login-title">School-Based Feeding Program</h1>
          <p className="login-sub">Nutritional Status System</p>
        </div>

        {/* ── Login view ── */}
        {view === 'login' && (
          <>
            <form className="login-form" onSubmit={handleLogin}>
              <div className="login-field">
                <label className="form-label">Username</label>
                <input className="form-input login-input" placeholder="Enter your Username"
                  value={username} ref={usernameInputRef} autoComplete="username"
                  onChange={e => { setUsername(e.target.value); setError(''); }} />
              </div>
              <div className="login-field">
                <label className="form-label">Password</label>
                <div className="pw-wrap">
                  <input className="form-input login-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password} autoComplete="current-password"
                    onChange={e => { setPassword(e.target.value); setError(''); }} />
                  <button type="button" className="pw-toggle"
                    onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              {error && <div className="login-error">{error}</div>}
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            <button className="register-link-btn" onClick={() => setView('pick-role')}>
              Register here
            </button>
            <div className="forgot-password-wrap">
              <button
                type="button"
                className='forgot-password-btn'
                onClick={() => setView('forgot-password')}
                >
                  Forgot Password?
                </button>
            </div>
            
            
          </>
        )}

        {/* ── Role picker view ── */}
        {view === 'pick-role' && (
          <RolePicker onPick={handlePickRole} />
        )}

        {/* ── Register form view ── */}
        {view === 'register' && (
          <RegisterForm
            role={regRole}
            onSuccess={() => setView('login')}
            onBack={() => setView('pick-role')}
          />
        )}
        {view === 'forgot-password' && (
  <ForgotPassword
    onBack={() => setView('login')}
  />
)}

      </div>

      {view === 'login' && (
        <div
          style={{
            maxWidth: 380,
            margin: '12px auto 0',
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 8,
            color: '#6B7280',
            fontSize: 12.5,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          💡 You can sign in without internet once you've signed in
          successfully online on this device before.
        </div>
      )}

      <div className="login-bg-text">Jaybhee Bazan</div>
    </div>
  );
}

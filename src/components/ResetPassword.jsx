import { useState } from 'react';
import { supabase } from '../utils/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function updatePassword() {
    if (saving) return;
    if (password.length < 12 || password !== confirm) {
      setMessage('Use at least 12 characters and enter the same password twice.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setMessage(error.message); return; }
      setMessage('Password updated successfully.');
      await supabase.auth.signOut();
    } catch { setMessage('Unable to update your password. Request a new recovery link and try again.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="login-card">
      <h2>Reset Password</h2>

      <input
        type="password"
        aria-label="New password"
        autoComplete="new-password"
        className="form-input"
        placeholder="New Password"
        value={password}
        onChange={(e) =>
          setPassword(e.target.value)
        }
      />
      <input type="password" className="form-input" aria-label="Confirm new password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} />

      <button
        className="login-btn"
        disabled={saving}
        onClick={updatePassword}
      >
        Update Password
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}

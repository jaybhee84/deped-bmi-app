import { useState } from 'react';
import { supabase } from '../utils/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function updatePassword() {
    const { error } =
      await supabase.auth.updateUser({
        password,
      });

    if (error) {
      alert(error.message);
      return;
    }

    setMessage('Password updated successfully.');
  }

  return (
    <div className="login-card">
      <h2>Reset Password</h2>

      <input
        type="password"
        className="form-input"
        placeholder="New Password"
        value={password}
        onChange={(e) =>
          setPassword(e.target.value)
        }
      />

      <button
        className="login-btn"
        onClick={updatePassword}
      >
        Update Password
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}
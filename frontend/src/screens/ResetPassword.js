import React, { useState } from 'react';
import api from '../services/api';

export default function ResetPassword({ token }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try { const result = await api.auth.resetPassword({ token, newPassword: password }); setMessage(result.message); setPassword(''); setConfirm(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f7f5f0' }}><form onSubmit={submit} style={{ width: 'min(100%, 430px)', padding: 32, display: 'grid', gap: 16, background: '#fff', borderRadius: 20, boxShadow: '0 16px 50px #3227181a' }}>
    <p style={{ margin: 0, letterSpacing: 2, fontSize: 12 }}>RECIPEBOX</p><h1 style={{ margin: 0 }}>Choose a new password</h1>
    <p style={{ margin: 0 }}>This secure reset link can only be used once and expires after 30 minutes.</p>
    <label style={{ display: 'grid', gap: 7 }}>New password<input style={fieldStyle} type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    <label style={{ display: 'grid', gap: 7 }}>Confirm new password<input style={fieldStyle} type="password" autoComplete="new-password" minLength="8" maxLength="128" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!message && <button style={buttonStyle} disabled={busy}>{busy ? 'Updating…' : 'Set new password'}</button>}
    {message && <a href="/">Return to RecipeBox sign in</a>}
  </form></main>;
}

const fieldStyle = { minHeight: 42, padding: '9px 11px', border: '1px solid #ccd4df', borderRadius: 9, font: 'inherit' };
const buttonStyle = { minHeight: 44, border: 0, borderRadius: 9, color: '#fff', background: '#5c4734', font: 'inherit', fontWeight: 700, cursor: 'pointer' };

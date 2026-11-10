import React, { useState } from 'react';
import { useApp } from '../state/AppContext';
import { tokenStore } from '../services/api';

const SECURITY_PORTAL_URL = (import.meta.env.VITE_SECURITY_PORTAL_URL || 'http://localhost:5174').replace(/\/$/, '');

/**
 * Sign in / create account.
 *
 * This screen did not exist in the Figma design (the prototype assumed an
 * already signed-in user), so it reuses the existing design tokens - cream
 * cards, brown headings, 16px radii - instead of introducing a new visual
 * language.
 */
export default function Auth({ onBack, onSuccess }) {
  const { login, register } = useApp();
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        const user = await login(email.trim(), password);
        if (user?.role === 'security_admin') {
          const token = tokenStore.get();
          if (token) {
            window.location.assign(`${SECURITY_PORTAL_URL}/#securityToken=${encodeURIComponent(token)}`);
            return;
          }
        }
      } else {
        await register(name.trim(), email.trim(), password);
      }
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="canvas form-page form-page--auth" style={{ paddingBottom: 60 }}>
        {onBack && (
          <button type="button" className="back-lt" onClick={onBack} aria-label="Back">&lt;</button>
        )}

        <div className="auth-heading form-page__heading">
          <h1 className="h-title">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
          <p>{mode === 'login' ? 'Welcome back to RecipeBox' : 'Join RecipeBox to save your recipes'}</p>
        </div>

        <form className="auth-card screen-form" onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {mode === 'register' && (
            <p className="field-hint">At least 8 characters, including a letter and a number.</p>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <button type="submit" className="btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            className="btn-link"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          >
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

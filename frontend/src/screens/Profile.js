import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { api } from '../services/api';

const BASE_ROWS = [
  { id: 'favourites', emoji: '🖤', label: 'My Favourites', top: 311, labelLeft: 43 },
  { id: 'myRecipes', emoji: '📖', label: 'My Recipes', top: 384, labelLeft: 43 },
  { id: 'notifications', emoji: '🔔', label: 'Notifications', top: 457 },
  { id: 'settings', emoji: '⚙️', label: 'App Settings', top: 530 },
  { id: 'about', emoji: 'ℹ️', label: 'About RecipeBox', top: 603 },
  { id: 'blockchain', emoji: '⛓️', label: 'Blockchain verification', top: 676 },
];

const APP_SETTINGS_ROWS = [
  { emoji: '📦', label: 'Storage', top: 311, labelLeft: 43 },
  { emoji: '💡', label: 'Display', top: 384 },
  { emoji: '🔒', label: 'Security', top: 457 },
  { emoji: '🎨', label: 'Themes', top: 530 },
];

// view: 'main' | 'notifications' | 'settings' | 'about' | 'edit'
export default function Profile({ view = 'main', onOpenView, onOpenFavourites, onOpenMyRecipes, onOpenAuth, onBack, onOpenRecipe }) {
  const { user, isAuthenticated, logout, updateProfile, deleteAccount, requireAuth, favouritesCount, storageError, theme, setTheme, textScale, setTextScale } = useApp();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (view === 'edit' && user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setBio(user.bio || '');
      setMessage('');
      setError('');
    }
  }, [view, user]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await updateProfile({ name: name.trim(), email: email.trim(), bio: bio.trim() || null });
      setMessage('Profile updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const [preferences, setPreferences] = useState(null);
  const [prefError, setPrefError] = useState('');
  const [consents, setConsents] = useState({ analytics: false, marketing: false });
  const [privacyMessage, setPrivacyMessage] = useState('');
  const [privacyError, setPrivacyError] = useState('');
  const [blockchainDashboard, setBlockchainDashboard] = useState(null);
  const [blockchainDashboardError, setBlockchainDashboardError] = useState('');

  const [settingsPane, setSettingsPane] = useState('list');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => { setSettingsPane('list'); }, [view]);

  useEffect(() => {
    if (view !== 'settings' || !isAuthenticated) return;
    api.preferences.get().then((data) => setPreferences(data?.preferences || null)).catch((err) => setPrefError(err.message));
    api.privacy.consents().then((data) => {
      const values = Object.fromEntries((data?.consents || []).map((item) => [item.key, item.granted]));
      setConsents({ analytics: Boolean(values.analytics), marketing: Boolean(values.marketing) });
    }).catch((err) => setPrivacyError(err.message));
  }, [view, isAuthenticated]);

  useEffect(() => {
    if (view !== 'blockchain' || !isAuthenticated) return;
    api.blockchain.dashboard().then((data) => setBlockchainDashboard(data?.dashboard || null)).catch((err) => setBlockchainDashboardError(err.message));
  }, [view, isAuthenticated]);

  const updateConsent = async (key, granted) => {
    const previous = consents[key];
    setConsents((current) => ({ ...current, [key]: granted }));
    setPrivacyMessage('');
    setPrivacyError('');
    try {
      await api.privacy.updateConsents({ [key]: granted });
      setPrivacyMessage('Your consent choice has been saved.');
    } catch (err) {
      setConsents((current) => ({ ...current, [key]: previous }));
      setPrivacyError(err.message);
    }
  };

  const exportData = async () => {
    setPrivacyError('');
    try {
      const data = await api.privacy.export();
      const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'recipehub-personal-data.json';
      link.click();
      URL.revokeObjectURL(url);
      setPrivacyMessage('Your personal data export has been downloaded.');
    } catch (err) { setPrivacyError(err.message); }
  };

  const eraseAccount = async () => {
    const password = window.prompt('Enter your password to permanently delete your account and personal data.');
    if (!password) return;
    if (!window.confirm('Delete your account and associated personal data? This cannot be undone.')) return;
    setPrivacyError('');
    try {
      await deleteAccount(password);
      setPrivacyMessage('Your account has been deleted. Security records needed for accountability are retained in anonymised form.');
    } catch (err) { setPrivacyError(err.message); }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPwError('');
    setPwMessage('');
    if (newPassword !== confirmPassword) {
      setPwError('The new passwords do not match.');
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) {
      setPwError('New password must be at least 8 characters and include a letter and a number.');
      return;
    }
    setPwBusy(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      setPwMessage('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(err.message || 'Could not update your password.');
    } finally {
      setPwBusy(false);
    }
  };

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase() || '?';

  const Header = () => (
    <>
      {onBack && <button type="button" className="back-lt" onClick={onBack} aria-label="Back">&lt;</button>}
      <h1 className="h-title" style={{ position: 'absolute', left: 20, top: 50 }}>My Profile</h1>
      <p style={{ position: 'absolute', left: 20, top: 79, fontSize: 14, color: 'var(--muted)' }}>Manage your accounts and preferences</p>
      <div className="avatar" aria-hidden="true">{initial}</div>
      <p className="p-name">{user?.name || 'Guest'}</p>
      <p className="p-welcome">{isAuthenticated ? 'Welcome Back!' : 'Not signed in'}</p>
    </>
  );

  const securityPane = view === 'settings' && settingsPane === 'security';

  return (
    <div className="screen">
      <div className="canvas" style={{ height: view === 'settings' ? undefined : view === 'blockchain' ? 1200 : view === 'main' ? 1020 : 852 }}>
        {!securityPane && <Header />}

        {view === 'main' && (
          <>
            {isAuthenticated && (
              <p className="storage-summary" style={{ top: 229 }}>
                Saved recipes: <strong>{favouritesCount * 2} MB used</strong> · {500 - favouritesCount * 2} MB left
              </p>
            )}
            <h2 className="p-heading">Settings</h2>
            {BASE_ROWS.map((row) => (
              <button
                key={row.id}
                type="button"
                className="p-row"
                style={{ top: row.top }}
                onClick={() => {
                  if (row.id === 'favourites') return onOpenFavourites();
                  if (row.id === 'myRecipes') return onOpenMyRecipes();
                  if (row.id === 'blockchain') {
                    if (!isAuthenticated) return requireAuth();
                    return onOpenView('blockchain');
                  }
                  return onOpenView(row.id);
                }}
              >
                <span className="p-row__emoji">{row.emoji}</span>
                <span className="p-row__label" style={row.labelLeft ? { left: row.labelLeft } : undefined}>{row.label}</span>
              </button>
            ))}

            {isAuthenticated ? (
              <>
                <button type="button" className="p-row" style={{ top: 749 }} onClick={() => onOpenView('edit')}>
                  <span className="p-row__emoji">✏️</span>
                  <span className="p-row__label" style={{ left: 43 }}>Edit Profile</span>
                </button>
                <button type="button" className="p-row p-row--danger" style={{ top: 822 }} onClick={logout}>
                  <span className="p-row__emoji">🚪</span>
                  <span className="p-row__label" style={{ left: 43 }}>Sign out</span>
                </button>
              </>
            ) : (
              <button type="button" className="p-row p-row--accent" style={{ top: 749 }} onClick={onOpenAuth || requireAuth}>
                <span className="p-row__emoji">🔐</span>
                <span className="p-row__label" style={{ left: 43 }}>Sign in / Register</span>
              </button>
            )}
          </>
        )}

        {view === 'edit' && (
          <form className="auth-card screen-form profile-edit-form" onSubmit={saveProfile}>
            <label className="field">
              <span>Name</span>
              <input type="text" value={name} required minLength={2} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} required onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Bio</span>
              <textarea rows={3} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} />
            </label>
            {message && <p className="form-ok">{message}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn-primary btn-block" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        )}

        {view === 'notifications' && (
          <>
            <h2 className="p-heading">Notifications</h2>
            <p className="p-empty">No Notifications yet!!</p>
          </>
        )}

        {view === 'settings' && settingsPane === 'list' && (
          <>
            <h2 className="p-heading" style={{ left: 19 }}>App Settings</h2>
            {APP_SETTINGS_ROWS.map((row) => {
              const isSecurity = row.label === 'Security';
              const rowContent = (
                <>
                  <span className="p-row__emoji" style={{ left: row.emoji === '🔒' || row.emoji === '🎨' ? 22 : 15 }}>{row.emoji}</span>
                  <span className="p-row__label" style={row.labelLeft ? { left: row.labelLeft } : undefined}>
                    {row.label === 'Storage' ? `Storage: ${favouritesCount * 2} MB used · ${500 - favouritesCount * 2} MB left` : row.label}
                  </span>
                  {row.label === 'Display' && (
                    <div className="text-scale">
                      <input
                        type="range"
                        min="80"
                        max="140"
                        step="5"
                        value={Math.round(textScale * 100)}
                        aria-label="Enlarge text"
                        onChange={(e) => setTextScale(Number(e.target.value) / 100)}
                      />
                      <span className="text-scale__value">{Math.round(textScale * 100)}%</span>
                    </div>
                  )}
                  {row.label === 'Themes' && (
                    <div className="theme-choice" aria-label="Choose theme">
                      <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
                      <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
                    </div>
                  )}
                </>
              );
              return isSecurity ? (
                <button
                  key={row.label}
                  type="button"
                  className="p-row"
                  style={{ top: row.top }}
                  onClick={() => setSettingsPane('security')}
                >
                  {rowContent}
                </button>
              ) : (
                <div key={row.label} className="p-row" style={{ top: row.top }}>{rowContent}</div>
              );
            })}
            {storageError && <p className="p-note p-note--error" style={{ top: 590 }}>{storageError}</p>}
            {isAuthenticated && preferences && (
              <p className="p-note" style={{ top: 610 }}>
                Dietary preferences: {preferences.dietaryPreferences?.length ? preferences.dietaryPreferences.join(', ') : 'none set'}
              </p>
            )}
            {prefError && <p className="p-note p-note--error" style={{ top: 610 }}>{prefError}</p>}
            {isAuthenticated && (
              <section className="privacy-panel" aria-labelledby="privacy-title">
                <h3 id="privacy-title">Privacy &amp; your data</h3>
                <p><strong>Privacy notice:</strong> RecipeHub processes account details, recipes, saved items, ratings, reviews, cooking history and preferences to provide your account and requested features. Account data is used to perform the service; security events are used to protect accounts and investigate misuse. Optional analytics and marketing choices below are stored as consent preferences; the current app does not run advertising campaigns or an analytics service. When you register a recipe, its ID, SHA-256 content digest, version, creator wallet address and transaction metadata are public on Sepolia and cannot be erased from the chain. Recipe text and personal profile data are not sent to Ethereum. Account deletion removes your private wallet-to-account link, but the public proof remains. Account data is retained while your account is active. You can export your records, correct profile details, change optional choices or delete your account here. Contact the RecipeHub operator through the project administrator for privacy questions or a restriction/objection request.</p>
                <label><input type="checkbox" checked={consents.analytics} onChange={(event) => updateConsent('analytics', event.target.checked)} /> Optional analytics consent</label>
                <label><input type="checkbox" checked={consents.marketing} onChange={(event) => updateConsent('marketing', event.target.checked)} /> Optional marketing consent</label>
                <div className="privacy-actions">
                  <button type="button" className="btn-secondary" onClick={exportData}>Download my data</button>
                  <button type="button" className="btn-secondary privacy-delete" onClick={eraseAccount}>Delete account</button>
                </div>
                {privacyMessage && <p role="status">{privacyMessage}</p>}
                {privacyError && <p className="form-error" role="alert">{privacyError}</p>}
              </section>
            )}
            {!isAuthenticated && privacyMessage && <p className="p-note" style={{ top: 650 }} role="status">{privacyMessage}</p>}
          </>
        )}

        {securityPane && (
          <>
            <button type="button" className="back-lt" onClick={() => setSettingsPane('list')} aria-label="Back to app settings">&lt;</button>
            <h1 className="h-title" style={{ position: 'absolute', left: 20, top: 50 }}>Security</h1>
            <p style={{ position: 'absolute', left: 20, top: 79, fontSize: 14, color: 'var(--muted)' }}>Change your account password</p>
            <form className="auth-card security-form" onSubmit={changePassword}>
              <label className="field">
                <span>Current password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </label>
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>
              <p className="field-hint">At least 8 characters, including a letter and a number.</p>
              {pwMessage && <p className="form-ok" role="status">{pwMessage}</p>}
              {pwError && <p className="form-error" role="alert">{pwError}</p>}
              <button type="submit" className="btn-primary btn-block" disabled={pwBusy}>
                {pwBusy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}

        {view === 'blockchain' && (
          <>
            <h2 className="p-heading" style={{ top: 266 }}>Blockchain dashboard</h2>
            {!isAuthenticated && <p className="p-note" style={{ top: 320 }}>Sign in to view blockchain records.</p>}
            {blockchainDashboardError && <p className="p-note p-note--error" style={{ top: 320 }}>{blockchainDashboardError}</p>}
            {blockchainDashboard && (
              <section className="blockchain-dashboard">
                <p><strong>Network:</strong> Ethereum Sepolia</p>
                <p><strong>Service:</strong> {blockchainDashboard.configured ? 'Connected' : 'Waiting for operator RPC and contract configuration'}</p>
                <div className="blockchain-dashboard__stats">
                  <span>Registered recipes <strong>{blockchainDashboard.registeredRecipes}</strong></span>
                  <span>Verified now <strong>{blockchainDashboard.verifiedRecipes}</strong></span>
                  <span>Pending versions <strong>{blockchainDashboard.pendingRegistrations}</strong></span>
                  <span>Failed versions <strong>{blockchainDashboard.failedRegistrations}</strong></span>
                </div>
                <h3>Recent recipe registrations</h3>
                {!blockchainDashboard.recent.length && <p>No blockchain registration attempts yet.</p>}
                {blockchainDashboard.recent.map((item, index) => (
                  <article key={`${item.recipeId}-${item.version}-${index}`}>
                    <p><strong>{item.recipeTitle || `Recipe ${item.recipeId}`}</strong> · v{item.version} · {item.status}</p>
                    <p className="blockchain-address">SHA-256: {item.contentHash}</p>
                    {item.transactionHash && <a href={`https://sepolia.etherscan.io/tx/${item.transactionHash}`} target="_blank" rel="noreferrer">View Sepolia transaction</a>}
                    {onOpenRecipe && <button type="button" className="btn-secondary" onClick={() => onOpenRecipe(item.recipeId)}>Open recipe verification</button>}
                  </article>
                ))}
              </section>
            )}
          </>
        )}

        {view === 'about' && (
          <>
            <h2 className="p-heading" style={{ left: 19 }}>About RecipeBox</h2>
            <div className="p-about">
              <span className="p-about__emoji">ℹ️</span>
              <p className="p-about__text">
                RecipeBox is an app designed to help beginners learn how to prepare food and cooks to enhance their skills by trying out various dishes in any category they like.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

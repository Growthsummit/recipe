import React, { useCallback, useEffect, useMemo, useState } from 'react';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const TOKEN_KEY = 'recipehub.security-token';
const ROLE_LABELS = { guest: 'Guest', user: 'User', admin: 'Administrator', security_admin: 'Security Administrator' };
const ROLE_IDS = Object.keys(ROLE_LABELS);

function getInitialToken() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const handoffToken = params.get('securityToken');
  if (handoffToken) {
    sessionStorage.setItem(TOKEN_KEY, handoffToken);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
  return sessionStorage.getItem(TOKEN_KEY) || '';
}
const SETTING_LABELS = {
  password_min_length: 'Minimum password length',
  password_require_letter: 'Require a letter',
  password_require_number: 'Require a number',
  login_max_attempts: 'Failed attempts before lockout',
  lockout_minutes: 'Account lockout duration (minutes)',
  token_expiry_minutes: 'Session token lifetime (minutes)',
};

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);
  return data?.data;
}

function Table({ headers, children }) {
  return <div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export default function App() {
  const [token, setToken] = useState(getInitialToken);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const call = useCallback((path, options = {}) => request(path, { token, ...options }), [token]);

  const authenticate = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await request('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      if (result.user?.role !== 'security_admin') throw new Error('This portal is limited to Security Administrators.');
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token); setUser(result.user); setPassword('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!token) { setUser(null); return undefined; }
    let cancelled = false;
    request('/auth/me', { token }).then(({ user: current }) => {
      if (current.role !== 'security_admin') throw new Error('Security Administrator access is required.');
      if (!cancelled) setUser(current);
    }).catch((err) => {
      if (!cancelled) { setError(err.message); sessionStorage.removeItem(TOKEN_KEY); setToken(''); }
    });
    return () => { cancelled = true; };
  }, [token]);

  const signOut = async () => {
    try { await call('/auth/logout', { method: 'POST' }); } catch { /* token may already be expired */ }
    sessionStorage.removeItem(TOKEN_KEY); setToken(''); setUser(null); setNotice(''); setError('');
  };

  if (!user) return (
    <main className="login-shell">
      <form className="login-card" onSubmit={authenticate}>
        <p className="eyebrow">RECIPEHUB · SECURITY</p>
        <h1>Security Portal</h1>
        <p>Sign in with an authorised Security Administrator account.</p>
        <label>Email<input autoComplete="username" type="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input autoComplete="current-password" type="password" value={password} required onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Checking access…' : 'Sign in securely'}</button>
        <a href="http://localhost:5173" rel="noreferrer">Return to RecipeHub</a>
      </form>
    </main>
  );

  const tabLabels = { dashboard: 'Dashboard', users: 'Users & roles', permissions: 'Permissions', settings: 'Security configuration', audit: 'Audit logs', classification: 'Data classification' };
  return (
    <div className="portal">
      <header className="topbar">
        <div><p className="eyebrow">RECIPEHUB · SECURITY</p><h1>Security administration</h1></div>
        <div className="account"><span>{user.name} · {ROLE_LABELS[user.role]}</span><button type="button" onClick={signOut}>Sign out</button></div>
      </header>
      <nav className="tabs" aria-label="Security modules">
        {Object.entries(tabLabels).map(([key, label]) => <button key={key} type="button" className={tab === key ? 'selected' : ''} onClick={() => { setTab(key); setError(''); setNotice(''); }}>{label}</button>)}
      </nav>
      <main className="content">
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {tab === 'dashboard' && <Dashboard call={call} />}
        {tab === 'users' && <Users call={call} setError={setError} setNotice={setNotice} currentUserId={user.id} />}
        {tab === 'permissions' && <Permissions call={call} setError={setError} setNotice={setNotice} />}
        {tab === 'settings' && <Settings call={call} setError={setError} setNotice={setNotice} />}
        {tab === 'audit' && <Audit call={call} />}
        {tab === 'classification' && <Classification call={call} />}
      </main>
      <footer>Administrative requests are authorised and checked by the RecipeHub API on every request.</footer>
    </div>
  );
}

function Dashboard({ call }) {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { call('/admin/security/dashboard').then(({ dashboard }) => setData(dashboard)).catch((err) => setError(err.message)); }, [call]);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading security overview…</p>;
  return <>
    <h2>Security overview</h2>
    <section className="stats">
      <article><span>Accounts</span><strong>{data.users.total}</strong></article>
      <article><span>Active accounts</span><strong>{data.users.active}</strong></article>
      {data.roles.map((role) => <article key={role.role}><span>{ROLE_LABELS[role.role] || role.role}</span><strong>{role.count}</strong></article>)}
      <article><span>Failed/blocked logins recorded</span><strong>{data.failedLogins.length}</strong></article>
    </section>
    <section className="panel"><h3>Recent security events</h3><Table headers={['Time (UTC)', 'Event', 'Actor role', 'Account ID', 'Source IP']}>
      {data.recentEvents.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{row.action}</td><td>{row.actor_role || 'Guest'}</td><td>{row.user_id ?? '—'}</td><td>{row.ip_address || '—'}</td></tr>)}
      {!data.recentEvents.length && <tr><td colSpan="5">No events recorded.</td></tr>}
    </Table></section>
    <section className="panel"><h3>Failed sign-in events</h3><Table headers={['Time (UTC)', 'Event', 'Account ID', 'Source IP']}>
      {data.failedLogins.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{row.action}</td><td>{row.user_id ?? 'Unknown'}</td><td>{row.ip_address || '—'}</td></tr>)}
      {!data.failedLogins.length && <tr><td colSpan="4">No failed sign-ins recorded.</td></tr>}
    </Table></section>
    <section className="panel"><h3>Recent permission and role changes</h3><Table headers={['Time (UTC)', 'Change', 'Actor role', 'Target', 'Details']}>
      {data.permissionChanges.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{row.action}</td><td>{row.actor_role || '—'}</td><td>{row.entity_id || '—'}</td><td>{row.metadata || '—'}</td></tr>)}
      {!data.permissionChanges.length && <tr><td colSpan="5">No permission changes recorded.</td></tr>}
    </Table></section>
  </>;
}

function Users({ call, setError, setNotice, currentUserId }) {
  const [users, setUsers] = useState([]);
  const reload = useCallback(() => call('/admin/users?limit=50').then((data) => setUsers(data.items || [])), [call]);
  useEffect(() => { reload().catch((err) => setError(err.message)); }, [reload, setError]);
  const update = async (id, path, body) => {
    setError(''); setNotice('');
    try { await call(`/admin/users/${id}/${path}`, { method: 'PATCH', body }); await reload(); setNotice('User record updated. The backend applies permission changes immediately.'); }
    catch (err) { setError(err.message); }
  };
  return <><h2>Users and roles</h2><p className="subtext">Role and account changes are validated by server-side RBAC. You cannot change your own role.</p>
    <Table headers={['Name', 'Email', 'Role', 'Status', 'Last sign-in', 'Password']}>
      {users.map((item) => <tr key={item.id}>
        <td>{item.name}</td><td>{item.email}</td>
        <td><select aria-label={`Role for ${item.email}`} value={item.role} disabled={item.id === currentUserId} onChange={(event) => update(item.id, 'role', { role: event.target.value })}>
          {ROLE_IDS.filter((role) => role !== 'guest').map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
        </select></td>
        <td><button type="button" className={item.isActive ? 'small-btn' : 'small-btn warn'} disabled={item.id === currentUserId} onClick={() => update(item.id, 'active', { isActive: !item.isActive })}>{item.isActive ? 'Active · suspend' : 'Suspended · reactivate'}</button></td>
        <td>{item.lastLoginAt || 'Never'}</td>
        <td><button type="button" className="small-btn" onClick={async () => {
          setError(''); setNotice('');
          try { const result = await call(`/admin/users/${item.id}/password-reset`, { method: 'POST' }); setNotice(result.message); }
          catch (err) { setError(err.message); }
        }}>Send reset email</button></td>
      </tr>)}
    </Table>
  </>;
}

function Permissions({ call, setError, setNotice }) {
  const [records, setRecords] = useState([]); const [catalog, setCatalog] = useState([]); const [role, setRole] = useState('user');
  const reload = useCallback(() => call('/admin/role-permissions').then((data) => { setRecords(data.permissions || []); setCatalog(data.catalog || []); }), [call]);
  useEffect(() => { reload().catch((err) => setError(err.message)); }, [reload, setError]);
  const enabled = useMemo(() => new Set(records.filter((row) => row.role === role && Number(row.enabled)).map((row) => row.permission)), [records, role]);
  const save = async (permission, value) => {
    setError(''); setNotice('');
    try { await call('/admin/role-permissions', { method: 'PUT', body: { role, permission, enabled: value } }); await reload(); setNotice(`${permission} ${value ? 'enabled for' : 'disabled for'} ${ROLE_LABELS[role]}.`); }
    catch (err) { setError(err.message); }
  };
  return <><h2>Role permissions</h2><p className="subtext">These settings are stored in Turso and loaded by the API for each authenticated request.</p>
    <label className="inline-field">Role<select value={role} onChange={(event) => setRole(event.target.value)}>{ROLE_IDS.map((key) => <option value={key} key={key}>{ROLE_LABELS[key]}</option>)}</select></label>
    <section className="panel"><Table headers={['Permission key', 'Enabled']}>
      {catalog.map((permission) => <tr key={permission}><td><code>{permission}</code></td><td><input type="checkbox" checked={enabled.has(permission)} onChange={(event) => save(permission, event.target.checked)} aria-label={`${permission} for ${ROLE_LABELS[role]}`} /></td></tr>)}
    </Table></section>
    <p className="subtext">Core Security Administrator access to user management, permission management and audit logs is protected against accidental lockout.</p>
  </>;
}

function Settings({ call, setError, setNotice }) {
  const [settings, setSettings] = useState(null); const [saving, setSaving] = useState(false);
  useEffect(() => { call('/admin/security/settings').then(({ settings: value }) => setSettings(value)).catch((err) => setError(err.message)); }, [call, setError]);
  const change = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setSaving(true); setError(''); setNotice('');
    const payload = Object.fromEntries(Object.keys(SETTING_LABELS).map((key) => [key, settings[key]]));
    try { const { settings: value } = await call('/admin/security/settings', { method: 'PUT', body: payload }); setSettings(value); setNotice('Security controls saved and are active on the backend.'); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  if (!settings) return <p>Loading enforced security settings…</p>;
  return <><h2>Security configuration</h2><p className="subtext">Editable values below are enforced by authentication and session endpoints.</p>
    <section className="settings-grid">{Object.entries(SETTING_LABELS).map(([key, label]) => <label key={key}>{label}
      {typeof settings[key] === 'boolean'
        ? <input type="checkbox" checked={settings[key]} onChange={(event) => change(key, event.target.checked)} />
        : <input type="number" min={key === 'password_min_length' ? 8 : key === 'login_max_attempts' ? 3 : key === 'lockout_minutes' ? 1 : 5} max={key === 'password_min_length' ? 64 : key === 'login_max_attempts' ? 20 : key === 'lockout_minutes' ? 1440 : 43200} value={settings[key]} onChange={(event) => change(key, Number(event.target.value))} />}
    </label>)}</section>
    <button type="button" className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save enforced settings'}</button>
    <section className="panel"><h3>Enforced controls</h3><ul><li>API authentication limiter: 20 requests per IP per 15 minutes.</li><li>General API limiter: 300 requests per IP per minute.</li><li>Audit logging is always enabled; it cannot be disabled from this portal.</li><li>Passwords and tokens are never written to audit logs.</li></ul></section>
  </>;
}

function Audit({ call }) {
  const [filters, setFilters] = useState({ userId: '', action: '', from: '', to: '' }); const [items, setItems] = useState([]); const [error, setError] = useState('');
  const load = useCallback(() => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    query.set('limit', '100');
    return call(`/admin/audit-logs?${query}`).then((data) => setItems(data.items || []));
  }, [call, filters]);
  useEffect(() => { load().catch((err) => setError(err.message)); }, [load]);
  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  return <><h2>Audit logs</h2><div className="filters">
    <label>User ID<input type="number" min="1" value={filters.userId} onChange={set('userId')} /></label>
    <label>Event type<input value={filters.action} onChange={set('action')} placeholder="LOGIN_FAILED" /></label>
    <label>From<input type="date" value={filters.from} onChange={set('from')} /></label>
    <label>To<input type="date" value={filters.to} onChange={set('to')} /></label>
  </div>{error && <p className="error">{error}</p>}
  <Table headers={['Time (UTC)', 'User ID', 'Role', 'Action', 'Entity', 'Source IP', 'Metadata']}>
    {items.map((row) => <tr key={row.id}><td>{row.created_at}</td><td>{row.user_id ?? '—'}</td><td>{row.actor_role || '—'}</td><td>{row.action}</td><td>{row.entity || '—'}</td><td>{row.ip_address || '—'}</td><td>{row.metadata || '—'}</td></tr>)}
    {!items.length && <tr><td colSpan="7">No matching audit records.</td></tr>}
  </Table></>;
}

function Classification({ call }) {
  const [records, setRecords] = useState([]); const [error, setError] = useState('');
  useEffect(() => { call('/admin/data-classification').then((data) => setRecords(data.records || [])).catch((err) => setError(err.message)); }, [call]);
  return <><h2>Data classification register</h2><p className="subtext">Classification is enforced through the server permissions and storage controls described in each record.</p>
    {error && <p className="error">{error}</p>}
    <Table headers={['ID','Data item','Class','Storage','Authorised users','Protection']}>
      {records.map((record) => <tr key={record.dataId}><td>{record.dataId}</td><td title={record.description}>{record.dataName}</td><td><span className={`class-badge ${record.classification.toLowerCase()}`}>{record.classification}</span></td><td>{record.location}</td><td>{record.authorizedUsers}</td><td>{record.protectionMethod}</td></tr>)}
    </Table>
  </>;
}

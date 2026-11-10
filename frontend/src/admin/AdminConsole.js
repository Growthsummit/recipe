import React, { useEffect, useState } from 'react';
import { ACTORS, MODULES, can, setActor, getPolicy, setPermission, resetPolicy, subscribe } from '../security/rbac';
import { useApp } from '../state/AppContext';
import SecurityConfig from './SecurityConfig';
import LedgerView from './LedgerView';
import AIDashboards from './AIDashboards';
import DataGovernance from './DataGovernance';
import './admin.css';

const TABS = [
  { id: 'securityConfig', label: 'Security', Comp: SecurityConfig },
  { id: 'ledger', label: 'Ledger', Comp: LedgerView },
  { id: 'aiDashboards', label: 'AI', Comp: AIDashboards },
  { id: 'dataGovernance', label: 'Data & GDPR', Comp: DataGovernance },
];

export default function AdminConsole() {
  const { actor } = useApp();
  const [tab, setTab] = useState('securityConfig');
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  const Active = TABS.find((t) => t.id === tab).Comp;
  const allowed = can(actor, tab, 'read');

  return (
    <div className="admin">
      <header className="admin__head">
        <div>
          <h1>RecipeBox Admin</h1>
          <p>Security, ledger, AI and governance modules</p>
        </div>
        <a href="#/" onClick={() => { window.location.hash = ''; }} className="admin__link">Back to app</a>
      </header>

      <div className="admin__actor">
        <label htmlFor="actor">Acting as (simulated sign-in)</label>
        <select id="actor" value={actor} onChange={(e) => setActor(e.target.value)}>
          {ACTORS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>

      <nav className="admin__tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}{!can(actor, t.id, 'read') ? ' 🔒' : ''}
          </button>
        ))}
      </nav>

      <main className="admin__body">
        {allowed ? (
          <Active actor={actor} />
        ) : (
          <div className="a-card">
            <h2>Access denied</h2>
            <p>The <b>{ACTORS.find((a) => a.id === actor).label}</b> role has no read permission on <b>{MODULES.find((m) => m.id === tab).label}</b>. Switch role above, or ask a Security Admin to change the matrix.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export { getPolicy, setPermission, resetPolicy };

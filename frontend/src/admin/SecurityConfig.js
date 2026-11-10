import React, { useEffect, useState } from 'react';
import { ACTORS, MODULES, can, getPolicy, resetPolicy, setPermission, subscribe } from '../security/rbac';

export default function SecurityConfig({ actor }) {
  const [policy, setPolicy] = useState(getPolicy);
  const [msg, setMsg] = useState('');
  useEffect(() => subscribe(() => setPolicy(getPolicy())), []);
  const canWrite = can(actor, 'securityConfig', 'write', policy);

  const toggle = (target, mod, perm, granted) => {
    const res = setPermission(actor, target, mod, perm, granted);
    setMsg(res.ok ? '' : res.reason === 'locked' ? 'The admin role must keep access to this module (prevents lock-out).' : 'Denied: your role has no write access to Security Configuration.');
  };

  return (
    <div className="a-card">
      <h2>Security Configuration</h2>
      <p>Read (R) and write (W) permissions per actor and module. {canWrite ? 'You can edit this matrix.' : 'Read-only for your role.'}</p>
      {msg && <p className="a-warn" role="alert">{msg}</p>}
      <div className="a-scroll">
        <table className="a-table">
          <thead>
            <tr><th>Module</th>{ACTORS.map((a) => <th key={a.id} colSpan={2}>{a.label}</th>)}</tr>
            <tr><th />{ACTORS.map((a) => (<React.Fragment key={a.id}><th>R</th><th>W</th></React.Fragment>))}</tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                {ACTORS.map((a) => ['read', 'write'].map((p) => (
                  <td key={a.id + p} className="a-center">
                    <input
                      type="checkbox"
                      checked={policy[a.id][m.id].includes(p)}
                      disabled={!canWrite}
                      aria-label={`${a.label} ${p} ${m.label}`}
                      onChange={(e) => toggle(a.id, m.id, p, e.target.checked)}
                    />
                  </td>
                )))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite && <button type="button" className="a-btn" onClick={() => { resetPolicy(actor); setMsg(''); }}>Reset to defaults</button>}
      <p className="a-note">Enforcement point: favourites writes in the app are checked against this matrix (try the Guest role, then tap a heart). This is client-side only; a production system must enforce it on a server. Deploy this console on its own host (e.g. an <code>admin.</code> sub-domain) and it opens automatically; locally use <code>#/admin</code>.</p>
    </div>
  );
}

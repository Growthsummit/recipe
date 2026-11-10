import React, { useEffect, useState } from 'react';

export default function DataGovernance() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}governance/governance.json`).then((r) => r.json()).then(setData).catch(() => setErr(true));
  }, []);
  if (err) return <div className="a-card"><p>Could not load governance.json (run python governance/build_governance.py).</p></div>;
  if (!data) return <div className="a-card"><p>Loading…</p></div>;

  const score = (s) => (s === 'Compliant' ? 1 : s === 'Partially compliant' ? 0.5 : 0);
  const applicable = data.gdpr.filter((g) => g.status !== 'Not applicable');
  const pct = Math.round((applicable.reduce((a, g) => a + score(g.status), 0) / applicable.length) * 100);

  return (
    <>
      <div className="a-card">
        <h2>Data classification</h2>
        <div className="a-scroll">
          <table className="a-table">
            <thead><tr><th>ID</th><th>Data element</th><th>Level</th><th>Controls</th></tr></thead>
            <tbody>
              {data.classification.map((c) => (
                <tr key={c.id}><td>{c.id}</td><td>{c.element}</td><td><span className={`a-level a-level--${c.level}`}>{c.level}</span></td><td>{c.controls}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="a-card">
        <h2>GDPR compliance: {pct}% ({pct >= 80 ? 'High' : pct >= 50 ? 'Moderate' : 'Low'})</h2>
        <div className="a-scroll">
          <table className="a-table">
            <thead><tr><th>Article</th><th>Principle</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {data.gdpr.map((g) => (<tr key={g.article}><td>{g.article}</td><td>{g.principle}</td><td>{g.status}</td><td>{g.action}</td></tr>))}
            </tbody>
          </table>
        </div>
        <p className="a-note">Same data as RecipeBox_Cybersecurity_Governance.xlsx (the spreadsheet deliverable). Self-assessment, not legal advice.</p>
      </div>
    </>
  );
}

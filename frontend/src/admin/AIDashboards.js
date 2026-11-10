import React, { useEffect, useState } from 'react';
import { BarChart, LineChart } from './Charts';

const pct = (v) => `${(v * 100).toFixed(1)}%`;

export default function AIDashboards() {
  const [m, setM] = useState(null);
  const [dash, setDash] = useState(1);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}ai/metrics.json`).then((r) => r.json()).then(setM).catch(() => setErr(true));
  }, []);
  if (err) return <div className="a-card"><p>Could not load ai/metrics.json (run python ml/train_model.py).</p></div>;
  if (!m) return <div className="a-card"><p>Loading…</p></div>;
  const o = m.overview;
  const best = m.models.find((x) => x.name === m.best_model);

  return (
    <>
      <div className="a-card">
        <h2>AI dashboards</h2>
        <p><b>Objective:</b> {m.meta.objective}</p>
        <p className="a-warn">Data is <b>simulated</b> ({m.meta.rows.toLocaleString()} impressions, {m.meta.users.toLocaleString()} users) built on the app&apos;s real recipes. Results show how well the model recovers the simulation rules, not real-world accuracy.</p>
        <div className="admin__tabs">
          {['Engagement', 'Model & saturation', 'Content discovery'].map((l, i) => (
            <button key={l} type="button" className={dash === i + 1 ? 'is-active' : ''} onClick={() => setDash(i + 1)}>{l}</button>
          ))}
        </div>
      </div>

      {dash === 1 && (
        <>
          <div className="a-kpis">
            <div><b>{o.impressions.toLocaleString()}</b><span>Impressions</span></div>
            <div><b>{o.favourites.toLocaleString()}</b><span>Favourites</span></div>
            <div><b>{pct(o.favourite_rate)}</b><span>Favourite rate</span></div>
          </div>
          <div className="a-card"><h3>Favourite rate by category</h3><BarChart items={o.by_category.map((d) => ({ label: d.label, value: d.rate }))} format={pct} /></div>
          <div className="a-card"><h3>Favourite rate by hour of day</h3>
            <LineChart series={[{ name: 'Favourite rate', color: '#5a3825', points: o.by_hour.map((d) => ({ x: Number(d.label), y: d.rate })) }]} xLabel="Hour" yFormat={pct} xFormat={(v) => `${v}h`} yMin={0} />
          </div>
          <div className="a-card"><h3>By entry point and skill</h3>
            <BarChart items={[...o.by_source, ...o.by_skill, ...o.by_device].map((d) => ({ label: d.label, value: d.rate }))} format={pct} />
          </div>
        </>
      )}

      {dash === 2 && (
        <>
          <div className="a-card">
            <h3>Model comparison (held-out users)</h3>
            <div className="a-scroll">
              <table className="a-table">
                <thead><tr><th>Model</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>AUC</th><th>Train AUC</th></tr></thead>
                <tbody>
                  {m.models.map((x) => (
                    <tr key={x.name} className={x.name === m.best_model ? 'a-best' : ''}>
                      <td>{x.name}</td><td>{pct(x.accuracy)}</td><td>{pct(x.precision)}</td><td>{pct(x.recall)}</td><td>{pct(x.f1)}</td><td>{x.auc.toFixed(3)}</td><td>{x.train_auc.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="a-note">Accuracy at threshold 0.5 equals the do-nothing baseline of {pct(m.baseline_accuracy)} (always predict &quot;not favourited&quot;), because only ~17% of impressions are favourited. AUC, precision and recall (at a tuned threshold of {m.threshold.toFixed(2)}) are the honest measures. Random Forest shows overfitting: train AUC is far above test AUC.</p>
          </div>
          <div className="a-card"><h3>ROC curve – {m.best_model}</h3>
            <LineChart series={[{ name: `Model (AUC ${best.auc.toFixed(3)})`, color: '#5a3825', points: m.roc.map((p) => ({ x: p.fpr, y: p.tpr })) }, { name: 'Chance', color: '#c48a5a', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]} xLabel="False positive rate" yLabel="True positive rate" xFormat={(v) => v.toFixed(1)} yMin={0} yMax={1} />
            <p className="a-note">Confusion matrix at threshold {m.threshold.toFixed(2)}: TP {m.confusion.tp}, FP {m.confusion.fp}, FN {m.confusion.fn}, TN {m.confusion.tn}.</p>
          </div>
          <div className="a-card"><h3>Saturation (learning curve)</h3>
            <LineChart
              series={[
                { name: 'Test AUC', color: '#5a3825', points: m.learning_curve.map((c) => ({ x: c.n_rows, y: c.test_auc })) },
                { name: 'Train AUC', color: '#c48a5a', points: m.learning_curve.map((c) => ({ x: c.n_rows, y: c.train_auc })) },
              ]}
              hLines={[{ y: m.oracle_auc, label: `noise ceiling ${m.oracle_auc.toFixed(3)}` }]}
              xLabel="Training rows" xFormat={(v) => Math.round(v).toLocaleString()} />
            <p className="a-note">Test AUC stops improving at about {m.saturation.n_rows.toLocaleString()} training rows (within 0.005 of the full-data model). More data of this kind will not help; the remaining gap to the ceiling {m.oracle_auc.toFixed(3)} is mostly noise and model capacity.</p>
          </div>
        </>
      )}

      {dash === 3 && (
        <>
          <div className="a-card"><h3>What drives predictions (permutation importance, AUC drop)</h3>
            <BarChart items={m.importance.slice(0, 8).map((d) => ({ label: d.feature, value: Math.max(d.importance, 0) }))} format={(v) => v.toFixed(3)} />
          </div>
          <div className="a-card"><h3>Predicted engagement per recipe</h3>
            <BarChart height={150} items={m.recipe_scores.map((d) => ({ label: d.title.split(' ')[0] + (d.title.split(' ')[1] ? ' ' + d.title.split(' ')[1][0] : ''), value: d.score }))} format={pct} />
          </div>
          <div className="a-card"><h3>Top recommendations by persona</h3>
            {m.recommendations.map((r) => (
              <p key={r.persona}><b>{r.persona}:</b> {r.top.map((t) => `${t.title} (${pct(t.score)})`).join(', ')}</p>
            ))}
          </div>
        </>
      )}
    </>
  );
}

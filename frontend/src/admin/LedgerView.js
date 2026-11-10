import React, { useCallback, useEffect, useState } from 'react';
import { NODE_IDS, getNodes, initLedger, resetLedger, runConsensus, subscribeLedger, tamperBlock, validateChain, DIFFICULTY } from '../blockchain/ledger';
import { can } from '../security/rbac';

export default function LedgerView({ actor }) {
  const [nodes, setNodes] = useState({});
  const [status, setStatus] = useState(null);
  const [consensus, setConsensus] = useState(null);

  const refresh = useCallback(async () => {
    await initLedger();
    const n = getNodes();
    setNodes(n);
    const st = {};
    for (const id of NODE_IDS) st[id] = await validateChain(n[id]);
    setStatus(st);
  }, []);
  useEffect(() => { refresh(); return subscribeLedger(refresh); }, [refresh]);

  const chain = nodes[NODE_IDS[0]] || [];
  const canWrite = can(actor, 'ledger', 'write');

  return (
    <div className="a-card">
      <h2>Blockchain Ledger</h2>
      <p>Favourite and view events are mined into hash-linked blocks (proof-of-work: {DIFFICULTY} leading zeros) and copied to three simulated nodes. Use the app, then refresh.</p>
      <div className="a-chips">
        {NODE_IDS.map((id) => (
          <span key={id} className={`a-chip ${status && status[id] && !status[id].valid ? 'is-bad' : 'is-good'}`}>
            {id}: {nodes[id] ? nodes[id].length : 0} blocks · {status && status[id] ? (status[id].valid ? 'valid' : 'TAMPERED') : '…'}
          </span>
        ))}
      </div>
      <div className="a-actions">
        <button type="button" className="a-btn" onClick={async () => setConsensus(await runConsensus())}>Run consensus / repair</button>
        <button type="button" className="a-btn" disabled={chain.length < 2} onClick={() => tamperBlock('node-2', 1)}>Tamper block 1 on node-2 (demo)</button>
        <button type="button" className="a-btn" disabled={!canWrite} title={canWrite ? '' : 'Requires ledger write access'} onClick={() => resetLedger()}>Reset ledger</button>
      </div>
      {consensus && (
        <p className="a-note">Consensus winner: {consensus.winner || 'none'}. Repaired nodes: {consensus.repaired.length ? consensus.repaired.join(', ') : 'none'}.</p>
      )}
      <div className="a-scroll">
        <table className="a-table a-mono">
          <thead><tr><th>#</th><th>Time</th><th>Event</th><th>Recipe</th><th>Actor (pseudonym)</th><th>Hash</th></tr></thead>
          <tbody>
            {[...chain].reverse().slice(0, 50).map((b) => (
              <tr key={b.hash}>
                <td>{b.index}</td>
                <td>{b.timestamp.slice(11, 19)}</td>
                <td>{b.data.type}</td>
                <td>{b.data.recipeId || '-'}</td>
                <td>{b.data.actor || '-'}</td>
                <td>{b.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="a-note">Honest scope: this chain lives in this browser and the three nodes are simulated, so it shows integrity and consensus but is not a public, distributed network.</p>
    </div>
  );
}

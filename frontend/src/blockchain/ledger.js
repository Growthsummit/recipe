// Part B - records stored on a blockchain.
// A real hash-linked, proof-of-work chain, replicated on three simulated nodes and reconciled
// by majority consensus. It runs in the browser (localStorage), so it demonstrates the
// mechanism (transparency, integrity, distributed agreement) but is NOT a public network.
const NODES_KEY = 'recipebox.nodes';
const SALT_KEY = 'recipebox.salt';
export const NODE_IDS = ['node-1', 'node-2', 'node-3'];
export const DIFFICULTY = 2; // number of leading hex zeros required in a block hash

const listeners = new Set();
export const subscribeLedger = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach((fn) => fn());

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const blockPayload = (b) => `${b.index}|${b.timestamp}|${JSON.stringify(b.data)}|${b.prevHash}|${b.nonce}`;

async function mine(index, data, prevHash) {
  const timestamp = new Date().toISOString();
  let nonce = 0;
  const target = '0'.repeat(DIFFICULTY);
  for (;;) {
    const hash = await sha256(blockPayload({ index, timestamp, data, prevHash, nonce }));
    if (hash.startsWith(target)) return { index, timestamp, data, prevHash, nonce, hash };
    nonce += 1;
  }
}

export async function validateChain(chain) {
  const problems = [];
  for (let i = 0; i < chain.length; i += 1) {
    const b = chain[i];
    const recomputed = await sha256(blockPayload(b));
    if (recomputed !== b.hash) problems.push({ index: b.index, reason: 'Block contents do not match its hash' });
    if (!b.hash.startsWith('0'.repeat(DIFFICULTY))) problems.push({ index: b.index, reason: 'Proof-of-work not satisfied' });
    if (i > 0 && b.prevHash !== chain[i - 1].hash) problems.push({ index: b.index, reason: 'Link to previous block is broken' });
  }
  return { valid: problems.length === 0, problems };
}

function loadNodes() {
  try {
    const raw = localStorage.getItem(NODES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

function saveNodes(nodes) {
  try { localStorage.setItem(NODES_KEY, JSON.stringify(nodes)); } catch (e) { /* storage unavailable */ }
  notify();
}

let initPromise = null;
export function initLedger() {
  if (!initPromise) {
    initPromise = (async () => {
      let nodes = loadNodes();
      if (!nodes) {
        const genesis = await mine(0, { type: 'GENESIS', note: 'RecipeBox ledger created' }, '0');
        nodes = {};
        NODE_IDS.forEach((id) => { nodes[id] = [genesis]; });
        saveNodes(nodes);
      }
      return nodes;
    })();
  }
  return initPromise;
}

export function getNodes() {
  return loadNodes() || {};
}

// Pseudonymous actor reference so the chain never holds a name (GDPR data minimisation).
export async function pseudonym(actorId) {
  let salt = null;
  try { salt = localStorage.getItem(SALT_KEY); } catch (e) { /* ignore */ }
  if (!salt) {
    const rnd = window.crypto.getRandomValues(new Uint8Array(16));
    salt = Array.from(rnd).map((b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(SALT_KEY, salt); } catch (e) { /* ignore */ }
  }
  return (await sha256(`${salt}:${actorId}`)).slice(0, 12);
}

let queue = Promise.resolve();
// Appends a record: mine on node-1, then broadcast to every node.
export function appendRecord(data) {
  queue = queue.then(async () => {
    try {
      await initLedger();
      const nodes = getNodes();
      const lead = nodes[NODE_IDS[0]];
      const tip = lead[lead.length - 1];
      const block = await mine(tip.index + 1, data, tip.hash);
      NODE_IDS.forEach((id) => { nodes[id] = [...(nodes[id] || []), block]; });
      saveNodes(nodes);
    } catch (e) {
      // Ledger problems must never break the consumer app.
      // eslint-disable-next-line no-console
      console.warn('Ledger append failed', e);
    }
  });
  return queue;
}

export async function recordEvent(type, actorId, details = {}) {
  const actor = await pseudonym(actorId);
  return appendRecord({ type, actor, ...details });
}

// Majority consensus: the chain whose tip hash is shared by most *valid* nodes wins;
// nodes that disagree or fail validation are repaired from the winner.
export async function runConsensus() {
  const nodes = getNodes();
  const report = [];
  const votes = {};
  for (const id of NODE_IDS) {
    const result = await validateChain(nodes[id]);
    const tip = nodes[id][nodes[id].length - 1].hash;
    report.push({ node: id, valid: result.valid, length: nodes[id].length, tip, problems: result.problems });
    if (result.valid) votes[tip] = (votes[tip] || []).concat(id);
  }
  const winnerTip = Object.keys(votes).sort((a, b) => votes[b].length - votes[a].length)[0];
  if (!winnerTip) return { report, repaired: [], winner: null };
  const source = votes[winnerTip][0];
  const repaired = [];
  NODE_IDS.forEach((id) => {
    const tip = nodes[id][nodes[id].length - 1].hash;
    if (tip !== winnerTip || !report.find((r) => r.node === id).valid) {
      nodes[id] = nodes[source].map((b) => ({ ...b }));
      repaired.push(id);
    }
  });
  if (repaired.length) saveNodes(nodes);
  return { report, repaired, winner: source };
}

// Demonstration helper: silently alters a block on one node so the tamper-evidence can be shown.
export function tamperBlock(nodeId, index) {
  const nodes = getNodes();
  const chain = nodes[nodeId];
  if (!chain || !chain[index]) return false;
  chain[index] = { ...chain[index], data: { ...chain[index].data, tampered: true } };
  saveNodes(nodes);
  return true;
}

export function resetLedger() {
  try { localStorage.removeItem(NODES_KEY); } catch (e) { /* ignore */ }
  initPromise = null;
  notify();
  return initLedger();
}

// Part C.2 - read / write permissions per actor and module.
// The policy lives in localStorage and is edited from the Security Configuration module
// (admin console). NOTE: this is client-side enforcement for the prototype; a production
// system must enforce the same matrix on a server.
export const ACTORS = [
  { id: 'guest', label: 'Guest' },
  { id: 'user', label: 'User' },
  { id: 'analyst', label: 'Data Analyst' },
  { id: 'admin', label: 'Security Admin' },
];

export const MODULES = [
  { id: 'recipes', label: 'Recipes (Home, Details)' },
  { id: 'search', label: 'Search' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'profile', label: 'Profile' },
  { id: 'ledger', label: 'Blockchain Ledger' },
  { id: 'aiDashboards', label: 'AI Dashboards' },
  { id: 'dataGovernance', label: 'Data Classification & GDPR' },
  { id: 'securityConfig', label: 'Security Configuration' },
];

const R = 'read';
const W = 'write';

export const DEFAULT_POLICY = {
  guest:   { recipes: [R], search: [R], favourites: [], profile: [], ledger: [], aiDashboards: [], dataGovernance: [], securityConfig: [] },
  user:    { recipes: [R], search: [R], favourites: [R, W], profile: [R, W], ledger: [], aiDashboards: [], dataGovernance: [], securityConfig: [] },
  analyst: { recipes: [R], search: [R], favourites: [], profile: [], ledger: [R], aiDashboards: [R], dataGovernance: [R], securityConfig: [] },
  admin:   { recipes: [R, W], search: [R], favourites: [R], profile: [R], ledger: [R], aiDashboards: [R], dataGovernance: [R, W], securityConfig: [R, W] },
};

const POLICY_KEY = 'recipebox.policy';
const ACTOR_KEY = 'recipebox.actor';
const listeners = new Set();

const clone = (o) => JSON.parse(JSON.stringify(o));

export function getPolicy() {
  try {
    const raw = localStorage.getItem(POLICY_KEY);
    if (raw) return { ...clone(DEFAULT_POLICY), ...JSON.parse(raw) };
  } catch (e) { /* ignore corrupt storage */ }
  return clone(DEFAULT_POLICY);
}

function savePolicy(policy) {
  try { localStorage.setItem(POLICY_KEY, JSON.stringify(policy)); } catch (e) { /* storage unavailable */ }
  listeners.forEach((fn) => fn());
}

export function getActor() {
  try {
    const a = localStorage.getItem(ACTOR_KEY);
    if (a && ACTORS.some((x) => x.id === a)) return a;
  } catch (e) { /* ignore */ }
  return 'user'; // the Figma app is designed for a signed-in user ("Relebohile")
}

export function setActor(id) {
  try { localStorage.setItem(ACTOR_KEY, id); } catch (e) { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function can(actor, moduleId, permission = R, policy = getPolicy()) {
  return Boolean(policy[actor] && policy[actor][moduleId] && policy[actor][moduleId].includes(permission));
}

// Only an actor holding write access to "securityConfig" may change the matrix.
export function setPermission(byActor, targetActor, moduleId, permission, granted) {
  const policy = getPolicy();
  if (!can(byActor, 'securityConfig', W, policy)) return { ok: false, reason: 'denied' };
  if (targetActor === 'admin' && moduleId === 'securityConfig') return { ok: false, reason: 'locked' }; // prevent lock-out
  const current = new Set(policy[targetActor][moduleId]);
  if (granted) { current.add(permission); if (permission === W) current.add(R); } else { current.delete(permission); if (permission === R) current.delete(W); }
  policy[targetActor][moduleId] = Array.from(current);
  savePolicy(policy);
  return { ok: true };
}

export function resetPolicy(byActor) {
  if (!can(byActor, 'securityConfig', W)) return { ok: false, reason: 'denied' };
  savePolicy(clone(DEFAULT_POLICY));
  return { ok: true };
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// The security configuration lives on a different domain (host / route) from the consumer app.
export function isAdminDomain() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  return host.startsWith('admin.') || hash.startsWith('#/admin');
}

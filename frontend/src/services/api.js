/**
 * RecipeBox API client.
 *
 * Single reusable entry point for every backend call. The base URL is
 * configurable per environment through Vite's `VITE_API_URL` (see .env), so the
 * same build works against localhost, staging or production without edits.
 *
 * The JWT issued by the backend is kept in localStorage and attached as a
 * Bearer token on every request that needs authentication.
 */

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const TOKEN_KEY = 'recipebox.token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable - the session will simply not persist */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Error thrown for any non-2xx API response. Carries message/code/details. */
export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Drops empty query values so they are not serialised as `?q=`. */
function cleanQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function request(path, { method = 'GET', body, query, auth = true, raw = false, contentType } = {}) {
  const headers = { Accept: 'application/json' };

  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = raw ? contentType || 'application/octet-stream' : 'application/json';
    payload = raw ? body : JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}${cleanQuery(query)}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(
      'Cannot reach the RecipeBox server. Is the backend running on ' + BASE_URL + '?',
      { status: 0, code: 'NETWORK_ERROR' }
    );
  }

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const error = (json && json.error) || {};
    throw new ApiError(error.message || `Request failed with status ${response.status}`, {
      status: response.status,
      code: error.code,
      details: error.details,
    });
  }

  return json ? json.data : null;
}

export const api = {
  health: () => request('/health', { auth: false }),

  auth: {
    register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
    login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
    updateMe: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),
    changePassword: (payload) => request('/auth/me/password', { method: 'PUT', body: payload }),
    resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', body: payload, auth: false }),
  },

  recipes: {
    uploadImage: (file) => request('/recipes/images', { method: 'POST', body: file, raw: true, contentType: file.type }),
    list: (query) => request('/recipes', { query }),
    mine: (query) => request('/recipes/mine', { query }),
    get: (idOrSlug) => request(`/recipes/${encodeURIComponent(idOrSlug)}`),
    create: (payload) => request('/recipes', { method: 'POST', body: payload }),
    update: (id, payload) => request(`/recipes/${id}`, { method: 'PUT', body: payload }),
    remove: (id) => request(`/recipes/${id}`, { method: 'DELETE' }),
    recordView: (id) => request(`/recipes/${id}/view`, { method: 'POST', auth: false }),
  },

  categories: {
    list: () => request('/categories', { auth: false }),
    create: (payload) => request('/categories', { method: 'POST', body: payload }),
  },

  ai: {
    recommendations: (recipeId, limit = 10, source) => request(`/ai/recommendations/${recipeId}`, { query: { limit, source }, auth: false }),
    ingredientRecommendations: (ingredients, limit = 10, source, excludeRecipeIds = []) => request('/ai/recommendations/ingredients', { method: 'POST', body: { ingredients, limit, source, exclude_recipe_ids: excludeRecipeIds }, auth: false }),
    popularity: (recipeId) => request(`/ai/popularity/${recipeId}`, { auth: false }),
    clusters: () => request('/ai/clusters', { auth: false }),
    discovery: (limit = 100) => request('/ai/discovery', { query: { limit }, auth: false }),
    recipeCluster: (recipeId) => request(`/ai/clusters/${recipeId}`, { auth: false }),
    health: () => request('/ai/health', { auth: false }),
  },

  favourites: {
    list: (query) => request('/users/me/favourites', { query }),
    add: (recipeId) => request(`/recipes/${recipeId}/favourite`, { method: 'POST' }),
    remove: (recipeId) => request(`/recipes/${recipeId}/favourite`, { method: 'DELETE' }),
  },

  ratings: {
    set: (recipeId, rating) => request(`/recipes/${recipeId}/rating`, { method: 'POST', body: { rating } }),
    mine: (recipeId) => request(`/recipes/${recipeId}/rating`),
  },

  reviews: {
    list: (recipeId, query) => request(`/recipes/${recipeId}/reviews`, { query, auth: false }),
    create: (recipeId, payload) => request(`/recipes/${recipeId}/reviews`, { method: 'POST', body: payload }),
    update: (reviewId, payload) => request(`/reviews/${reviewId}`, { method: 'PATCH', body: payload }),
    remove: (reviewId) => request(`/reviews/${reviewId}`, { method: 'DELETE' }),
  },

  history: {
    list: (query) => request('/users/me/history', { query }),
    add: (recipeId, payload) => request(`/recipes/${recipeId}/history`, { method: 'POST', body: payload || {} }),
  },

  preferences: {
    get: () => request('/users/me/preferences'),
    update: (payload) => request('/users/me/preferences', { method: 'PUT', body: payload }),
  },

  privacy: {
    export: () => request('/users/me/export'),
    consents: () => request('/users/me/consents'),
    updateConsents: (payload) => request('/users/me/consents', { method: 'PUT', body: payload }),
    deleteAccount: (password) => request('/users/me', { method: 'DELETE', body: { password } }),
  },

  blockchain: {
    wallet: () => request('/blockchain/wallet'),
    walletChallenge: (address) => request('/blockchain/wallet/challenge', { method: 'POST', body: { address } }),
    verifyWallet: (payload) => request('/blockchain/wallet/verify', { method: 'POST', body: payload }),
    prepare: (recipeId) => request(`/blockchain/register/${recipeId}`, { method: 'POST', body: {} }),
    submitted: (recipeId, payload) => request(`/blockchain/submitted/${recipeId}`, { method: 'POST', body: payload }),
    confirm: (recipeId, payload) => request(`/blockchain/confirm/${recipeId}`, { method: 'POST', body: payload }),
    failed: (recipeId, payload) => request(`/blockchain/failure/${recipeId}`, { method: 'POST', body: payload }),
    verify: (recipeId) => request(`/blockchain/verify/${recipeId}`, { auth: false }),
    history: (recipeId) => request(`/blockchain/history/${recipeId}`, { auth: false }),
    transaction: (txHash) => request(`/blockchain/transaction/${txHash}`, { auth: false }),
    dashboard: () => request('/blockchain/dashboard'),
  },
};

export default api;

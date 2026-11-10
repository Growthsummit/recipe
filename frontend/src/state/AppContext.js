import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { can, getActor, subscribe } from '../security/rbac';
import { recordEvent, initLedger } from '../blockchain/ledger';
import { api, tokenStore } from '../services/api';

const AppContext = createContext(null);

/**
 * Application state shared by every screen.
 *
 * - `user` / `isAuthenticated` come from the real backend session (JWT).
 * - `favourites` is the signed-in user's favourite recipe ids, loaded from
 *   Turso and kept in sync through the API.
 * - `actor` is still read from the client-side RBAC matrix so the admin console
 *   keeps working exactly as before.
 */
export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initialising, setInitialising] = useState(Boolean(tokenStore.get()));
  const [favourites, setFavourites] = useState([]);
  const [favouritesCount, setFavouritesCount] = useState(0);
  const [storageError, setStorageError] = useState('');
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('recipebox.theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  });
  const [textScale, setTextScaleState] = useState(() => {
    try {
      const stored = Number(localStorage.getItem('recipebox.textScale'));
      return Number.isFinite(stored) && stored >= 0.8 && stored <= 1.4 ? stored : 1;
    } catch { return 1; }
  });
  const [actor, setActorState] = useState(getActor);
  const authPromptRef = useRef(null);

  useEffect(() => subscribe(() => setActorState(getActor())), []);
  useEffect(() => { initLedger(); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('recipebox.theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--app-text-scale', String(textScale));
    try { localStorage.setItem('recipebox.textScale', String(textScale)); } catch { /* storage unavailable */ }
  }, [textScale]);
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    api.preferences.get().then((data) => {
      if (!cancelled && (data?.preferences?.theme === 'light' || data?.preferences?.theme === 'dark')) {
        setThemeState(data.preferences.theme);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);

  const refreshFavourites = useCallback(async () => {
    if (!tokenStore.get()) {
      setFavourites([]);
      setFavouritesCount(0);
      return;
    }
    try {
      const data = await api.favourites.list({ limit: 50, page: 1 });
      const total = Number(data?.pagination?.total ?? data?.items?.length ?? 0);
      const remainingPages = Array.from({ length: Math.max(0, Math.ceil(total / 50) - 1) }, (_, i) => i + 2);
      const laterPages = await Promise.all(remainingPages.map((page) => api.favourites.list({ limit: 50, page })));
      setFavourites([...(data?.items || []), ...laterPages.flatMap((page) => page?.items || [])].map((recipe) => recipe.id));
      setFavouritesCount(total);
    } catch {
      setFavourites([]);
      setFavouritesCount(0);
    }
  }, []);

  // Restore an existing session (and its favourites) on first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStore.get()) {
        setInitialising(false);
        return;
      }
      try {
        const { user: me } = await api.auth.me();
        if (cancelled) return;
        setUser(me);
        await refreshFavourites();
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setInitialising(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshFavourites]);

  const login = useCallback(async (email, password) => {
    const { token, user: me } = await api.auth.login({ email, password });
    tokenStore.set(token);
    setUser(me);
    await refreshFavourites();
    return me;
  }, [refreshFavourites]);

  const register = useCallback(async (name, email, password) => {
    const { token, user: me } = await api.auth.register({ name, email, password });
    tokenStore.set(token);
    setUser(me);
    setFavourites([]);
    setFavouritesCount(0);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // The token may already be expired/invalid - signing out locally is fine.
    }
    tokenStore.clear();
    setUser(null);
    setFavourites([]);
    setFavouritesCount(0);
  }, []);

  const deleteAccount = useCallback(async (password) => {
    await api.privacy.deleteAccount(password);
    tokenStore.clear();
    setUser(null);
    setFavourites([]);
    setFavouritesCount(0);
    setStorageError('');
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { user: me } = await api.auth.updateMe(payload);
    setUser(me);
    return me;
  }, []);

  // MobileApp registers a handler so any screen can ask for the sign-in screen.
  const setAuthPromptHandler = useCallback((handler) => { authPromptRef.current = handler; }, []);
  const requireAuth = useCallback(() => { if (authPromptRef.current) authPromptRef.current(); }, []);

  const isFavourite = useCallback((id) => favourites.includes(id), [favourites]);

  const setTheme = useCallback(async (nextTheme) => {
    const normalized = nextTheme === 'dark' ? 'dark' : 'light';
    setThemeState(normalized);
    if (user && tokenStore.get()) {
      try { await api.preferences.update({ theme: normalized }); } catch { /* keep the local theme if sync fails */ }
    }
  }, [user]);
  const clearStorageError = useCallback(() => setStorageError(''), []);
  const setTextScale = useCallback((next) => {
    const value = Number(next);
    setTextScaleState(Number.isFinite(value) ? Math.min(1.4, Math.max(0.8, value)) : 1);
  }, []);

  const toggleFavourite = useCallback(async (id) => {
    if (!user) {
      requireAuth();
      return { ok: false, reason: 'auth' };
    }
    if (!can(actor, 'favourites', 'write')) {
      recordEvent('ACCESS_DENIED', actor, { module: 'favourites', permission: 'write' });
      return { ok: false, reason: 'denied' };
    }

    const exists = favourites.includes(id);
    setStorageError('');
    if (!exists && favouritesCount >= 250) {
      const message = 'Saved recipe storage is full (500 MB). Remove a saved recipe to make room.';
      setStorageError(message);
      return { ok: false, reason: 'storage-full', message };
    }
    // Optimistic update so the heart responds immediately.
    setFavourites((prev) => (exists ? prev.filter((x) => x !== id) : [...prev, id]));
    setFavouritesCount((count) => Math.max(0, count + (exists ? -1 : 1)));
    try {
      if (exists) await api.favourites.remove(id);
      else await api.favourites.add(id);
      recordEvent(exists ? 'FAVOURITE_REMOVED' : 'FAVOURITE_ADDED', actor, { recipeId: id });
      return { ok: true, isFavourite: !exists };
    } catch (error) {
      // Roll back on failure so the UI never lies about what was saved.
      setFavourites((prev) => (exists ? [...prev, id] : prev.filter((x) => x !== id)));
      setFavouritesCount((count) => Math.max(0, count + (exists ? 1 : -1)));
      if (error.code === 'STORAGE_LIMIT_REACHED') {
        setStorageError(error.message);
        return { ok: false, reason: 'storage-full', message: error.message };
      }
      throw error;
    }
  }, [actor, favourites, favouritesCount, user, requireAuth]);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    initialising,
    actor,
    favourites,
    favouritesCount,
    storageError,
    clearStorageError,
    theme,
    setTheme,
    textScale,
    setTextScale,
    isFavourite,
    toggleFavourite,
    refreshFavourites,
    login,
    register,
    logout,
    deleteAccount,
    updateProfile,
    requireAuth,
    setAuthPromptHandler,
  }), [
    user,
    initialising,
    actor,
    favourites,
    favouritesCount,
    storageError,
    clearStorageError,
    theme,
    setTheme,
    textScale,
    setTextScale,
    isFavourite,
    toggleFavourite,
    refreshFavourites,
    login,
    register,
    logout,
    deleteAccount,
    updateProfile,
    requireAuth,
    setAuthPromptHandler,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);

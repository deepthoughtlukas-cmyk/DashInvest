import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AuthSessionResponse,
  PersistedWorkspaceState,
  UserProfileSummary,
} from '../../shared/types.ts';
import { browserProfileStore, getApiMode } from '../services/apiClient.ts';
import {
  deleteFirestoreUserData,
  isFirebaseConfigured,
  loadFirestoreWorkspace,
  mapFirebaseUser,
  saveFirestoreWorkspace,
  signInWithGoogle,
  signOutFirebase,
  subscribeFirebaseAuth,
  updateFirestoreDisplayName,
} from '../services/firebase.ts';
import {
  extractWorkspaceSnapshot,
  useDashboardStore,
} from '../store/dashboardStore.ts';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';
export type AuthMode = 'firebase' | 'server' | 'browser';

export function resolveAuthMode(): AuthMode {
  if (isFirebaseConfigured()) return 'firebase';
  if (getApiMode() === 'live-local') return 'server';
  return 'browser';
}

async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body as T;
}

export function useProfileSync() {
  const authMode = resolveAuthMode();
  const [user, setUser] = useState<UserProfileSummary | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [profilesList, setProfilesList] = useState<UserProfileSummary[]>([]);

  const userRef = useRef<UserProfileSummary | null>(null);
  const lastSyncedJsonRef = useRef<string | null>(null);
  const pendingJsonRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimer = () => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  };

  const refreshProfiles = useCallback(async () => {
    if (authMode === 'firebase') {
      setProfilesList([]);
      return;
    }
    if (authMode === 'browser') {
      setProfilesList(browserProfileStore.listProfiles());
      return;
    }
    try {
      const data = await apiJson<{ profiles: UserProfileSummary[] }>('/api/auth/profiles');
      setProfilesList(data.profiles);
    } catch {
      // keep prior list
    }
  }, [authMode]);

  const persistSnapshotJson = useCallback(
    async (json: string, keepalive = false) => {
      const currentUser = userRef.current;
      if (!currentUser) return;

      try {
        let savedAt: string;

        if (authMode === 'firebase') {
          const parsed = JSON.parse(json) as PersistedWorkspaceState;
          const res = await saveFirestoreWorkspace(currentUser.id, parsed, {
            displayName: currentUser.displayName,
            email: currentUser.email ?? null,
            photoURL: currentUser.photoURL ?? null,
          });
          savedAt = res.savedAt;
        } else if (authMode === 'browser') {
          const parsed = JSON.parse(json) as PersistedWorkspaceState;
          const res = browserProfileStore.saveWorkspace(currentUser.id, parsed);
          savedAt = res.savedAt;
        } else {
          const res = await fetch('/api/profile/workspace', {
            method: 'PUT',
            credentials: 'include',
            keepalive,
            headers: { 'Content-Type': 'application/json' },
            body: json,
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error || `HTTP ${res.status}`);
          }
          const payload = (await res.json()) as { savedAt: string };
          savedAt = payload.savedAt;
        }

        lastSyncedJsonRef.current = json;
        if (pendingJsonRef.current === json) {
          pendingJsonRef.current = null;
        }
        setSyncStatus('saved');
        setSyncError(null);
        setLastSavedAt(savedAt);
      } catch (err) {
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
      }
    },
    [authMode],
  );

  const flushNow = useCallback(async () => {
    clearPendingTimer();
    if (!userRef.current) return;
    const currentJson = JSON.stringify(extractWorkspaceSnapshot(useDashboardStore.getState()));
    if (currentJson !== lastSyncedJsonRef.current) {
      setSyncStatus('saving');
      await persistSnapshotJson(currentJson, false);
    }
  }, [persistSnapshotJson]);

  const activateSession = useCallback(
    (
      sessionUser: UserProfileSummary,
      workspace: Partial<PersistedWorkspaceState> | null,
      preserveCurrentIfNull = false,
    ) => {
      clearPendingTimer();
      pendingJsonRef.current = null;
      const store = useDashboardStore.getState();

      if (workspace) {
        store.hydrateWorkspace(workspace);
      } else if (!preserveCurrentIfNull) {
        store.resetWorkspaceToDefaults();
      }

      const canonicalJson = JSON.stringify(extractWorkspaceSnapshot(useDashboardStore.getState()));
      lastSyncedJsonRef.current = canonicalJson;
      userRef.current = sessionUser;
      setUser(sessionUser);
      setSyncStatus('saved');
      setSyncError(null);
      setLastSavedAt(sessionUser.updatedAt);
    },
    [],
  );

  // Restore session on mount according to active auth backend
  useEffect(() => {
    if (authMode === 'firebase') {
      let active = true;
      const unsub = subscribeFirebaseAuth((fbUser) => {
        if (!active) return;
        if (!fbUser) {
          if (userRef.current) {
            userRef.current = null;
            lastSyncedJsonRef.current = null;
            useDashboardStore.getState().resetWorkspaceToDefaults();
          }
          setUser(null);
          setSyncStatus('idle');
          setLastSavedAt(null);
          setAuthLoading(false);
          return;
        }

        void (async () => {
          try {
            const docData = await loadFirestoreWorkspace(fbUser.uid);
            if (!active) return;
            const summary = mapFirebaseUser(fbUser, docData.displayName, docData.updatedAt);
            // If new Google user has no Firestore doc yet, preserve current view and save it to Cloud immediately
            const isFirstCloudSave = !docData.workspace;
            activateSession(summary, docData.workspace, isFirstCloudSave);
            if (isFirstCloudSave) {
              const snap = extractWorkspaceSnapshot(useDashboardStore.getState());
              const saved = await saveFirestoreWorkspace(fbUser.uid, snap, {
                displayName: summary.displayName,
                email: summary.email ?? null,
                photoURL: summary.photoURL ?? null,
              });
              if (active) setLastSavedAt(saved.savedAt);
            }
          } catch (err) {
            if (!active) return;
            const fallback = mapFirebaseUser(fbUser);
            activateSession(fallback, null, true);
            setSyncStatus('error');
            setSyncError(err instanceof Error ? err.message : 'Cloud-Abruf fehlgeschlagen');
          } finally {
            if (active) setAuthLoading(false);
          }
        })();
      });

      return () => {
        active = false;
        unsub();
      };
    }

    if (authMode === 'browser') {
      setProfilesList(browserProfileStore.listProfiles());
      const active = browserProfileStore.getActiveSession();
      if (active) {
        activateSession(active.user, active.workspace, true);
      }
      setAuthLoading(false);
      return;
    }

    // Local Express session restore
    let cancelled = false;
    (async () => {
      try {
        const [me, profs] = await Promise.all([
          apiJson<AuthSessionResponse>('/api/auth/me'),
          apiJson<{ profiles: UserProfileSummary[] }>('/api/auth/profiles').catch(() => ({
            profiles: [],
          })),
        ]);
        if (cancelled) return;
        setProfilesList(profs.profiles);
        if (me.authenticated && me.user) {
          activateSession(me.user, me.workspace, true);
        }
      } catch {
        // remain guest mode cleanly
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authMode, activateSession]);

  // Continuous workspace auto-save subscription + tab-hide / unload flush
  useEffect(() => {
    const debounceMs = authMode === 'firebase' ? 600 : 500;
    const unsubscribe = useDashboardStore.subscribe((state) => {
      if (!userRef.current) return;
      const json = JSON.stringify(extractWorkspaceSnapshot(state));
      if (json === lastSyncedJsonRef.current || json === pendingJsonRef.current) {
        return;
      }

      pendingJsonRef.current = json;
      setSyncStatus('saving');
      clearPendingTimer();
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const latestJson = JSON.stringify(
          extractWorkspaceSnapshot(useDashboardStore.getState()),
        );
        if (userRef.current && latestJson !== lastSyncedJsonRef.current) {
          void persistSnapshotJson(latestJson, false);
        } else {
          setSyncStatus('saved');
        }
      }, debounceMs);
    });

    const flushKeepalive = () => {
      if (!userRef.current) return;
      const latestJson = JSON.stringify(extractWorkspaceSnapshot(useDashboardStore.getState()));
      if (latestJson !== lastSyncedJsonRef.current) {
        clearPendingTimer();
        void persistSnapshotJson(latestJson, authMode === 'server');
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushKeepalive();
      }
    };

    window.addEventListener('beforeunload', flushKeepalive);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearPendingTimer();
      unsubscribe();
      window.removeEventListener('beforeunload', flushKeepalive);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authMode, persistSnapshotJson]);

  const loginWithGoogle = useCallback(async () => {
    if (authMode !== 'firebase') {
      throw new Error('Firebase ist für diese Umgebung nicht konfiguriert.');
    }
    await signInWithGoogle();
  }, [authMode]);

  const register = useCallback(
    async (params: {
      username: string;
      displayName?: string;
      password: string;
      avatarColor?: string;
      importCurrentWorkspace: boolean;
    }) => {
      const initialWorkspace = params.importCurrentWorkspace
        ? extractWorkspaceSnapshot(useDashboardStore.getState())
        : undefined;

      if (authMode === 'browser') {
        const res = browserProfileStore.register({
          ...params,
          initialWorkspace: initialWorkspace ?? null,
        });
        activateSession(res.user, res.workspace, params.importCurrentWorkspace);
        await refreshProfiles();
        return;
      }

      const res = await apiJson<AuthSessionResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: params.username,
          displayName: params.displayName,
          password: params.password,
          avatarColor: params.avatarColor,
          initialWorkspace,
        }),
      });
      if (res.user) {
        activateSession(res.user, res.workspace, params.importCurrentWorkspace);
        await refreshProfiles();
      }
    },
    [authMode, activateSession, refreshProfiles],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      await flushNow();
      if (authMode === 'browser') {
        const res = browserProfileStore.login(username, password);
        activateSession(res.user, res.workspace, false);
        await refreshProfiles();
        return;
      }

      const res = await apiJson<AuthSessionResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (res.user) {
        activateSession(res.user, res.workspace, false);
        await refreshProfiles();
      }
    },
    [authMode, flushNow, activateSession, refreshProfiles],
  );

  const logout = useCallback(async () => {
    await flushNow();
    clearPendingTimer();
    pendingJsonRef.current = null;
    userRef.current = null;
    lastSyncedJsonRef.current = null;

    if (authMode === 'firebase') {
      await signOutFirebase();
    } else if (authMode === 'browser') {
      browserProfileStore.logout();
    } else {
      await apiJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }).catch(() => ({
        ok: true,
      }));
    }

    useDashboardStore.getState().resetWorkspaceToDefaults();
    setUser(null);
    setSyncStatus('idle');
    setSyncError(null);
    setLastSavedAt(null);
    await refreshProfiles();
  }, [authMode, flushNow, refreshProfiles]);

  const updateProfile = useCallback(
    async (patch: { displayName?: string; avatarColor?: string }) => {
      const cur = userRef.current;
      if (!cur) return;

      if (authMode === 'firebase') {
        const nextName = patch.displayName?.trim();
        if (nextName) {
          const { updatedAt } = await updateFirestoreDisplayName(cur.id, nextName);
          const nextUser = { ...cur, displayName: nextName, updatedAt };
          userRef.current = nextUser;
          setUser(nextUser);
          setLastSavedAt(updatedAt);
        }
        return;
      }

      if (authMode === 'browser') {
        const updated = browserProfileStore.updateProfile(cur.id, patch);
        userRef.current = updated;
        setUser(updated);
        setLastSavedAt(updated.updatedAt);
        await refreshProfiles();
        return;
      }

      const res = await apiJson<{ user: UserProfileSummary }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      userRef.current = res.user;
      setUser(res.user);
      setLastSavedAt(res.user.updatedAt);
      await refreshProfiles();
    },
    [authMode, refreshProfiles],
  );

  const deleteAccount = useCallback(
    async (password: string) => {
      const cur = userRef.current;
      if (!cur) return;

      if (authMode === 'firebase') {
        await deleteFirestoreUserData(cur.id);
      } else if (authMode === 'browser') {
        browserProfileStore.deleteProfile(cur.id, password);
      } else {
        await apiJson<{ ok: boolean }>('/api/profile', {
          method: 'DELETE',
          body: JSON.stringify({ password }),
        });
      }

      clearPendingTimer();
      pendingJsonRef.current = null;
      userRef.current = null;
      lastSyncedJsonRef.current = null;
      useDashboardStore.getState().resetWorkspaceToDefaults();
      setUser(null);
      setSyncStatus('idle');
      setSyncError(null);
      setLastSavedAt(null);
      await refreshProfiles();
    },
    [authMode, refreshProfiles],
  );

  return {
    authMode,
    user,
    authLoading,
    syncStatus,
    lastSavedAt,
    syncError,
    profilesList,
    loginWithGoogle,
    register,
    login,
    logout,
    flushNow,
    updateProfile,
    deleteAccount,
    refreshProfiles,
  };
}

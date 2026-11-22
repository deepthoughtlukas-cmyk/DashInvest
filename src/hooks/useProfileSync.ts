import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AuthSessionResponse,
  PersistedWorkspaceState,
  UserProfileSummary,
} from '../../shared/types.ts';
import {
  extractWorkspaceSnapshot,
  useDashboardStore,
} from '../store/dashboardStore.ts';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

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
    try {
      const data = await apiJson<{ profiles: UserProfileSummary[] }>('/api/auth/profiles');
      setProfilesList(data.profiles);
    } catch {
      // keep prior list
    }
  }, []);

  const persistSnapshotJson = useCallback(
    async (json: string, keepalive = false) => {
      if (!userRef.current) return;
      try {
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
        lastSyncedJsonRef.current = json;
        if (pendingJsonRef.current === json) {
          pendingJsonRef.current = null;
        }
        setSyncStatus('saved');
        setSyncError(null);
        setLastSavedAt(payload.savedAt);
      } catch (err) {
        setSyncStatus('error');
        setSyncError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
      }
    },
    [],
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

  // Restore existing cookie session on mount
  useEffect(() => {
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
  }, [activateSession]);

  // Continuous workspace auto-save subscription + tab-hide / unload keepalive flush
  useEffect(() => {
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
      }, 500);
    });

    const flushKeepalive = () => {
      if (!userRef.current) return;
      const latestJson = JSON.stringify(extractWorkspaceSnapshot(useDashboardStore.getState()));
      if (latestJson !== lastSyncedJsonRef.current) {
        clearPendingTimer();
        void persistSnapshotJson(latestJson, true);
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
  }, [persistSnapshotJson]);

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
    [activateSession, refreshProfiles],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      await flushNow();
      const res = await apiJson<AuthSessionResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (res.user) {
        activateSession(res.user, res.workspace, false);
        await refreshProfiles();
      }
    },
    [flushNow, activateSession, refreshProfiles],
  );

  const logout = useCallback(async () => {
    await flushNow();
    clearPendingTimer();
    pendingJsonRef.current = null;
    userRef.current = null;
    lastSyncedJsonRef.current = null;

    await apiJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }).catch(() => ({
      ok: true,
    }));

    useDashboardStore.getState().resetWorkspaceToDefaults();
    setUser(null);
    setSyncStatus('idle');
    setSyncError(null);
    setLastSavedAt(null);
    await refreshProfiles();
  }, [flushNow, refreshProfiles]);

  const updateProfile = useCallback(
    async (patch: { displayName?: string; avatarColor?: string }) => {
      const res = await apiJson<{ user: UserProfileSummary }>('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      userRef.current = res.user;
      setUser(res.user);
      setLastSavedAt(res.user.updatedAt);
      await refreshProfiles();
    },
    [refreshProfiles],
  );

  const deleteAccount = useCallback(
    async (password: string) => {
      await apiJson<{ ok: boolean }>('/api/profile', {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      });
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
    [refreshProfiles],
  );

  return {
    user,
    authLoading,
    syncStatus,
    lastSavedAt,
    syncError,
    profilesList,
    register,
    login,
    logout,
    flushNow,
    updateProfile,
    deleteAccount,
    refreshProfiles,
  };
}

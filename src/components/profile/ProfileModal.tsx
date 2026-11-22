import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CloudOff,
  Loader2,
  LogIn,
  LogOut,
  Save,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { UserProfileSummary } from '../../../shared/types.ts';
import type { AuthMode, SyncStatus } from '../../hooks/useProfileSync.ts';
import { useDashboardStore } from '../../store/dashboardStore.ts';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  authMode: AuthMode;
  user: UserProfileSummary | null;
  syncStatus: SyncStatus;
  lastSavedAt: string | null;
  syncError: string | null;
  profilesList: UserProfileSummary[];
  onRefreshProfiles: () => Promise<void>;
  onLoginWithGoogle: () => Promise<void>;
  onRegister: (params: {
    username: string;
    displayName?: string;
    password: string;
    avatarColor?: string;
    importCurrentWorkspace: boolean;
  }) => Promise<void>;
  onLogin: (username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onFlushNow: () => Promise<void>;
  onUpdateProfile: (patch: { displayName?: string; avatarColor?: string }) => Promise<void>;
  onDeleteAccount: (password: string) => Promise<void>;
}

const AVATAR_COLORS = [
  '#38bdf8',
  '#10b981',
  '#f59e0b',
  '#a78bfa',
  '#f43f5e',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'U';
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  onClose,
  authMode,
  user,
  syncStatus,
  lastSavedAt,
  syncError,
  profilesList,
  onRefreshProfiles,
  onLoginWithGoogle,
  onRegister,
  onLogin,
  onLogout,
  onFlushNow,
  onUpdateProfile,
  onDeleteAccount,
}) => {
  const { activeWidgets, folders, catalogAssets } = useDashboardStore();
  const bookmarkedCount = catalogAssets.filter((a) => a.bookmarked).length;

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [importCurrentWorkspace, setImportCurrentWorkspace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editDisplayName, setEditDisplayName] = useState('');
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  useEffect(() => {
    if (open) {
      setErrorMsg(null);
      setShowDeleteZone(false);
      setDeletePassword('');
      void onRefreshProfiles();
    }
  }, [open, onRefreshProfiles]);

  useEffect(() => {
    if (user) {
      setEditDisplayName(user.displayName);
    } else {
      setTab('login');
      setShowDeleteZone(false);
    }
  }, [user]);

  if (!open) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      await onLogin(username, password);
      setPassword('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      await onRegister({
        username,
        displayName,
        password,
        avatarColor,
        importCurrentWorkspace,
      });
      setPassword('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const handleLogoutClick = async () => {
    setBusy(true);
    try {
      await onLogout();
      setPassword('');
      setUsername('');
    } finally {
      setBusy(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      await onUpdateProfile({ displayName: editDisplayName });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);
    try {
      await onDeleteAccount(authMode === 'firebase' ? '' : deletePassword);
      setDeletePassword('');
      setShowDeleteZone(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setBusy(true);
    try {
      await onLoginWithGoogle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google-Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const formattedSavedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Benutzerprofil & Anmeldung"
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0f1623] shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            {user ? (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-slate-950"
                style={{ backgroundColor: user.avatarColor }}
              >
                {getInitials(user.displayName)}
              </span>
            ) : (
              <LogIn className="h-4 w-4 text-sky-400" />
            )}
            <h2 className="text-sm font-semibold text-slate-100">
              {user ? `Profil: ${user.displayName}` : 'Profil & Dauerhafte Speicherung'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Profil-Dialog schließen"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/12 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {!user ? (
            /* Guest Auth View */
            authMode === 'firebase' ? (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-slate-300">
                  Melde dich mit deinem Google-Konto an. Deine Bookmarks, Ordnerstruktur,
                  Chart-Einstellungen und Dashboard-Ansichten werden automatisch über Firebase
                  Cloud Firestore gespeichert und geräteübergreifend synchronisiert.
                </p>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleGoogleLogin()}
                  className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-slate-900 shadow transition hover:bg-slate-100 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-700" />
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.3 0 6.08-1.09 8.11-2.96l-3.88-3.05c-1.08.72-2.46 1.15-4.23 1.15-3.25 0-6.01-2.2-6.99-5.16H1.01v3.14C3.03 21.13 7.19 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.01 13.98c-.25-.72-.39-1.49-.39-2.28s.14-1.56.39-2.28V6.28H1.01C.37 7.55 0 8.99 0 11.7c0 2.71.37 4.15 1.01 5.42l4-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.56c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07.99 15.3 0 12 0 7.19 0 3.03 2.87 1.01 6.28l4 3.14c.98-2.96 3.74-4.86 6.99-4.86Z"
                      />
                    </svg>
                  )}
                  Mit Google anmelden
                </button>
              </div>
            ) : (
            <>
              {authMode === 'browser' && (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200">
                  Lokaler Browser-Profilspeicher aktiv (ohne Cloud-Sync bis Firebase konfiguriert ist).
                </div>
              )}
              <div className="flex rounded-lg border border-slate-800 bg-slate-900/70 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setErrorMsg(null);
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
                    tab === 'login'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Anmelden
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setErrorMsg(null);
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
                    tab === 'register'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Neues Profil
                </button>
              </div>

              {tab === 'login' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-3">
                  {profilesList.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-400">
                        Vorhandene Profile:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {profilesList.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setUsername(p.username)}
                            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                              username.toLowerCase() === p.username
                                ? 'border-sky-400/60 bg-sky-500/15 text-sky-200'
                                : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: p.avatarColor }}
                            />
                            <span className="font-medium">{p.displayName}</span>
                            <span className="text-slate-500">@{p.username}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-300">
                      Benutzername
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="z. B. lukas"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-300">
                      Passwort
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                    Jetzt anmelden
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-300">
                      Benutzername (a–z, 0–9)
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="z. B. lukas"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-300">
                      Anzeigename (optional)
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="z. B. Lukas Portfolio"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-300">
                      Passwort (min. 4 Zeichen)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={4}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mindestens 4 Zeichen"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">Profilfarbe:</span>
                    <div className="flex items-center gap-1.5">
                      {AVATAR_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          aria-label={`Profilfarbe ${col}`}
                          onClick={() => setAvatarColor(col)}
                          className={`h-5 w-5 rounded-full transition ${
                            avatarColor === col ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0f1623]' : 'opacity-75 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/50 px-2.5 py-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={importCurrentWorkspace}
                      onChange={(e) => setImportCurrentWorkspace(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900"
                    />
                    Aktuelle Ansicht &amp; Bookmarks übernehmen
                  </label>

                  <button
                    type="submit"
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    Profil erstellen
                  </button>
                </form>
              )}
            </>
            )
          ) : (
            /* Logged-In Profile View */
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-center gap-2.5">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName}
                      className="h-10 w-10 rounded-full border border-slate-700 object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-slate-950"
                      style={{ backgroundColor: user.avatarColor }}
                    >
                      {getInitials(user.displayName)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{user.displayName}</div>
                    <div className="text-[11px] text-slate-400">
                      {user.email ? user.email : `@${user.username}`}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-medium text-emerald-300">
                    {syncStatus === 'saving' ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Speichert…
                      </>
                    ) : syncStatus === 'error' ? (
                      <>
                        <CloudOff className="h-3 w-3 text-rose-400" />
                        <span className="text-rose-300">Fehler</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        Dauerhaft gespeichert
                      </>
                    )}
                  </div>
                  <div className="font-mono-num mt-1 text-[10px] text-slate-500">
                    Stand: {formattedSavedTime}
                  </div>
                </div>
              </div>

              {syncError && (
                <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  Sync-Hinweis: {syncError}
                </div>
              )}

              <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-300">
                Gespeicherte Ansicht:{' '}
                <strong className="text-slate-100">{bookmarkedCount} Bookmarks</strong> ·{' '}
                {folders.length} Ordner · {activeWidgets.length} Widgets (Auto-Sync aktiv)
              </div>

              <form onSubmit={handleProfileSave} className="space-y-2">
                <label className="block text-[11px] font-medium text-slate-300">
                  Anzeigename ändern
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
                  >
                    Speichern
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => void onFlushNow()}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  <Save className="h-3.5 w-3.5 text-sky-400" />
                  Jetzt speichern
                </button>

                <button
                  type="button"
                  onClick={handleLogoutClick}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Abmelden / Profil wechseln
                </button>
              </div>

              <div className="border-t border-slate-800/80 pt-2">
                {!showDeleteZone ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteZone(true)}
                    className="flex items-center gap-1 text-[11px] text-rose-400/80 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" />
                    Profil dauerhaft löschen…
                  </button>
                ) : (
                  <form onSubmit={handleDeleteSubmit} className="space-y-2 rounded-lg border border-rose-500/35 bg-rose-950/30 p-2.5">
                    <div className="text-[11px] font-medium text-rose-200">
                      {authMode === 'firebase'
                        ? 'Gespeicherte Cloud-Ansicht in Firestore löschen und abmelden:'
                        : 'Profil und alle gespeicherten Daten unwiderruflich löschen:'}
                    </div>
                    <div className="flex gap-2">
                      {authMode !== 'firebase' && (
                        <input
                          type="password"
                          required
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          placeholder="Passwort bestätigen"
                          className="min-w-0 flex-1 rounded border border-rose-500/40 bg-slate-950 px-2.5 py-1 text-xs text-slate-100 outline-none"
                        />
                      )}
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                      >
                        Löschen
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteZone(false);
                          setDeletePassword('');
                        }}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

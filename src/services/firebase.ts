import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { PersistedWorkspaceState, UserProfileSummary } from '../../shared/types.ts';

function readEnv(key: string): string {
  const val =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env as Record<string, string | undefined> | undefined)?.[key]) ||
    '';
  return String(val).trim();
}

function getFirebaseConfig() {
  return {
    apiKey: readEnv('VITE_FIREBASE_API_KEY'),
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readEnv('VITE_FIREBASE_APP_ID'),
  };
}

export function isFirebaseConfigured(): boolean {
  const cfg = getFirebaseConfig();
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId);
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

function ensureFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase ist nicht konfiguriert.');
  }
  if (!cachedApp) {
    const existing = getApps();
    cachedApp = existing.length > 0 ? existing[0] : initializeApp(getFirebaseConfig());
    cachedAuth = getAuth(cachedApp);
    cachedDb = getFirestore(cachedApp);
  }
  return {
    app: cachedApp,
    auth: cachedAuth!,
    db: cachedDb!,
  };
}

const PALETTE = ['#38bdf8', '#10b981', '#f59e0b', '#a78bfa', '#f43f5e'];

function pickAvatarColor(uid: string): string {
  let sum = 0;
  for (let i = 0; i < uid.length; i++) sum += uid.charCodeAt(i);
  return PALETTE[sum % PALETTE.length];
}

export function mapFirebaseUser(
  fbUser: User,
  overrideDisplayName?: string,
  overrideUpdatedAt?: string,
): UserProfileSummary {
  const now = new Date().toISOString();
  const baseName =
    overrideDisplayName?.trim() ||
    fbUser.displayName?.trim() ||
    fbUser.email?.split('@')[0] ||
    'Google Nutzer';
  return {
    id: fbUser.uid,
    username: fbUser.email?.split('@')[0] || fbUser.uid.slice(0, 12),
    displayName: baseName,
    avatarColor: pickAvatarColor(fbUser.uid),
    email: fbUser.email,
    photoURL: fbUser.photoURL,
    provider: 'google',
    createdAt: fbUser.metadata.creationTime ?? now,
    updatedAt: overrideUpdatedAt ?? fbUser.metadata.lastSignInTime ?? now,
  };
}

export async function signInWithGoogle(): Promise<UserProfileSummary> {
  const { auth } = ensureFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    return mapFirebaseUser(cred.user);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google-Anmeldung wurde abgebrochen.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Popup wurde vom Browser blockiert — bitte Popups für diese Seite erlauben.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'Domain in Firebase Authentication nicht freigegeben (Authorized Domains prüfen).',
      );
    }
    throw err instanceof Error ? err : new Error('Google-Anmeldung fehlgeschlagen.');
  }
}

export async function signOutFirebase(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const { auth } = ensureFirebase();
  await signOut(auth);
}

export function subscribeFirebaseAuth(
  onUserChange: (rawUser: User | null) => void,
): () => void {
  if (!isFirebaseConfigured()) {
    onUserChange(null);
    return () => {};
  }
  const { auth } = ensureFirebase();
  return onAuthStateChanged(auth, onUserChange);
}

interface FirestoreUserDoc {
  workspace?: PersistedWorkspaceState;
  profile?: {
    displayName?: string;
    email?: string | null;
    photoURL?: string | null;
  };
  updatedAt?: string;
}

export async function loadFirestoreWorkspace(uid: string): Promise<{
  workspace: PersistedWorkspaceState | null;
  displayName?: string;
  updatedAt?: string;
}> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return { workspace: null };
  }
  const data = snap.data() as FirestoreUserDoc;
  return {
    workspace: data.workspace ?? null,
    displayName: data.profile?.displayName,
    updatedAt: data.updatedAt,
  };
}

export async function saveFirestoreWorkspace(
  uid: string,
  workspace: PersistedWorkspaceState,
  profileMeta?: { displayName?: string; email?: string | null; photoURL?: string | null },
): Promise<{ savedAt: string }> {
  const { db } = ensureFirebase();
  const savedAt = new Date().toISOString();
  await setDoc(
    doc(db, 'users', uid),
    {
      workspace,
      ...(profileMeta ? { profile: profileMeta } : {}),
      updatedAt: savedAt,
    },
    { merge: true },
  );
  return { savedAt };
}

export async function updateFirestoreDisplayName(
  uid: string,
  displayName: string,
): Promise<{ updatedAt: string }> {
  const { db } = ensureFirebase();
  const updatedAt = new Date().toISOString();
  await setDoc(
    doc(db, 'users', uid),
    {
      profile: { displayName: displayName.trim().slice(0, 40) },
      updatedAt,
    },
    { merge: true },
  );
  return { updatedAt };
}

export async function deleteFirestoreUserData(uid: string): Promise<void> {
  const { db, auth } = ensureFirebase();
  await deleteDoc(doc(db, 'users', uid));
  await signOut(auth);
}

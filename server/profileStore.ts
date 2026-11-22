import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PersistedWorkspaceState, UserProfileSummary } from '../shared/types.ts';

interface StoredUserRecord extends UserProfileSummary {
  passwordHash: string;
}

interface StoredSessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export class ProfileStoreError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ProfileStoreError';
    this.statusCode = statusCode;
  }
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;
const ALLOWED_COLORS = new Set([
  '#38bdf8',
  '#10b981',
  '#f59e0b',
  '#a78bfa',
  '#f43f5e',
  '#22d3ee',
]);

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

function toPublicSummary(u: StoredUserRecord): UserProfileSummary {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function sanitizeColor(color?: string): string {
  if (color && ALLOWED_COLORS.has(color)) return color;
  return '#38bdf8';
}

export class ProfileStore {
  readonly dataDir: string;
  private readonly usersFile: string;
  private readonly sessionsFile: string;
  private readonly workspacesDir: string;

  constructor(dataDir = path.resolve(process.cwd(), 'data')) {
    this.dataDir = dataDir;
    this.usersFile = path.join(dataDir, 'users.json');
    this.sessionsFile = path.join(dataDir, 'sessions.json');
    this.workspacesDir = path.join(dataDir, 'workspaces');
  }

  private ensureDirs(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.workspacesDir, { recursive: true });
  }

  private readJsonFile<T>(filePath: string, fallback: T): T {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private writeJsonAtomic(filePath: string, data: unknown): void {
    this.ensureDirs();
    const json = JSON.stringify(data, null, 2);
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(tmpPath, json, 'utf8');
    try {
      fs.renameSync(tmpPath, filePath);
    } catch {
      // Fallback for Windows antivirus/indexer locks
      fs.writeFileSync(filePath, json, 'utf8');
      fs.rmSync(tmpPath, { force: true });
    }
  }

  private loadUsers(): StoredUserRecord[] {
    return this.readJsonFile<StoredUserRecord[]>(this.usersFile, []);
  }

  private saveUsers(users: StoredUserRecord[]): void {
    this.writeJsonAtomic(this.usersFile, users);
  }

  private loadActiveSessions(): { sessions: StoredSessionRecord[]; pruned: boolean } {
    const raw = this.readJsonFile<StoredSessionRecord[]>(this.sessionsFile, []);
    const now = Date.now();
    const active = raw.filter((s) => {
      const exp = Date.parse(s.expiresAt);
      return Number.isFinite(exp) && exp > now;
    });
    return { sessions: active, pruned: active.length !== raw.length };
  }

  private saveSessions(sessions: StoredSessionRecord[]): void {
    this.writeJsonAtomic(this.sessionsFile, sessions);
  }

  private workspacePath(userId: string): string {
    const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(this.workspacesDir, `${safeId}.json`);
  }

  private readWorkspace(userId: string): PersistedWorkspaceState | null {
    return this.readJsonFile<PersistedWorkspaceState | null>(this.workspacePath(userId), null);
  }

  private createSession(userId: string): string {
    const { sessions } = this.loadActiveSessions();
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    sessions.push({
      token,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    });
    this.saveSessions(sessions);
    return token;
  }

  listPublicProfiles(): UserProfileSummary[] {
    return this.loadUsers()
      .map(toPublicSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  register(input: {
    username: string;
    displayName?: string;
    password: string;
    avatarColor?: string;
    initialWorkspace?: PersistedWorkspaceState | null;
  }): {
    user: UserProfileSummary;
    token: string;
    workspace: PersistedWorkspaceState | null;
  } {
    const username = normalizeUsername(input.username ?? '');
    if (!USERNAME_RE.test(username)) {
      throw new ProfileStoreError(
        'Benutzername muss 2–32 Zeichen lang sein (a–z, 0–9, ., _, -).',
        400,
      );
    }

    const password = String(input.password ?? '');
    if (password.length < 4 || password.length > 128) {
      throw new ProfileStoreError('Passwort muss zwischen 4 und 128 Zeichen lang sein.', 400);
    }

    const users = this.loadUsers();
    if (users.some((u) => u.username === username)) {
      throw new ProfileStoreError(`Profil „${username}“ existiert bereits.`, 409);
    }

    const now = new Date().toISOString();
    const displayName = (input.displayName ?? '').trim().slice(0, 40) || username;
    const newUser: StoredUserRecord = {
      id: crypto.randomUUID(),
      username,
      displayName,
      avatarColor: sanitizeColor(input.avatarColor),
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    };

    users.push(newUser);
    this.saveUsers(users);

    let workspace: PersistedWorkspaceState | null = null;
    if (input.initialWorkspace && typeof input.initialWorkspace === 'object') {
      workspace = input.initialWorkspace;
      this.writeJsonAtomic(this.workspacePath(newUser.id), workspace);
    }

    const token = this.createSession(newUser.id);
    return {
      user: toPublicSummary(newUser),
      token,
      workspace,
    };
  }

  login(
    rawUsername: string,
    password: string,
  ): {
    user: UserProfileSummary;
    token: string;
    workspace: PersistedWorkspaceState | null;
  } {
    const username = normalizeUsername(rawUsername ?? '');
    const users = this.loadUsers();
    const found = users.find((u) => u.username === username);
    if (!found || !verifyPassword(String(password ?? ''), found.passwordHash)) {
      throw new ProfileStoreError('Benutzername oder Passwort ungültig.', 401);
    }

    const token = this.createSession(found.id);
    const workspace = this.readWorkspace(found.id);
    return {
      user: toPublicSummary(found),
      token,
      workspace,
    };
  }

  getSession(
    token: string | undefined,
  ): { user: UserProfileSummary; workspace: PersistedWorkspaceState | null } | null {
    if (!token || typeof token !== 'string') return null;
    const { sessions, pruned } = this.loadActiveSessions();
    if (pruned) {
      this.saveSessions(sessions);
    }
    const match = sessions.find((s) => s.token === token);
    if (!match) return null;

    const users = this.loadUsers();
    const user = users.find((u) => u.id === match.userId);
    if (!user) return null;

    return {
      user: toPublicSummary(user),
      workspace: this.readWorkspace(user.id),
    };
  }

  logout(token: string | undefined): void {
    if (!token) return;
    const { sessions } = this.loadActiveSessions();
    const next = sessions.filter((s) => s.token !== token);
    if (next.length !== sessions.length) {
      this.saveSessions(next);
    }
  }

  saveWorkspace(userId: string, workspace: PersistedWorkspaceState): { savedAt: string } {
    if (!workspace || typeof workspace !== 'object') {
      throw new ProfileStoreError('Ungültiges Workspace-Format.', 400);
    }
    const users = this.loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) {
      throw new ProfileStoreError('Benutzerprofil nicht gefunden.', 404);
    }

    const savedAt = new Date().toISOString();
    this.writeJsonAtomic(this.workspacePath(userId), workspace);
    users[idx] = { ...users[idx], updatedAt: savedAt };
    this.saveUsers(users);
    return { savedAt };
  }

  updateProfile(
    userId: string,
    patch: { displayName?: string; avatarColor?: string },
  ): UserProfileSummary {
    const users = this.loadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) {
      throw new ProfileStoreError('Benutzerprofil nicht gefunden.', 404);
    }

    const existing = users[idx];
    const nextDisplay =
      typeof patch.displayName === 'string' && patch.displayName.trim().length > 0
        ? patch.displayName.trim().slice(0, 40)
        : existing.displayName;
    const nextColor =
      typeof patch.avatarColor === 'string' ? sanitizeColor(patch.avatarColor) : existing.avatarColor;

    users[idx] = {
      ...existing,
      displayName: nextDisplay,
      avatarColor: nextColor,
      updatedAt: new Date().toISOString(),
    };
    this.saveUsers(users);
    return toPublicSummary(users[idx]);
  }

  deleteProfile(userId: string, password: string): void {
    const users = this.loadUsers();
    const target = users.find((u) => u.id === userId);
    if (!target) {
      throw new ProfileStoreError('Benutzerprofil nicht gefunden.', 404);
    }
    if (!verifyPassword(String(password ?? ''), target.passwordHash)) {
      throw new ProfileStoreError('Passwort zur Bestätigung ist falsch.', 401);
    }

    this.saveUsers(users.filter((u) => u.id !== userId));
    const { sessions } = this.loadActiveSessions();
    this.saveSessions(sessions.filter((s) => s.userId !== userId));
    fs.rmSync(this.workspacePath(userId), { force: true });
  }
}

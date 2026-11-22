import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PersistedWorkspaceState } from '../shared/types.ts';
import { ProfileStore, ProfileStoreError } from '../server/profileStore.ts';

function buildWorkspace(activeSymbol: string, bookmarkedSymbols: string[]): PersistedWorkspaceState {
  return {
    activeSymbol,
    activeTimeframe: '1d',
    activePreset: 'analyse-fokus',
    activeWidgets: ['catalog-explorer', 'master-chart'],
    layouts: { lg: [] },
    layoutLocked: false,
    proseTab: 'asset',
    proseDepth: 'compact',
    showFundamentalsSidebar: false,
    chartSettings: { showEma21: true },
    manualFibs: {},
    folders: [{ id: 'f-custom', name: 'Mein Fokus', parentId: null, color: '#38bdf8', collapsed: false }],
    catalogAssets: bookmarkedSymbols.map((sym) => ({
      symbol: sym,
      name: `${sym} Corp`,
      shortName: sym,
      assetClass: 'equities',
      unit: 'USD',
      decimals: 2,
      folderId: 'f-custom',
      bookmarked: true,
    })),
  };
}

describe('ProfileStore Persistent Multi-User Storage', () => {
  let tmpDir = '';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashinvest-profile-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers users with scrypt password hashes, rejects duplicates & invalid credentials', () => {
    const store = new ProfileStore(tmpDir);
    const wsA = buildWorkspace('AAPL', ['AAPL', 'NVDA']);

    const reg = store.register({
      username: 'Alice',
      displayName: 'Alice Investor',
      password: 'secret-password',
      avatarColor: '#10b981',
      initialWorkspace: wsA,
    });

    expect(reg.user.username).toBe('alice');
    expect(reg.user.displayName).toBe('Alice Investor');
    expect((reg.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    expect(reg.workspace?.activeSymbol).toBe('AAPL');

    // Public list exposes metadata only, never hashes
    const publicProfiles = store.listPublicProfiles();
    expect(publicProfiles).toHaveLength(1);
    expect(publicProfiles[0].username).toBe('alice');
    expect((publicProfiles[0] as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

    // Duplicate registration rejected with 409
    try {
      store.register({ username: 'ALICE', password: 'another-password' });
      expect.fail('Expected duplicate registration to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileStoreError);
      expect((err as ProfileStoreError).statusCode).toBe(409);
    }

    // Wrong password rejected with 401
    try {
      store.login('alice', 'wrong-password');
      expect.fail('Expected bad password to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileStoreError);
      expect((err as ProfileStoreError).statusCode).toBe(401);
    }
  });

  it('persists sessions & isolated per-user workspaces across fresh store instances and handles updates/deletion', () => {
    // User B in same persistent directory
    const store1 = new ProfileStore(tmpDir);
    const wsB = buildWorkspace('MSFT', ['MSFT']);
    const regB = store1.register({
      username: 'bob',
      password: 'bob-password',
      initialWorkspace: wsB,
    });

    // Update User A workspace and reload using a brand new ProfileStore instance (simulating server restart)
    const loginA = store1.login('alice', 'secret-password');
    const updatedWsA = buildWorkspace('SAP.DE', ['SAP.DE', 'GC=F']);
    store1.saveWorkspace(loginA.user.id, updatedWsA);

    const storeAfterRestart = new ProfileStore(tmpDir);
    const sessionA = storeAfterRestart.getSession(loginA.token);
    const sessionB = storeAfterRestart.getSession(regB.token);

    expect(sessionA?.user.username).toBe('alice');
    expect(sessionA?.workspace?.activeSymbol).toBe('SAP.DE');
    expect(sessionA?.workspace?.catalogAssets.map((a) => a.symbol)).toEqual(['SAP.DE', 'GC=F']);

    expect(sessionB?.user.username).toBe('bob');
    expect(sessionB?.workspace?.activeSymbol).toBe('MSFT');

    // Update displayName
    const renamed = storeAfterRestart.updateProfile(loginA.user.id, { displayName: 'Alice Neu' });
    expect(renamed.displayName).toBe('Alice Neu');

    // Logout invalidates token A
    storeAfterRestart.logout(loginA.token);
    expect(storeAfterRestart.getSession(loginA.token)).toBeNull();

    // Wrong password on delete throws 401; correct password deletes user B and its workspace
    expect(() => storeAfterRestart.deleteProfile(regB.user.id, 'bad')).toThrowError(ProfileStoreError);
    storeAfterRestart.deleteProfile(regB.user.id, 'bob-password');
    expect(storeAfterRestart.getSession(regB.token)).toBeNull();
    expect(storeAfterRestart.listPublicProfiles().map((u) => u.username)).toEqual(['alice']);
  });
});

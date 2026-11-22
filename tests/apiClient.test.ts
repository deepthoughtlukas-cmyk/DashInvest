import { describe, expect, it } from 'vitest';
import {
  browserProfileStore,
  sanitizeSymbolFileKey,
  searchCatalogOffline,
} from '../src/services/apiClient.ts';
import type { PersistedWorkspaceState } from '../shared/types.ts';

function sampleWorkspace(activeSymbol: string): PersistedWorkspaceState {
  return {
    activeSymbol,
    activeTimeframe: '1d',
    activePreset: 'analyse-fokus',
    activeWidgets: ['master-chart'],
    layouts: {},
    layoutLocked: false,
    proseTab: 'macro',
    proseDepth: 'detailed',
    showFundamentalsSidebar: true,
    chartSettings: {},
    manualFibs: {},
    folders: [],
    catalogAssets: [],
  };
}

describe('apiClient Helpers & Browser Profile Fallback', () => {
  it('sanitizes symbols cleanly for static snapshot filenames and searches catalog offline', () => {
    expect(sanitizeSymbolFileKey('GC=F')).toBe('GC_F');
    expect(sanitizeSymbolFileKey('GOLD')).toBe('GC_F');
    expect(sanitizeSymbolFileKey('^GSPC')).toBe('_GSPC');
    expect(sanitizeSymbolFileKey('DX-Y.NYB')).toBe('DX-Y.NYB');
    expect(sanitizeSymbolFileKey('NVDA')).toBe('NVDA');

    const matches = searchCatalogOffline('nvidia');
    expect(matches.some((m) => m.symbol === 'NVDA')).toBe(true);
  });

  it('registers, isolates, logs in and deletes multi-user profiles in browser fallback store', () => {
    const regA = browserProfileStore.register({
      username: 'user_a',
      displayName: 'User A',
      password: 'passA',
      initialWorkspace: sampleWorkspace('AAPL'),
    });
    expect(regA.user.username).toBe('user_a');
    expect(browserProfileStore.getActiveSession()?.user.username).toBe('user_a');

    browserProfileStore.logout();
    expect(browserProfileStore.getActiveSession()).toBeNull();

    const regB = browserProfileStore.register({
      username: 'user_b',
      password: 'passB',
      initialWorkspace: sampleWorkspace('NVDA'),
    });
    expect(regB.workspace?.activeSymbol).toBe('NVDA');

    const loginA = browserProfileStore.login('user_a', 'passA');
    expect(loginA.workspace?.activeSymbol).toBe('AAPL');

    browserProfileStore.saveWorkspace(loginA.user.id, sampleWorkspace('SAP.DE'));
    expect(browserProfileStore.getActiveSession()?.workspace?.activeSymbol).toBe('SAP.DE');

    const renamed = browserProfileStore.updateProfile(loginA.user.id, {
      displayName: 'User A Pro',
    });
    expect(renamed.displayName).toBe('User A Pro');

    browserProfileStore.deleteProfile(loginA.user.id, 'passA');
    expect(browserProfileStore.listProfiles().map((p) => p.username)).toEqual(['user_b']);

    browserProfileStore.deleteProfile(regB.user.id, 'passB');
    expect(browserProfileStore.listProfiles()).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG_ASSETS, DEFAULT_FOLDERS } from '../shared/catalog.ts';
import { useDashboardStore } from '../src/store/dashboardStore.ts';

describe('Asset Catalog, Folder Hierarchy & Bookmarks Store', () => {
  beforeEach(() => {
    useDashboardStore.getState().resetCatalogToDefaults();
    useDashboardStore.getState().setActiveSymbol('GC=F');
  });

  it('provides curated multi-asset starter catalog with nested folders and default bookmarks', () => {
    const state = useDashboardStore.getState();
    expect(state.catalogAssets.length).toBeGreaterThanOrEqual(30);
    expect(state.folders.some((f) => f.parentId !== null)).toBe(true);
    expect(state.catalogAssets.some((a) => a.symbol === 'NVDA' && a.bookmarked)).toBe(true);
    expect(state.catalogAssets.some((a) => a.symbol === 'BTC-USD' && a.bookmarked)).toBe(true);
  });

  it('creates root folders & nested subfolders, renames, collapses, and safely migrates assets on delete', () => {
    const store = useDashboardStore.getState();
    const initialAssetCount = store.catalogAssets.length;

    const rootId = store.createFolder('Mein Fokus', null, '#38bdf8');
    const subId = store.createFolder('Halbleiter', rootId, '#c084fc');

    let next = useDashboardStore.getState();
    expect(next.folders.some((f) => f.id === rootId && f.parentId === null)).toBe(true);
    expect(next.folders.some((f) => f.id === subId && f.parentId === rootId)).toBe(true);

    // Move NVDA into subfolder, rename subfolder, toggle collapsed
    store.moveAssetToFolder('NVDA', subId);
    store.renameFolder(subId, 'Chips & AI');
    store.toggleFolderCollapsed(subId);

    next = useDashboardStore.getState();
    expect(next.catalogAssets.find((a) => a.symbol === 'NVDA')?.folderId).toBe(subId);
    expect(next.folders.find((f) => f.id === subId)?.name).toBe('Chips & AI');
    expect(next.folders.find((f) => f.id === subId)?.collapsed).toBe(true);

    // Delete subfolder -> NVDA safely moves up to parent folder (rootId), zero assets lost
    store.deleteFolder(subId);
    next = useDashboardStore.getState();
    expect(next.folders.some((f) => f.id === subId)).toBe(false);
    expect(next.catalogAssets.find((a) => a.symbol === 'NVDA')?.folderId).toBe(rootId);
    expect(next.catalogAssets).toHaveLength(initialAssetCount);

    // Deleting all folders stops cleanly before deleting the last remaining folder
    for (const f of [...next.folders]) {
      useDashboardStore.getState().deleteFolder(f.id);
    }
    expect(useDashboardStore.getState().folders.length).toBe(1);
    expect(useDashboardStore.getState().catalogAssets).toHaveLength(initialAssetCount);
  });

  it('handles bookmarks, adding & deduplicating assets, removing active asset, and resetting defaults', () => {
    const store = useDashboardStore.getState();

    // Toggle bookmark on AAPL
    expect(store.catalogAssets.find((a) => a.symbol === 'AAPL')?.bookmarked).toBe(false);
    store.toggleBookmark('AAPL');
    expect(useDashboardStore.getState().catalogAssets.find((a) => a.symbol === 'AAPL')?.bookmarked).toBe(
      true,
    );

    // Add AMD to catalog
    store.addAssetToCatalog({
      symbol: 'amd',
      name: 'Advanced Micro Devices Inc.',
      shortName: 'AMD',
      assetClass: 'equities',
      unit: 'USD',
      decimals: 2,
      folderId: 'folder-equities-us',
      bookmarked: true,
    });
    expect(useDashboardStore.getState().catalogAssets.find((a) => a.symbol === 'AMD')).toBeDefined();

    // Re-adding AMD moves/updates without duplicating
    const lenAfterAdd = useDashboardStore.getState().catalogAssets.length;
    store.addAssetToCatalog({
      symbol: 'AMD',
      name: 'Advanced Micro Devices Inc.',
      shortName: 'AMD',
      assetClass: 'equities',
      unit: 'USD',
      decimals: 2,
      folderId: 'folder-equities',
      bookmarked: true,
    });
    expect(useDashboardStore.getState().catalogAssets).toHaveLength(lenAfterAdd);
    expect(useDashboardStore.getState().catalogAssets.find((a) => a.symbol === 'AMD')?.folderId).toBe(
      'folder-equities',
    );

    // Removing the currently active symbol automatically switches activeSymbol to a valid remaining symbol
    store.setActiveSymbol('AMD');
    expect(useDashboardStore.getState().activeSymbol).toBe('AMD');
    store.removeAssetFromCatalog('AMD');
    expect(useDashboardStore.getState().catalogAssets.some((a) => a.symbol === 'AMD')).toBe(false);
    expect(useDashboardStore.getState().activeSymbol).not.toBe('AMD');

    // Reset restores defaults cleanly
    store.resetCatalogToDefaults();
    expect(useDashboardStore.getState().folders).toHaveLength(DEFAULT_FOLDERS.length);
    expect(useDashboardStore.getState().catalogAssets).toHaveLength(DEFAULT_CATALOG_ASSETS.length);
  });
});

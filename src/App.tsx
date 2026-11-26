import React, { useCallback, useEffect, useState } from 'react';
import { FolderTree, X } from 'lucide-react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardStore } from './store/dashboardStore.ts';
import { useDashboardIntelligence } from './hooks/useMarketData.ts';
import { TopBar } from './components/layout/TopBar.tsx';
import { DashboardGrid } from './components/layout/DashboardGrid.tsx';
import { CatalogExplorerWidget } from './components/widgets/CatalogExplorerWidget.tsx';
import { PattySyncModal } from './components/patty/PattySyncModal.tsx';
import {
  PATTY_AUTO_SYNC_STORAGE_KEY,
  PATTY_BROWSER_STORAGE_KEY,
  buildPattySyncMeta,
  normalizePattyInvestments,
  readBrowserPattyWorkspace,
  resolvePattyInvestments,
} from './services/pattySync.ts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const DashboardWorkspace: React.FC = () => {
  const qc = useQueryClient();
  const {
    activeSymbol,
    catalogAssets,
    activeTimeframe,
    refreshIntervalMs,
    elliottDegree,
  } = useDashboardStore(
    useShallow((s) => ({
      activeSymbol: s.activeSymbol,
      catalogAssets: s.catalogAssets,
      activeTimeframe: s.activeTimeframe,
      refreshIntervalMs: s.refreshIntervalMs,
      elliottDegree: s.chartSettings.elliottDegree,
    })),
  );

  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);
  const [pattyModalOpen, setPattyModalOpen] = useState(false);

  const handleRefreshAll = useCallback(() => {
    void qc.invalidateQueries();
  }, [qc]);
  const handleOpenCatalog = useCallback(() => setCatalogDrawerOpen(true), []);
  const handleOpenPattySync = useCallback(() => setPattyModalOpen(true), []);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== PATTY_BROWSER_STORAGE_KEY) return;
      try {
        if (window.localStorage.getItem(PATTY_AUTO_SYNC_STORAGE_KEY) !== 'true') return;
      } catch {
        return;
      }
      const ws = readBrowserPattyWorkspace();
      if (!ws?.investments) return;
      const store = useDashboardStore.getState();
      const includeZero = store.pattyLastSync?.includeZeroQuantity ?? false;
      const normalized = normalizePattyInvestments(ws.investments, ws.rules ?? [], includeZero);
      if (normalized.length === 0) return;

      void resolvePattyInvestments({
        investments: normalized,
        overrides: store.pattySymbolOverrides,
        existingCatalogAssets: store.catalogAssets,
      }).then((result) => {
        const meta = buildPattySyncMeta('browser', 'Patty Browser Auto-Sync', result, includeZero);
        useDashboardStore.getState().syncPattyPortfolio({
          folders: result.folders,
          assets: result.assets,
          overrides: result.overrides,
          meta,
          costBasis: result.costBasis,
        });
      });
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const {
    quotesQuery,
    macroQuery,
    activeCandlesQuery,
    quoteMap,
    macroRegime,
    focusAssets,
    bookmarkedAssets,
    bookmarkedSignals7d,
    bookmarkedSignalsLoading,
    dailyAnalyses,
    macroProseReport,
    assetProseReport,
  } = useDashboardIntelligence(
    activeSymbol,
    catalogAssets,
    activeTimeframe,
    elliottDegree,
    refreshIntervalMs,
  );

  const isFetching =
    quotesQuery.isFetching || macroQuery.isFetching || activeCandlesQuery.isFetching;

  const updatedAt = quotesQuery.data?.updatedAt ?? macroQuery.data?.updatedAt;

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-100">
      <TopBar
        macroRegime={macroRegime}
        updatedAt={updatedAt}
        isFetching={isFetching}
        onRefreshAll={handleRefreshAll}
        onOpenCatalog={handleOpenCatalog}
      />

      <main className="mx-auto max-w-[1920px]">
        <DashboardGrid
          macro={macroQuery.data}
          macroLoading={macroQuery.isLoading}
          quoteMap={quoteMap}
          focusAssets={focusAssets}
          bookmarkedAssets={bookmarkedAssets}
          bookmarkedSignals7d={bookmarkedSignals7d}
          bookmarkedSignalsLoading={bookmarkedSignalsLoading}
          dailyAnalyses={dailyAnalyses}
          macroRegime={macroRegime}
          macroProseReport={macroProseReport}
          assetProseReport={assetProseReport}
          onOpenCatalog={handleOpenCatalog}
          onOpenPattySync={handleOpenPattySync}
        />
      </main>

      {catalogDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-start bg-black/65 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-md flex-col border-r border-slate-800 bg-[#0f1623] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Wertpapier-Katalog &amp; Ordner verwalten
                </h2>
              </div>
              <button
                type="button"
                aria-label="Katalog-Drawer schließen"
                onClick={() => setCatalogDrawerOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <CatalogExplorerWidget
                quoteMap={quoteMap}
                onAssetSelected={() => setCatalogDrawerOpen(false)}
                onOpenPattySync={() => {
                  setCatalogDrawerOpen(false);
                  setPattyModalOpen(true);
                }}
              />
            </div>
          </div>
        </div>
      )}
      <PattySyncModal
        open={pattyModalOpen}
        onClose={() => setPattyModalOpen(false)}
      />
    </div>
  );
};

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardWorkspace />
    </QueryClientProvider>
  );
}

export default App;

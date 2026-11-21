import React, { useState } from 'react';
import { FolderTree, X } from 'lucide-react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useDashboardStore } from './store/dashboardStore.ts';
import { useDashboardIntelligence } from './hooks/useMarketData.ts';
import { TopBar } from './components/layout/TopBar.tsx';
import { DashboardGrid } from './components/layout/DashboardGrid.tsx';
import { CatalogExplorerWidget } from './components/widgets/CatalogExplorerWidget.tsx';

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
    chartSettings,
  } = useDashboardStore();

  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);

  const {
    quotesQuery,
    macroQuery,
    activeCandlesQuery,
    quoteMap,
    macroRegime,
    focusAssets,
    dailyAnalyses,
    macroProseReport,
    assetProseReport,
  } = useDashboardIntelligence(
    activeSymbol,
    catalogAssets,
    activeTimeframe,
    chartSettings.elliottDegree,
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
        onRefreshAll={() => {
          void qc.invalidateQueries();
        }}
        onOpenCatalog={() => setCatalogDrawerOpen(true)}
      />

      <main className="mx-auto max-w-[1920px]">
        <DashboardGrid
          macro={macroQuery.data}
          macroLoading={macroQuery.isLoading}
          quoteMap={quoteMap}
          focusAssets={focusAssets}
          dailyAnalyses={dailyAnalyses}
          macroRegime={macroRegime}
          macroProseReport={macroProseReport}
          assetProseReport={assetProseReport}
          onOpenCatalog={() => setCatalogDrawerOpen(true)}
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
              />
            </div>
          </div>
        </div>
      )}
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

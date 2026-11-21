import React from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useDashboardStore } from './store/dashboardStore.ts';
import { useDashboardIntelligence } from './hooks/useMarketData.ts';
import { TopBar } from './components/layout/TopBar.tsx';
import { DashboardGrid } from './components/layout/DashboardGrid.tsx';

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
  const { activeAsset, activeTimeframe, refreshIntervalMs, chartSettings } =
    useDashboardStore();

  const {
    quotesQuery,
    macroQuery,
    activeCandlesQuery,
    quoteMap,
    macroRegime,
    dailyAnalyses,
    macroProseReport,
    assetProseReport,
  } = useDashboardIntelligence(
    activeAsset,
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
      />

      <main className="mx-auto max-w-[1920px]">
        <DashboardGrid
          macro={macroQuery.data}
          macroLoading={macroQuery.isLoading}
          quoteMap={quoteMap}
          dailyAnalyses={dailyAnalyses}
          macroRegime={macroRegime}
          macroProseReport={macroProseReport}
          assetProseReport={assetProseReport}
        />
      </main>
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

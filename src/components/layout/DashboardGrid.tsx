import React, { useMemo } from 'react';
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout';
import type { CatalogAsset, MacroOverview, QuoteSummary } from '../../../shared/types.ts';
import type {
  BookmarkedSignalEvent,
  FullAssetAnalysis,
  MacroRegimeEvaluation,
} from '../../engine/signals.ts';
import type { ProseReport } from '../../engine/proseAnalysis.ts';
import { useDashboardStore, type WidgetId } from '../../store/dashboardStore.ts';
import { WIDGET_REGISTRY } from './WidgetRegistry.ts';
import { WidgetCard } from './WidgetCard.tsx';
import { AdvancedChart } from '../chart/AdvancedChart.tsx';
import { CatalogExplorerWidget } from '../widgets/CatalogExplorerWidget.tsx';
import { BookmarkSignalsWidget } from '../widgets/BookmarkSignalsWidget.tsx';
import { NetLiquidityWidget } from '../widgets/NetLiquidityWidget.tsx';
import { CreditSpreadsWidget } from '../widgets/CreditSpreadsWidget.tsx';
import { DxyWidget } from '../widgets/DxyWidget.tsx';
import { M2Widget } from '../widgets/M2Widget.tsx';
import { Us10yWidget } from '../widgets/Us10yWidget.tsx';
import { SignalMatrixWidget } from '../widgets/SignalMatrixWidget.tsx';
import { ProseAnalysisWidget } from '../widgets/ProseAnalysisWidget.tsx';

interface DashboardGridProps {
  macro?: MacroOverview;
  macroLoading: boolean;
  quoteMap: Map<string, QuoteSummary>;
  focusAssets: CatalogAsset[];
  bookmarkedAssets: CatalogAsset[];
  bookmarkedSignals7d: BookmarkedSignalEvent[];
  bookmarkedSignalsLoading: boolean;
  dailyAnalyses: Record<string, FullAssetAnalysis>;
  macroRegime: MacroRegimeEvaluation | null;
  macroProseReport: ProseReport | null;
  assetProseReport: ProseReport | null;
  onOpenCatalog: () => void;
}

function layoutsEqual(a: Layout | undefined, b: Layout | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].i !== b[i].i ||
      a[i].x !== b[i].x ||
      a[i].y !== b[i].y ||
      a[i].w !== b[i].w ||
      a[i].h !== b[i].h
    ) {
      return false;
    }
  }
  return true;
}

export const DashboardGrid: React.FC<DashboardGridProps> = ({
  macro,
  macroLoading,
  quoteMap,
  focusAssets,
  bookmarkedAssets,
  bookmarkedSignals7d,
  bookmarkedSignalsLoading,
  dailyAnalyses,
  macroRegime,
  macroProseReport,
  assetProseReport,
  onOpenCatalog,
}) => {
  const { activeWidgets, layouts, layoutLocked, setLayouts, removeWidget } =
    useDashboardStore();

  const { width, containerRef, mounted } = useContainerWidth({
    initialWidth: 1280,
  });

  const filteredLayouts: ResponsiveLayouts = useMemo(() => {
    const activeSet = new Set<string>(activeWidgets);
    const filterList = (list: Layout = []) => list.filter((item) => activeSet.has(item.i));
    return {
      lg: filterList(layouts.lg),
      md: filterList(layouts.md),
      sm: filterList(layouts.sm),
    };
  }, [activeWidgets, layouts]);

  const handleLayoutChange = (_layout: Layout, nextLayouts: ResponsiveLayouts) => {
    const unchanged =
      layoutsEqual(nextLayouts.lg, filteredLayouts.lg) &&
      layoutsEqual(nextLayouts.md, filteredLayouts.md) &&
      layoutsEqual(nextLayouts.sm, filteredLayouts.sm);
    if (unchanged) return;

    const mergeBreakpoint = (prev: Layout = [], updated: Layout = []) => {
      const updatedMap = new Map(updated.map((it) => [it.i, it]));
      const merged = prev.map((it) => updatedMap.get(it.i) ?? it);
      for (const item of updated) {
        if (!prev.some((p) => p.i === item.i)) {
          merged.push(item);
        }
      }
      return merged;
    };

    setLayouts({
      lg: mergeBreakpoint(layouts.lg, nextLayouts.lg),
      md: mergeBreakpoint(layouts.md, nextLayouts.md),
      sm: mergeBreakpoint(layouts.sm, nextLayouts.sm),
    });
  };

  const renderWidgetBody = (id: WidgetId) => {
    switch (id) {
      case 'catalog-explorer':
        return <CatalogExplorerWidget quoteMap={quoteMap} />;
      case 'master-chart':
        return <AdvancedChart macro={macro} quoteMap={quoteMap} onOpenCatalog={onOpenCatalog} />;
      case 'chart-gold':
        return <AdvancedChart lockedSymbol="GC=F" macro={macro} quoteMap={quoteMap} compact />;
      case 'chart-silver':
        return <AdvancedChart lockedSymbol="SI=F" macro={macro} quoteMap={quoteMap} compact />;
      case 'chart-sp500':
        return <AdvancedChart lockedSymbol="^GSPC" macro={macro} quoteMap={quoteMap} compact />;
      case 'chart-nasdaq':
        return <AdvancedChart lockedSymbol="^NDX" macro={macro} quoteMap={quoteMap} compact />;
      case 'prose-briefing':
        return (
          <ProseAnalysisWidget
            macroReport={macroProseReport}
            assetReport={assetProseReport}
            isLoading={macroLoading}
          />
        );
      case 'signal-matrix':
        return (
          <SignalMatrixWidget
            focusAssets={focusAssets}
            quoteMap={quoteMap}
            dailyAnalyses={dailyAnalyses}
            macroRegime={macroRegime}
          />
        );
      case 'bookmark-signals-7d':
        return (
          <BookmarkSignalsWidget
            bookmarkedAssets={bookmarkedAssets}
            signals={bookmarkedSignals7d}
            isLoading={bookmarkedSignalsLoading}
          />
        );
      case 'macro-liquidity':
        return <NetLiquidityWidget macro={macro} isLoading={macroLoading} />;
      case 'macro-credit':
        return <CreditSpreadsWidget macro={macro} isLoading={macroLoading} />;
      case 'macro-dxy':
        return <DxyWidget macro={macro} isLoading={macroLoading} />;
      case 'macro-m2':
        return <M2Widget macro={macro} isLoading={macroLoading} />;
      case 'macro-us10y':
        return <Us10yWidget macro={macro} isLoading={macroLoading} />;
    }
  };

  return (
    <div ref={containerRef} className="w-full pb-8">
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={filteredLayouts}
          breakpoints={{ lg: 1200, md: 900, sm: 0 }}
          cols={{ lg: 12, md: 10, sm: 6 }}
          rowHeight={54}
          margin={[12, 12]}
          containerPadding={[12, 12]}
          compactor={verticalCompactor}
          dragConfig={{
            enabled: !layoutLocked,
            handle: '.widget-drag-handle',
            cancel: '.widget-no-drag',
            threshold: 3,
            bounded: false,
          }}
          resizeConfig={{
            enabled: !layoutLocked,
            handles: ['se'],
          }}
          onLayoutChange={handleLayoutChange}
        >
          {activeWidgets.map((id) => {
            const def = WIDGET_REGISTRY[id];
            const isChart = id === 'master-chart' || id.startsWith('chart-');
            return (
              <div key={id}>
                <WidgetCard
                  title={def.title}
                  badge={def.badge}
                  locked={layoutLocked}
                  noPadding={isChart}
                  onRemove={() => removeWidget(id)}
                >
                  {renderWidgetBody(id)}
                </WidgetCard>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
};

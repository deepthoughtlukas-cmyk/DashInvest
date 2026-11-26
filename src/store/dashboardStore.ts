import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { ResponsiveLayouts } from 'react-grid-layout';
import {
  DEFAULT_CATALOG_ASSETS,
  DEFAULT_CATALOG_BY_SYMBOL,
  DEFAULT_FOLDERS,
  resolveCanonicalSymbol,
} from '../../shared/catalog.ts';
import type {
  AssetFolder,
  CatalogAsset,
  ChartStyle,
  ElliottDegree,
  PattySyncMeta,
  PersistedWorkspaceState,
  PersonalCostBasis,
  Timeframe,
} from '../../shared/types.ts';
import type { FibAnchor } from '../engine/fibonacci.ts';

export type PresetId = 'analyse-fokus' | 'multi-chart' | 'makro-cockpit';
export type ProseTab = 'macro' | 'asset';
export type ProseDepth = 'compact' | 'detailed';

export interface ChartSettings {
  style: ChartStyle;
  logScale: boolean;
  showEma21: boolean;
  showSma50: boolean;
  showSma200: boolean;
  showVwap: boolean;
  showSupertrend: boolean;
  showBollinger: boolean;
  showIchimoku: boolean;
  showAutoFib: boolean;
  showElliott: boolean;
  elliottDegree: ElliottDegree;
  showSignals: boolean;
  showVolume: boolean;
  showRsi: boolean;
  showMacd: boolean;
  showAdx: boolean;
}

export interface ManualFibPair {
  start: FibAnchor;
  end: FibAnchor;
}

export type WidgetId =
  | 'catalog-explorer'
  | 'master-chart'
  | 'prose-briefing'
  | 'signal-matrix'
  | 'bookmark-signals-7d'
  | 'macro-liquidity'
  | 'macro-credit'
  | 'macro-dxy'
  | 'macro-m2'
  | 'macro-us10y'
  | 'macro-us3m'
  | 'chart-gold'
  | 'chart-silver'
  | 'chart-sp500'
  | 'chart-nasdaq';

const PRESET_WIDGETS: Record<PresetId, WidgetId[]> = {
  'analyse-fokus': [
    'catalog-explorer',
    'master-chart',
    'prose-briefing',
    'signal-matrix',
    'bookmark-signals-7d',
    'macro-liquidity',
    'macro-credit',
    'macro-dxy',
    'macro-m2',
    'macro-us3m',
    'macro-us10y',
  ],
  'multi-chart': [
    'chart-gold',
    'chart-silver',
    'chart-sp500',
    'chart-nasdaq',
    'prose-briefing',
    'signal-matrix',
    'macro-liquidity',
    'macro-credit',
    'macro-dxy',
    'macro-m2',
    'macro-us3m',
    'macro-us10y',
  ],
  'makro-cockpit': [
    'macro-liquidity',
    'prose-briefing',
    'macro-credit',
    'macro-us3m',
    'macro-us10y',
    'macro-dxy',
    'macro-m2',
    'signal-matrix',
    'master-chart',
  ],
};

export function getPresetLayouts(preset: PresetId): ResponsiveLayouts {
  if (preset === 'multi-chart') {
    return {
      lg: [
        { i: 'chart-gold', x: 0, y: 0, w: 6, h: 8, minW: 4, minH: 6 },
        { i: 'chart-silver', x: 6, y: 0, w: 6, h: 8, minW: 4, minH: 6 },
        { i: 'chart-sp500', x: 0, y: 8, w: 6, h: 8, minW: 4, minH: 6 },
        { i: 'chart-nasdaq', x: 6, y: 8, w: 6, h: 8, minW: 4, minH: 6 },
        { i: 'prose-briefing', x: 0, y: 16, w: 8, h: 8, minW: 4, minH: 6 },
        { i: 'signal-matrix', x: 8, y: 16, w: 4, h: 8, minW: 3, minH: 5 },
        { i: 'macro-liquidity', x: 0, y: 24, w: 4, h: 6, minW: 3, minH: 5 },
        { i: 'macro-credit', x: 4, y: 24, w: 4, h: 6, minW: 3, minH: 5 },
        { i: 'macro-dxy', x: 8, y: 24, w: 4, h: 6, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 0, y: 30, w: 4, h: 6, minW: 3, minH: 4 },
        { i: 'macro-us3m', x: 4, y: 30, w: 4, h: 6, minW: 3, minH: 5 },
        { i: 'macro-us10y', x: 8, y: 30, w: 4, h: 6, minW: 3, minH: 4 },
      ],
      md: [
        { i: 'chart-gold', x: 0, y: 0, w: 5, h: 8, minW: 4, minH: 6 },
        { i: 'chart-silver', x: 5, y: 0, w: 5, h: 8, minW: 4, minH: 6 },
        { i: 'chart-sp500', x: 0, y: 8, w: 5, h: 8, minW: 4, minH: 6 },
        { i: 'chart-nasdaq', x: 5, y: 8, w: 5, h: 8, minW: 4, minH: 6 },
        { i: 'prose-briefing', x: 0, y: 16, w: 6, h: 8, minW: 4, minH: 6 },
        { i: 'signal-matrix', x: 6, y: 16, w: 4, h: 8, minW: 3, minH: 5 },
        { i: 'macro-liquidity', x: 0, y: 24, w: 5, h: 6, minW: 3, minH: 5 },
        { i: 'macro-credit', x: 5, y: 24, w: 5, h: 6, minW: 3, minH: 5 },
        { i: 'macro-dxy', x: 0, y: 30, w: 5, h: 5, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 5, y: 30, w: 5, h: 5, minW: 3, minH: 4 },
        { i: 'macro-us3m', x: 0, y: 35, w: 5, h: 6, minW: 3, minH: 5 },
        { i: 'macro-us10y', x: 5, y: 35, w: 5, h: 6, minW: 3, minH: 4 },
      ],
      sm: [
        { i: 'chart-gold', x: 0, y: 0, w: 6, h: 8, minW: 3, minH: 6 },
        { i: 'chart-silver', x: 0, y: 8, w: 6, h: 8, minW: 3, minH: 6 },
        { i: 'chart-sp500', x: 0, y: 16, w: 6, h: 8, minW: 3, minH: 6 },
        { i: 'chart-nasdaq', x: 0, y: 24, w: 6, h: 8, minW: 3, minH: 6 },
        { i: 'prose-briefing', x: 0, y: 32, w: 6, h: 8, minW: 3, minH: 6 },
        { i: 'signal-matrix', x: 0, y: 40, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'macro-liquidity', x: 0, y: 46, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'macro-credit', x: 0, y: 52, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'macro-dxy', x: 0, y: 58, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 0, y: 63, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'macro-us3m', x: 0, y: 68, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'macro-us10y', x: 0, y: 74, w: 6, h: 5, minW: 3, minH: 4 },
      ],
    };
  }

  if (preset === 'makro-cockpit') {
    return {
      lg: [
        { i: 'macro-liquidity', x: 0, y: 0, w: 7, h: 7, minW: 4, minH: 5 },
        { i: 'prose-briefing', x: 7, y: 0, w: 5, h: 12, minW: 4, minH: 7 },
        { i: 'macro-credit', x: 0, y: 7, w: 4, h: 5, minW: 3, minH: 5 },
        { i: 'macro-us10y', x: 4, y: 7, w: 3, h: 5, minW: 3, minH: 4 },
        { i: 'macro-us3m', x: 0, y: 12, w: 4, h: 6, minW: 3, minH: 5 },
        { i: 'macro-dxy', x: 4, y: 12, w: 4, h: 6, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 8, y: 12, w: 4, h: 6, minW: 3, minH: 4 },
        { i: 'signal-matrix', x: 0, y: 18, w: 4, h: 10, minW: 3, minH: 5 },
        { i: 'master-chart', x: 4, y: 18, w: 8, h: 10, minW: 5, minH: 7 },
      ],
      md: [
        { i: 'macro-liquidity', x: 0, y: 0, w: 6, h: 7, minW: 4, minH: 5 },
        { i: 'prose-briefing', x: 6, y: 0, w: 4, h: 12, minW: 4, minH: 7 },
        { i: 'macro-credit', x: 0, y: 7, w: 3, h: 5, minW: 3, minH: 5 },
        { i: 'macro-us10y', x: 3, y: 7, w: 3, h: 5, minW: 3, minH: 4 },
        { i: 'macro-us3m', x: 0, y: 12, w: 4, h: 6, minW: 3, minH: 5 },
        { i: 'macro-dxy', x: 4, y: 12, w: 3, h: 6, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 7, y: 12, w: 3, h: 6, minW: 3, minH: 4 },
        { i: 'signal-matrix', x: 0, y: 18, w: 4, h: 10, minW: 3, minH: 5 },
        { i: 'master-chart', x: 4, y: 18, w: 6, h: 10, minW: 5, minH: 7 },
      ],
      sm: [
        { i: 'macro-liquidity', x: 0, y: 0, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'prose-briefing', x: 0, y: 6, w: 6, h: 9, minW: 3, minH: 6 },
        { i: 'macro-credit', x: 0, y: 15, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'macro-us3m', x: 0, y: 21, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'macro-us10y', x: 0, y: 27, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'macro-dxy', x: 0, y: 32, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 0, y: 37, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'signal-matrix', x: 0, y: 42, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'master-chart', x: 0, y: 48, w: 6, h: 9, minW: 3, minH: 7 },
      ],
    };
  }

  // Default: analyse-fokus (with Catalog & Folder Explorer sidebar)
  return {
    lg: [
      { i: 'catalog-explorer', x: 0, y: 0, w: 3, h: 11, minW: 2, minH: 6 },
      { i: 'master-chart', x: 3, y: 0, w: 9, h: 11, minW: 5, minH: 7 },
      { i: 'prose-briefing', x: 0, y: 11, w: 7, h: 8, minW: 4, minH: 6 },
      { i: 'signal-matrix', x: 7, y: 11, w: 5, h: 8, minW: 3, minH: 5 },
      { i: 'bookmark-signals-7d', x: 0, y: 19, w: 12, h: 7, minW: 4, minH: 5 },
      { i: 'macro-liquidity', x: 0, y: 26, w: 4, h: 6, minW: 3, minH: 5 },
      { i: 'macro-credit', x: 4, y: 26, w: 4, h: 6, minW: 3, minH: 5 },
      { i: 'macro-dxy', x: 8, y: 26, w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'macro-m2', x: 0, y: 32, w: 4, h: 6, minW: 3, minH: 4 },
      { i: 'macro-us3m', x: 4, y: 32, w: 4, h: 6, minW: 3, minH: 5 },
      { i: 'macro-us10y', x: 8, y: 32, w: 4, h: 6, minW: 3, minH: 4 },
    ],
    md: [
      { i: 'catalog-explorer', x: 0, y: 0, w: 3, h: 11, minW: 2, minH: 6 },
      { i: 'master-chart', x: 3, y: 0, w: 7, h: 11, minW: 4, minH: 7 },
      { i: 'prose-briefing', x: 0, y: 11, w: 6, h: 8, minW: 4, minH: 6 },
      { i: 'signal-matrix', x: 6, y: 11, w: 4, h: 8, minW: 3, minH: 5 },
      { i: 'bookmark-signals-7d', x: 0, y: 19, w: 10, h: 7, minW: 4, minH: 5 },
      { i: 'macro-liquidity', x: 0, y: 26, w: 5, h: 6, minW: 3, minH: 5 },
      { i: 'macro-credit', x: 5, y: 26, w: 5, h: 6, minW: 3, minH: 5 },
      { i: 'macro-dxy', x: 0, y: 32, w: 5, h: 6, minW: 3, minH: 4 },
      { i: 'macro-m2', x: 5, y: 32, w: 5, h: 6, minW: 3, minH: 4 },
      { i: 'macro-us3m', x: 0, y: 38, w: 5, h: 6, minW: 3, minH: 5 },
      { i: 'macro-us10y', x: 5, y: 38, w: 5, h: 6, minW: 3, minH: 4 },
    ],
    sm: [
      { i: 'catalog-explorer', x: 0, y: 0, w: 6, h: 7, minW: 3, minH: 5 },
      { i: 'master-chart', x: 0, y: 7, w: 6, h: 10, minW: 3, minH: 7 },
      { i: 'prose-briefing', x: 0, y: 17, w: 6, h: 9, minW: 3, minH: 6 },
      { i: 'signal-matrix', x: 0, y: 26, w: 6, h: 6, minW: 3, minH: 5 },
      { i: 'bookmark-signals-7d', x: 0, y: 32, w: 6, h: 7, minW: 3, minH: 5 },
      { i: 'macro-liquidity', x: 0, y: 39, w: 6, h: 6, minW: 3, minH: 5 },
      { i: 'macro-credit', x: 0, y: 45, w: 6, h: 6, minW: 3, minH: 5 },
      { i: 'macro-dxy', x: 0, y: 51, w: 6, h: 5, minW: 3, minH: 4 },
      { i: 'macro-m2', x: 0, y: 56, w: 6, h: 5, minW: 3, minH: 4 },
      { i: 'macro-us3m', x: 0, y: 61, w: 6, h: 6, minW: 3, minH: 5 },
      { i: 'macro-us10y', x: 0, y: 67, w: 6, h: 5, minW: 3, minH: 4 },
    ],
  };
}

const DEFAULT_CHART_SETTINGS: ChartSettings = {
  style: 'candles',
  logScale: false,
  showEma21: true,
  showSma50: true,
  showSma200: true,
  showVwap: false,
  showSupertrend: true,
  showBollinger: false,
  showIchimoku: false,
  showAutoFib: true,
  showElliott: true,
  elliottDegree: 'intermediate',
  showSignals: true,
  showVolume: true,
  showRsi: true,
  showMacd: true,
  showAdx: false,
};

interface DashboardState {
  activeSymbol: string;
  activeTimeframe: Timeframe;
  activePreset: PresetId;
  activeWidgets: WidgetId[];
  layouts: ResponsiveLayouts;
  layoutLocked: boolean;
  refreshIntervalMs: number;
  proseTab: ProseTab;
  proseDepth: ProseDepth;
  showFundamentalsSidebar: boolean;
  chartSettings: ChartSettings;
  manualFibs: Record<string, ManualFibPair>;
  folders: AssetFolder[];
  catalogAssets: CatalogAsset[];
  pattySymbolOverrides: Record<string, string>;
  pattyLastSync: PattySyncMeta | null;
  personalCostBasis: Record<string, PersonalCostBasis>;
  setActiveSymbol: (symbol: string) => void;
  setActiveTimeframe: (tf: Timeframe) => void;
  applyPreset: (preset: PresetId) => void;
  setLayouts: (layouts: ResponsiveLayouts) => void;
  toggleWidget: (id: WidgetId) => void;
  removeWidget: (id: WidgetId) => void;
  setLayoutLocked: (locked: boolean) => void;
  resetCurrentPreset: () => void;
  setProseTab: (tab: ProseTab) => void;
  setProseDepth: (depth: ProseDepth) => void;
  setShowFundamentalsSidebar: (open: boolean) => void;
  updateChartSetting: <K extends keyof ChartSettings>(key: K, value: ChartSettings[K]) => void;
  setManualFib: (symbol: string, pair: ManualFibPair | null) => void;
  toggleBookmark: (symbol: string) => void;
  addAssetToCatalog: (asset: Omit<CatalogAsset, 'bookmarked'> & { bookmarked?: boolean }) => void;
  removeAssetFromCatalog: (symbol: string) => void;
  moveAssetToFolder: (symbol: string, folderId: string) => void;
  createFolder: (name: string, parentId: string | null, color?: string) => string;
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;
  toggleFolderCollapsed: (folderId: string) => void;
  resetCatalogToDefaults: () => void;
  syncPattyPortfolio: (payload: {
    folders: AssetFolder[];
    assets: CatalogAsset[];
    overrides: Record<string, string>;
    meta: PattySyncMeta;
    costBasis?: Record<string, PersonalCostBasis>;
  }) => void;
  setPattySymbolOverride: (pattyKey: string, symbol: string | null) => void;
  setPersonalCostBasis: (
    symbol: string,
    entry: { price: number; currency: string; source?: 'patty' | 'manual' } | null,
  ) => void;
  clearPattySync: () => void;
  hydrateWorkspace: (snapshot: Partial<PersistedWorkspaceState> | null) => void;
  resetWorkspaceToDefaults: () => void;
}

const KNOWN_WIDGET_IDS = new Set<string>([
  'catalog-explorer',
  'master-chart',
  'prose-briefing',
  'signal-matrix',
  'bookmark-signals-7d',
  'macro-liquidity',
  'macro-credit',
  'macro-dxy',
  'macro-m2',
  'macro-us3m',
  'macro-us10y',
  'chart-gold',
  'chart-silver',
  'chart-sp500',
  'chart-nasdaq',
]);

export function extractWorkspaceSnapshot(state: DashboardState): PersistedWorkspaceState {
  return {
    activeSymbol: state.activeSymbol,
    activeTimeframe: state.activeTimeframe,
    activePreset: state.activePreset,
    activeWidgets: [...state.activeWidgets],
    layouts: state.layouts as Record<string, unknown>,
    layoutLocked: state.layoutLocked,
    proseTab: state.proseTab,
    proseDepth: state.proseDepth,
    showFundamentalsSidebar: state.showFundamentalsSidebar,
    chartSettings: { ...state.chartSettings },
    manualFibs: { ...state.manualFibs },
    folders: state.folders.map((f) => ({ ...f })),
    catalogAssets: state.catalogAssets.map((a) => ({ ...a })),
    pattySymbolOverrides: { ...state.pattySymbolOverrides },
    pattyLastSync: state.pattyLastSync ? { ...state.pattyLastSync } : null,
    personalCostBasis: { ...state.personalCostBasis },
  };
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      activeSymbol: 'GC=F',
      activeTimeframe: '1d',
      activePreset: 'analyse-fokus',
      activeWidgets: [...PRESET_WIDGETS['analyse-fokus']],
      layouts: getPresetLayouts('analyse-fokus'),
      layoutLocked: false,
      refreshIntervalMs: 60_000,
      proseTab: 'macro',
      proseDepth: 'detailed',
      showFundamentalsSidebar: true,
      chartSettings: DEFAULT_CHART_SETTINGS,
      manualFibs: {},
      folders: DEFAULT_FOLDERS.map((f) => ({ ...f })),
      catalogAssets: DEFAULT_CATALOG_ASSETS.map((a) => ({ ...a })),
      pattySymbolOverrides: {},
      pattyLastSync: null,
      personalCostBasis: {},

      setActiveSymbol: (symbol) => set({ activeSymbol: resolveCanonicalSymbol(symbol) }),
      setActiveTimeframe: (tf) => set({ activeTimeframe: tf }),

      applyPreset: (preset) =>
        set({
          activePreset: preset,
          activeWidgets: [...PRESET_WIDGETS[preset]],
          layouts: getPresetLayouts(preset),
        }),

      setLayouts: (layouts) => set({ layouts }),

      toggleWidget: (id) => {
        const { activeWidgets, layouts } = get();
        if (activeWidgets.includes(id)) {
          set({ activeWidgets: activeWidgets.filter((w) => w !== id) });
          return;
        }

        const nextWidgets = [...activeWidgets, id];
        const appendIfMissing = (list: ResponsiveLayouts['lg'] = [], cols: number) => {
          if (list.some((item) => item.i === id)) return list;
          const maxY = list.reduce((m, item) => Math.max(m, item.y + item.h), 0);
          const defaultW =
            id === 'master-chart'
              ? Math.min(8, cols)
              : id === 'catalog-explorer'
                ? Math.min(3, cols)
                : id === 'bookmark-signals-7d' || id.startsWith('chart-')
                  ? Math.min(6, cols)
                  : Math.min(4, cols);
          const defaultH =
            id.includes('chart') || id === 'prose-briefing' || id === 'catalog-explorer'
              ? 9
              : id === 'bookmark-signals-7d'
                ? 7
                : 6;
          return [
            ...list,
            {
              i: id,
              x: 0,
              y: maxY,
              w: defaultW,
              h: defaultH,
              minW: id === 'catalog-explorer' ? 2 : 3,
              minH: 4,
            },
          ];
        };

        set({
          activeWidgets: nextWidgets,
          layouts: {
            lg: appendIfMissing(layouts.lg, 12),
            md: appendIfMissing(layouts.md, 10),
            sm: appendIfMissing(layouts.sm, 6),
          },
        });
      },

      removeWidget: (id) =>
        set((state) => ({
          activeWidgets: state.activeWidgets.filter((w) => w !== id),
        })),

      setLayoutLocked: (locked) => set({ layoutLocked: locked }),

      resetCurrentPreset: () => {
        const preset = get().activePreset;
        set({
          activeWidgets: [...PRESET_WIDGETS[preset]],
          layouts: getPresetLayouts(preset),
        });
      },

      setProseTab: (tab) => set({ proseTab: tab }),
      setProseDepth: (depth) => set({ proseDepth: depth }),
      setShowFundamentalsSidebar: (open) => set({ showFundamentalsSidebar: open }),

      updateChartSetting: (key, value) =>
        set((state) => ({
          chartSettings: { ...state.chartSettings, [key]: value },
        })),

      setManualFib: (symbol, pair) =>
        set((state) => {
          const canonical = resolveCanonicalSymbol(symbol);
          const next = { ...state.manualFibs };
          if (pair === null) delete next[canonical];
          else next[canonical] = pair;
          return { manualFibs: next };
        }),

      toggleBookmark: (symbol) =>
        set((state) => {
          const canonical = resolveCanonicalSymbol(symbol);
          return {
            catalogAssets: state.catalogAssets.map((a) =>
              a.symbol === canonical ? { ...a, bookmarked: !a.bookmarked } : a,
            ),
          };
        }),

      addAssetToCatalog: (asset) =>
        set((state) => {
          const canonical = resolveCanonicalSymbol(asset.symbol);
          const folderExists = state.folders.some((f) => f.id === asset.folderId);
          const targetFolderId = folderExists
            ? asset.folderId
            : state.folders[0]?.id ?? 'folder-equities';

          const existingIdx = state.catalogAssets.findIndex((a) => a.symbol === canonical);
          if (existingIdx >= 0) {
            const updated = [...state.catalogAssets];
            updated[existingIdx] = {
              ...updated[existingIdx],
              folderId: targetFolderId,
              bookmarked: asset.bookmarked ?? updated[existingIdx].bookmarked,
            };
            return { catalogAssets: updated };
          }

          return {
            catalogAssets: [
              ...state.catalogAssets,
              {
                ...asset,
                symbol: canonical,
                folderId: targetFolderId,
                bookmarked: asset.bookmarked ?? false,
              },
            ],
          };
        }),

      removeAssetFromCatalog: (symbol) =>
        set((state) => {
          const canonical = resolveCanonicalSymbol(symbol);
          const nextAssets = state.catalogAssets.filter((a) => a.symbol !== canonical);
          let nextActive = state.activeSymbol;
          if (state.activeSymbol === canonical) {
            const firstBookmarked = nextAssets.find((a) => a.bookmarked);
            nextActive = firstBookmarked?.symbol ?? nextAssets[0]?.symbol ?? 'GC=F';
          }
          return {
            catalogAssets: nextAssets,
            activeSymbol: nextActive,
          };
        }),

      moveAssetToFolder: (symbol, folderId) =>
        set((state) => {
          if (!state.folders.some((f) => f.id === folderId)) return state;
          const canonical = resolveCanonicalSymbol(symbol);
          return {
            catalogAssets: state.catalogAssets.map((a) =>
              a.symbol === canonical ? { ...a, folderId } : a,
            ),
          };
        }),

      createFolder: (name, parentId, color = '#38bdf8') => {
        const trimmed = name.trim();
        const id = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        if (!trimmed) return id;
        set((state) => {
          const validParent =
            parentId && state.folders.some((f) => f.id === parentId) ? parentId : null;
          return {
            folders: [
              ...state.folders,
              { id, name: trimmed, parentId: validParent, color, collapsed: false },
            ],
          };
        });
        return id;
      },

      renameFolder: (folderId, name) =>
        set((state) => {
          const trimmed = name.trim();
          if (!trimmed) return state;
          return {
            folders: state.folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f)),
          };
        }),

      deleteFolder: (folderId) =>
        set((state) => {
          if (state.folders.length <= 1) return state;
          const target = state.folders.find((f) => f.id === folderId);
          if (!target) return state;

          const remaining = state.folders.filter((f) => f.id !== folderId);
          const fallbackFolderId =
            target.parentId && remaining.some((f) => f.id === target.parentId)
              ? target.parentId
              : remaining[0].id;

          const nextFolders = remaining.map((f) =>
            f.parentId === folderId ? { ...f, parentId: target.parentId } : f,
          );
          const nextAssets = state.catalogAssets.map((a) =>
            a.folderId === folderId ? { ...a, folderId: fallbackFolderId } : a,
          );

          return {
            folders: nextFolders,
            catalogAssets: nextAssets,
          };
        }),

      toggleFolderCollapsed: (folderId) =>
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === folderId ? { ...f, collapsed: !f.collapsed } : f,
          ),
        })),

      resetCatalogToDefaults: () =>
        set((state) => ({
          folders: DEFAULT_FOLDERS.map((f) => ({ ...f })),
          catalogAssets: DEFAULT_CATALOG_ASSETS.map((a) => ({ ...a })),
          pattyLastSync: null,
          activeSymbol: DEFAULT_CATALOG_ASSETS.some((a) => a.symbol === state.activeSymbol)
            ? state.activeSymbol
            : 'GC=F',
        })),

      syncPattyPortfolio: ({
        folders: incomingFolders,
        assets: incomingAssets,
        overrides,
        meta,
        costBasis,
      }) =>
        set((state) => {
          const existingCollapsed = new Map(
            state.folders.map((f) => [f.id, Boolean(f.collapsed)]),
          );
          const nextPattyFolders = incomingFolders.map((f) => ({
            ...f,
            source: 'patty' as const,
            collapsed: existingCollapsed.get(f.id) ?? Boolean(f.collapsed),
          }));
          const nonPattyFolders = state.folders.filter(
            (f) => f.source !== 'patty' && !f.id.startsWith('patty-'),
          );

          const incomingBySymbol = new Map<string, CatalogAsset>();
          for (const asset of incomingAssets) {
            const canonical = resolveCanonicalSymbol(asset.symbol);
            incomingBySymbol.set(canonical, {
              ...asset,
              symbol: canonical,
              bookmarked: true,
              source: 'patty',
            });
          }

          const seenSymbols = new Set<string>();
          const mergedAssets: CatalogAsset[] = [];

          for (const existing of state.catalogAssets) {
            const canonical = resolveCanonicalSymbol(existing.symbol);
            const incoming = incomingBySymbol.get(canonical);
            if (incoming) {
              seenSymbols.add(canonical);
              mergedAssets.push({
                ...existing,
                ...incoming,
                symbol: canonical,
                bookmarked: true,
                source: 'patty',
              });
            } else if (existing.source === 'patty') {
              const def = DEFAULT_CATALOG_BY_SYMBOL.get(canonical);
              if (def) {
                mergedAssets.push({
                  ...def,
                  bookmarked: existing.bookmarked,
                });
              }
            } else {
              mergedAssets.push(existing);
            }
          }

          for (const [canonical, incoming] of incomingBySymbol) {
            if (!seenSymbols.has(canonical)) {
              mergedAssets.push(incoming);
            }
          }

          let nextCostBasis = state.personalCostBasis;
          if (costBasis !== undefined) {
            const mergedCostBasis: Record<string, PersonalCostBasis> = {};
            // Preserve existing manual entries first; clear prior Patty entries
            for (const [sym, entry] of Object.entries(state.personalCostBasis)) {
              if (entry.source === 'manual') {
                mergedCostBasis[sym] = entry;
              }
            }
            for (const [rawSym, entry] of Object.entries(costBasis)) {
              const canonical = resolveCanonicalSymbol(rawSym);
              if (mergedCostBasis[canonical]?.source === 'manual') continue;
              if (Number.isFinite(entry.price) && entry.price > 0) {
                mergedCostBasis[canonical] = { ...entry, source: 'patty' };
              }
            }
            nextCostBasis = mergedCostBasis;
          }

          return {
            folders: [...nextPattyFolders, ...nonPattyFolders],
            catalogAssets: mergedAssets,
            pattySymbolOverrides: {
              ...state.pattySymbolOverrides,
              ...overrides,
            },
            pattyLastSync: meta,
            personalCostBasis: nextCostBasis,
          };
        }),

      setPattySymbolOverride: (pattyKey, symbol) =>
        set((state) => {
          const next = { ...state.pattySymbolOverrides };
          if (!symbol || !symbol.trim()) {
            delete next[pattyKey];
          } else {
            next[pattyKey] = resolveCanonicalSymbol(symbol);
          }
          return { pattySymbolOverrides: next };
        }),

      setPersonalCostBasis: (symbol, entry) =>
        set((state) => {
          const canonical = resolveCanonicalSymbol(symbol);
          const next = { ...state.personalCostBasis };
          if (!entry || !Number.isFinite(entry.price) || entry.price <= 0) {
            delete next[canonical];
          } else {
            next[canonical] = {
              price: entry.price,
              currency: entry.currency.trim().toUpperCase() || 'EUR',
              source: entry.source ?? 'manual',
              updatedAt: new Date().toISOString(),
            };
          }
          return { personalCostBasis: next };
        }),

      clearPattySync: () =>
        set((state) => {
          const nonPattyFolders = state.folders.filter(
            (f) => f.source !== 'patty' && !f.id.startsWith('patty-'),
          );
          const nextFolders =
            nonPattyFolders.length > 0
              ? nonPattyFolders
              : DEFAULT_FOLDERS.map((f) => ({ ...f }));

          const nextAssets: CatalogAsset[] = [];
          for (const existing of state.catalogAssets) {
            if (existing.source === 'patty') {
              const def = DEFAULT_CATALOG_BY_SYMBOL.get(resolveCanonicalSymbol(existing.symbol));
              if (def) {
                nextAssets.push({
                  ...def,
                  bookmarked: existing.bookmarked,
                });
              }
            } else {
              nextAssets.push(existing);
            }
          }

          const finalAssets =
            nextAssets.length > 0
              ? nextAssets
              : DEFAULT_CATALOG_ASSETS.map((a) => ({ ...a }));

          const validActive = finalAssets.some((a) => a.symbol === state.activeSymbol)
            ? state.activeSymbol
            : (finalAssets.find((a) => a.bookmarked)?.symbol ?? finalAssets[0]?.symbol ?? 'GC=F');

          const nextCostBasis: Record<string, PersonalCostBasis> = {};
          for (const [sym, entry] of Object.entries(state.personalCostBasis)) {
            if (entry.source === 'manual') {
              nextCostBasis[sym] = entry;
            }
          }

          return {
            folders: nextFolders,
            catalogAssets: finalAssets,
            activeSymbol: validActive,
            pattyLastSync: null,
            personalCostBasis: nextCostBasis,
          };
        }),

      hydrateWorkspace: (snapshot) => {
        if (!snapshot) return;
        const validPreset: PresetId =
          snapshot.activePreset === 'multi-chart' || snapshot.activePreset === 'makro-cockpit'
            ? snapshot.activePreset
            : 'analyse-fokus';

        const validWidgets = Array.isArray(snapshot.activeWidgets)
          ? (snapshot.activeWidgets.filter((w) => KNOWN_WIDGET_IDS.has(w)) as WidgetId[])
          : [];
        const nextWidgets =
          validWidgets.length > 0 ? validWidgets : [...PRESET_WIDGETS[validPreset]];

        const validTf: Timeframe =
          snapshot.activeTimeframe === '15m' ||
          snapshot.activeTimeframe === '1h' ||
          snapshot.activeTimeframe === '4h' ||
          snapshot.activeTimeframe === '1w'
            ? snapshot.activeTimeframe
            : '1d';

        set({
          activeSymbol:
            typeof snapshot.activeSymbol === 'string' && snapshot.activeSymbol.trim().length > 0
              ? resolveCanonicalSymbol(snapshot.activeSymbol)
              : 'GC=F',
          activeTimeframe: validTf,
          activePreset: validPreset,
          activeWidgets: nextWidgets,
          layouts:
            snapshot.layouts && typeof snapshot.layouts === 'object'
              ? (snapshot.layouts as ResponsiveLayouts)
              : getPresetLayouts(validPreset),
          layoutLocked: Boolean(snapshot.layoutLocked),
          proseTab: snapshot.proseTab === 'asset' ? 'asset' : 'macro',
          proseDepth: snapshot.proseDepth === 'compact' ? 'compact' : 'detailed',
          showFundamentalsSidebar:
            typeof snapshot.showFundamentalsSidebar === 'boolean'
              ? snapshot.showFundamentalsSidebar
              : true,
          chartSettings: {
            ...DEFAULT_CHART_SETTINGS,
            ...((snapshot.chartSettings ?? {}) as Partial<ChartSettings>),
          },
          manualFibs:
            snapshot.manualFibs && typeof snapshot.manualFibs === 'object'
              ? (snapshot.manualFibs as Record<string, ManualFibPair>)
              : {},
          folders:
            Array.isArray(snapshot.folders) && snapshot.folders.length > 0
              ? snapshot.folders.map((f) => ({ ...f }))
              : DEFAULT_FOLDERS.map((f) => ({ ...f })),
          catalogAssets:
            Array.isArray(snapshot.catalogAssets) && snapshot.catalogAssets.length > 0
              ? snapshot.catalogAssets.map((a) => ({ ...a }))
              : DEFAULT_CATALOG_ASSETS.map((a) => ({ ...a })),
          pattySymbolOverrides:
            snapshot.pattySymbolOverrides && typeof snapshot.pattySymbolOverrides === 'object'
              ? { ...snapshot.pattySymbolOverrides }
              : {},
          pattyLastSync:
            snapshot.pattyLastSync && typeof snapshot.pattyLastSync === 'object'
              ? { ...snapshot.pattyLastSync }
              : null,
          personalCostBasis:
            snapshot.personalCostBasis && typeof snapshot.personalCostBasis === 'object'
              ? { ...snapshot.personalCostBasis }
              : {},
        });
      },

      resetWorkspaceToDefaults: () =>
        set({
          activeSymbol: 'GC=F',
          activeTimeframe: '1d',
          activePreset: 'analyse-fokus',
          activeWidgets: [...PRESET_WIDGETS['analyse-fokus']],
          layouts: getPresetLayouts('analyse-fokus'),
          layoutLocked: false,
          proseTab: 'macro',
          proseDepth: 'detailed',
          showFundamentalsSidebar: true,
          chartSettings: { ...DEFAULT_CHART_SETTINGS },
          manualFibs: {},
          folders: DEFAULT_FOLDERS.map((f) => ({ ...f })),
          catalogAssets: DEFAULT_CATALOG_ASSETS.map((a) => ({ ...a })),
          pattySymbolOverrides: {},
          pattyLastSync: null,
          personalCostBasis: {},
        }),
    }),
    {
      name: 'dashinvest-workspace-v4',
      storage: createJSONStorage((): StateStorage => {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage;
        }
        const mem = new Map<string, string>();
        return {
          getItem: (k) => mem.get(k) ?? null,
          setItem: (k, v) => {
            mem.set(k, v);
          },
          removeItem: (k) => {
            mem.delete(k);
          },
        };
      }),
      partialize: (state) => ({
        activeSymbol: state.activeSymbol,
        activeTimeframe: state.activeTimeframe,
        activePreset: state.activePreset,
        activeWidgets: state.activeWidgets,
        layouts: state.layouts,
        layoutLocked: state.layoutLocked,
        proseTab: state.proseTab,
        proseDepth: state.proseDepth,
        showFundamentalsSidebar: state.showFundamentalsSidebar,
        chartSettings: state.chartSettings,
        manualFibs: state.manualFibs,
        folders: state.folders,
        catalogAssets: state.catalogAssets,
        pattySymbolOverrides: state.pattySymbolOverrides,
        pattyLastSync: state.pattyLastSync,
        personalCostBasis: state.personalCostBasis,
      }),
    },
  ),
);

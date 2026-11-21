import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { ResponsiveLayouts } from 'react-grid-layout';
import type { AssetId, ChartStyle, ElliottDegree, Timeframe } from '../../shared/types.ts';
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
  | 'master-chart'
  | 'prose-briefing'
  | 'signal-matrix'
  | 'macro-liquidity'
  | 'macro-credit'
  | 'macro-dxy'
  | 'macro-m2'
  | 'macro-us10y'
  | 'chart-gold'
  | 'chart-silver'
  | 'chart-sp500'
  | 'chart-nasdaq';

const PRESET_WIDGETS: Record<PresetId, WidgetId[]> = {
  'analyse-fokus': [
    'master-chart',
    'prose-briefing',
    'macro-liquidity',
    'macro-credit',
    'signal-matrix',
    'macro-dxy',
    'macro-m2',
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
    'macro-us10y',
  ],
  'makro-cockpit': [
    'macro-liquidity',
    'prose-briefing',
    'macro-credit',
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
        { i: 'macro-m2', x: 0, y: 30, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'macro-us10y', x: 6, y: 30, w: 6, h: 5, minW: 3, minH: 4 },
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
        { i: 'macro-us10y', x: 0, y: 35, w: 10, h: 5, minW: 3, minH: 4 },
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
        { i: 'macro-us10y', x: 0, y: 68, w: 6, h: 5, minW: 3, minH: 4 },
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
        { i: 'macro-dxy', x: 0, y: 12, w: 4, h: 5, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 4, y: 12, w: 4, h: 5, minW: 3, minH: 4 },
        { i: 'signal-matrix', x: 8, y: 12, w: 4, h: 5, minW: 3, minH: 5 },
        { i: 'master-chart', x: 0, y: 17, w: 12, h: 10, minW: 5, minH: 7 },
      ],
      md: [
        { i: 'macro-liquidity', x: 0, y: 0, w: 6, h: 7, minW: 4, minH: 5 },
        { i: 'prose-briefing', x: 6, y: 0, w: 4, h: 12, minW: 4, minH: 7 },
        { i: 'macro-credit', x: 0, y: 7, w: 3, h: 5, minW: 3, minH: 5 },
        { i: 'macro-us10y', x: 3, y: 7, w: 3, h: 5, minW: 3, minH: 4 },
        { i: 'macro-dxy', x: 0, y: 12, w: 3, h: 5, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 3, y: 12, w: 3, h: 5, minW: 3, minH: 4 },
        { i: 'signal-matrix', x: 6, y: 12, w: 4, h: 5, minW: 3, minH: 5 },
        { i: 'master-chart', x: 0, y: 17, w: 10, h: 10, minW: 5, minH: 7 },
      ],
      sm: [
        { i: 'macro-liquidity', x: 0, y: 0, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'prose-briefing', x: 0, y: 6, w: 6, h: 9, minW: 3, minH: 6 },
        { i: 'macro-credit', x: 0, y: 15, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'macro-us10y', x: 0, y: 21, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'macro-dxy', x: 0, y: 26, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'macro-m2', x: 0, y: 31, w: 6, h: 5, minW: 3, minH: 4 },
        { i: 'signal-matrix', x: 0, y: 36, w: 6, h: 6, minW: 3, minH: 5 },
        { i: 'master-chart', x: 0, y: 42, w: 6, h: 9, minW: 3, minH: 7 },
      ],
    };
  }

  // Default: analyse-fokus
  return {
    lg: [
      { i: 'master-chart', x: 0, y: 0, w: 8, h: 11, minW: 5, minH: 7 },
      { i: 'prose-briefing', x: 8, y: 0, w: 4, h: 11, minW: 3, minH: 7 },
      { i: 'macro-liquidity', x: 0, y: 11, w: 4, h: 6, minW: 3, minH: 5 },
      { i: 'macro-credit', x: 4, y: 11, w: 4, h: 6, minW: 3, minH: 5 },
      { i: 'signal-matrix', x: 8, y: 11, w: 4, h: 6, minW: 3, minH: 5 },
      { i: 'macro-dxy', x: 0, y: 17, w: 4, h: 5, minW: 3, minH: 4 },
      { i: 'macro-m2', x: 4, y: 17, w: 4, h: 5, minW: 3, minH: 4 },
      { i: 'macro-us10y', x: 8, y: 17, w: 4, h: 5, minW: 3, minH: 4 },
    ],
    md: [
      { i: 'master-chart', x: 0, y: 0, w: 6, h: 11, minW: 4, minH: 7 },
      { i: 'prose-briefing', x: 6, y: 0, w: 4, h: 11, minW: 3, minH: 7 },
      { i: 'macro-liquidity', x: 0, y: 11, w: 5, h: 6, minW: 3, minH: 5 },
      { i: 'macro-credit', x: 5, y: 11, w: 5, h: 6, minW: 3, minH: 5 },
      { i: 'signal-matrix', x: 0, y: 17, w: 5, h: 6, minW: 3, minH: 5 },
      { i: 'macro-dxy', x: 5, y: 17, w: 5, h: 6, minW: 3, minH: 4 },
      { i: 'macro-m2', x: 0, y: 23, w: 5, h: 5, minW: 3, minH: 4 },
      { i: 'macro-us10y', x: 5, y: 23, w: 5, h: 5, minW: 3, minH: 4 },
    ],
    sm: [
      { i: 'master-chart', x: 0, y: 0, w: 6, h: 10, minW: 3, minH: 7 },
      { i: 'prose-briefing', x: 0, y: 10, w: 6, h: 9, minW: 3, minH: 6 },
      { i: 'macro-liquidity', x: 0, y: 19, w: 6, h: 6, minW: 3, minH: 5 },
      { i: 'macro-credit', x: 0, y: 25, w: 6, h: 6, minW: 3, minH: 5 },
      { i: 'signal-matrix', x: 0, y: 31, w: 6, h: 6, minW: 3, minH: 5 },
      { i: 'macro-dxy', x: 0, y: 37, w: 6, h: 5, minW: 3, minH: 4 },
      { i: 'macro-m2', x: 0, y: 42, w: 6, h: 5, minW: 3, minH: 4 },
      { i: 'macro-us10y', x: 0, y: 47, w: 6, h: 5, minW: 3, minH: 4 },
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
  activeAsset: AssetId;
  activeTimeframe: Timeframe;
  activePreset: PresetId;
  activeWidgets: WidgetId[];
  layouts: ResponsiveLayouts;
  layoutLocked: boolean;
  refreshIntervalMs: number;
  proseTab: ProseTab;
  proseDepth: ProseDepth;
  chartSettings: ChartSettings;
  manualFibs: Partial<Record<AssetId, ManualFibPair>>;
  setActiveAsset: (asset: AssetId) => void;
  setActiveTimeframe: (tf: Timeframe) => void;
  applyPreset: (preset: PresetId) => void;
  setLayouts: (layouts: ResponsiveLayouts) => void;
  toggleWidget: (id: WidgetId) => void;
  removeWidget: (id: WidgetId) => void;
  setLayoutLocked: (locked: boolean) => void;
  resetCurrentPreset: () => void;
  setProseTab: (tab: ProseTab) => void;
  setProseDepth: (depth: ProseDepth) => void;
  updateChartSetting: <K extends keyof ChartSettings>(key: K, value: ChartSettings[K]) => void;
  setManualFib: (asset: AssetId, pair: ManualFibPair | null) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      activeAsset: 'GOLD',
      activeTimeframe: '1d',
      activePreset: 'analyse-fokus',
      activeWidgets: [...PRESET_WIDGETS['analyse-fokus']],
      layouts: getPresetLayouts('analyse-fokus'),
      layoutLocked: false,
      refreshIntervalMs: 60_000,
      proseTab: 'macro',
      proseDepth: 'detailed',
      chartSettings: DEFAULT_CHART_SETTINGS,
      manualFibs: {},

      setActiveAsset: (asset) => set({ activeAsset: asset }),
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
          set({
            activeWidgets: activeWidgets.filter((w) => w !== id),
          });
          return;
        }

        const nextWidgets = [...activeWidgets, id];
        const appendIfMissing = (list: ResponsiveLayouts['lg'] = [], cols: number) => {
          if (list.some((item) => item.i === id)) return list;
          const maxY = list.reduce((m, item) => Math.max(m, item.y + item.h), 0);
          const defaultW =
            id === 'master-chart'
              ? Math.min(8, cols)
              : id.startsWith('chart-')
                ? Math.min(6, cols)
                : Math.min(4, cols);
          const defaultH = id.includes('chart') || id === 'prose-briefing' ? 9 : 6;
          return [
            ...list,
            {
              i: id,
              x: 0,
              y: maxY,
              w: defaultW,
              h: defaultH,
              minW: 3,
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

      updateChartSetting: (key, value) =>
        set((state) => ({
          chartSettings: { ...state.chartSettings, [key]: value },
        })),

      setManualFib: (asset, pair) =>
        set((state) => {
          const next = { ...state.manualFibs };
          if (pair === null) delete next[asset];
          else next[asset] = pair;
          return { manualFibs: next };
        }),
    }),
    {
      name: 'dashinvest-workspace-v1',
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
        activeAsset: state.activeAsset,
        activeTimeframe: state.activeTimeframe,
        activePreset: state.activePreset,
        activeWidgets: state.activeWidgets,
        layouts: state.layouts,
        layoutLocked: state.layoutLocked,
        proseTab: state.proseTab,
        proseDepth: state.proseDepth,
        chartSettings: state.chartSettings,
        manualFibs: state.manualFibs,
      }),
    },
  ),
);

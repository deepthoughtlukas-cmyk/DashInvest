import { beforeEach, describe, expect, it } from 'vitest';
import { getPresetLayouts, useDashboardStore } from '../src/store/dashboardStore.ts';

describe('Dashboard Zustand Store & Presets', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      activeSymbol: 'GC=F',
      activeTimeframe: '1d',
      activePreset: 'analyse-fokus',
      activeWidgets: [
        'catalog-explorer',
        'master-chart',
        'prose-briefing',
        'signal-matrix',
        'bookmark-signals-7d',
        'macro-liquidity',
        'macro-credit',
        'macro-dxy',
        'macro-m2',
        'macro-us10y',
      ],
      layouts: getPresetLayouts('analyse-fokus'),
      layoutLocked: false,
      proseTab: 'macro',
      proseDepth: 'detailed',
      showFundamentalsSidebar: true,
      manualFibs: {},
    });
  });

  it('switches presets cleanly across analyse-fokus, multi-chart, and makro-cockpit', () => {
    const store = useDashboardStore.getState();
    expect(store.activeWidgets).toHaveLength(10);
    expect(store.activeWidgets).toContain('bookmark-signals-7d');

    store.applyPreset('multi-chart');
    const afterMulti = useDashboardStore.getState();
    expect(afterMulti.activePreset).toBe('multi-chart');
    expect(afterMulti.activeWidgets).toEqual(
      expect.arrayContaining(['chart-gold', 'chart-silver', 'chart-sp500', 'chart-nasdaq']),
    );

    store.applyPreset('makro-cockpit');
    const afterMacro = useDashboardStore.getState();
    expect(afterMacro.activePreset).toBe('makro-cockpit');
    expect(afterMacro.activeWidgets[0]).toBe('macro-liquidity');
  });

  it('toggles, removes, and resets widgets and updates chart & prose preferences', () => {
    const store = useDashboardStore.getState();

    store.toggleWidget('macro-dxy');
    expect(useDashboardStore.getState().activeWidgets).not.toContain('macro-dxy');

    store.toggleWidget('macro-dxy');
    expect(useDashboardStore.getState().activeWidgets).toContain('macro-dxy');

    store.removeWidget('macro-m2');
    expect(useDashboardStore.getState().activeWidgets).not.toContain('macro-m2');

    store.toggleWidget('bookmark-signals-7d');
    expect(useDashboardStore.getState().activeWidgets).not.toContain('bookmark-signals-7d');
    store.toggleWidget('bookmark-signals-7d');
    expect(useDashboardStore.getState().activeWidgets).toContain('bookmark-signals-7d');

    store.resetCurrentPreset();
    expect(useDashboardStore.getState().activeWidgets).toContain('macro-m2');

    store.setActiveSymbol('NASDAQ100');
    store.setActiveTimeframe('4h');
    store.setLayoutLocked(true);
    store.setProseTab('asset');
    store.setProseDepth('compact');
    store.setShowFundamentalsSidebar(false);
    store.updateChartSetting('showIchimoku', true);
    store.setManualFib('^NDX', {
      start: { time: 100, price: 24000 },
      end: { time: 200, price: 26000 },
    });

    const updated = useDashboardStore.getState();
    expect(updated.activeSymbol).toBe('^NDX');
    expect(updated.activeTimeframe).toBe('4h');
    expect(updated.layoutLocked).toBe(true);
    expect(updated.proseTab).toBe('asset');
    expect(updated.proseDepth).toBe('compact');
    expect(updated.showFundamentalsSidebar).toBe(false);
    expect(updated.chartSettings.showIchimoku).toBe(true);
    expect(updated.manualFibs['^NDX']?.end.price).toBe(26000);

    updated.setManualFib('^NDX', null);
    expect(useDashboardStore.getState().manualFibs['^NDX']).toBeUndefined();
  });
});

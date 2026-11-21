import { describe, expect, it } from 'vitest';
import type { Candle, MacroOverview, QuoteSummary } from '../shared/types.ts';
import { evaluateMacroRegime, runFullAssetAnalysis } from '../src/engine/signals.ts';
import {
  generateAssetProseReport,
  generateMacroProseReport,
} from '../src/engine/proseAnalysis.ts';

function mkSeries(vals: number[], startYear = 2024) {
  return vals.map((value, idx) => ({
    date: `${startYear}-01-${String((idx % 28) + 1).padStart(2, '0')}`,
    value,
  }));
}

function buildExpansionMacro(): MacroOverview {
  return {
    dxy: {
      quote: {
        id: 'DXY',
        symbol: 'DX-Y.NYB',
        name: 'US-Dollar-Index (DXY)',
        shortName: 'DXY',
        price: 102.4,
        change: -0.45,
        changePercent: -0.44,
        prevClose: 102.85,
        dayHigh: 102.9,
        dayLow: 102.1,
        fiftyTwoWeekHigh: 107.0,
        fiftyTwoWeekLow: 99.5,
        currency: 'USD',
        unit: 'Pkt.',
        decimals: 2,
        updatedAt: '2026-11-21T20:00:00Z',
        weekChangePercent: -1.1,
        ytdChangePercent: -2.3,
      },
      history: mkSeries([105, 104, 103.5, 102.4]),
      sma50: 103.8,
      sma200: 104.2,
      trend: 'bearish',
    },
    m2: {
      latestB: 23413.9,
      latestT: 23.41,
      date: '2026-09-01',
      yoyPercent: 4.6,
      threeMonthAnnualizedPercent: 5.1,
      momPercent: 0.42,
      status: 'expanding',
      history: mkSeries([22100, 22600, 23100, 23413.9]),
    },
    us10y: {
      yieldPercent: 4.35,
      change1dBps: -6,
      change1wBps: -12,
      change1mBps: -22,
      spread2s10sPercent: 0.32,
      spread2s10sBps: 32,
      curveStatus: 'normal',
      date: '2026-11-20',
      history: mkSeries([4.7, 4.55, 4.42, 4.35]),
      spreadHistory: mkSeries([-0.1, 0.15, 0.28, 0.32]),
    },
    creditSpreads: {
      hyOasBps: 318,
      hyOasPercent: 3.18,
      change1wBps: -8,
      change1mBps: -19,
      percentile5y: 22,
      regime: 'risk-on',
      date: '2026-11-20',
      history: mkSeries([360, 340, 328, 318]),
    },
    netLiquidity: {
      currentB: 5920,
      currentT: 5.92,
      fedAssetsB: 6741,
      tgaB: 820,
      rrpB: 1,
      delta4wB: 95,
      delta4wPercent: 1.63,
      delta13wB: 145,
      delta13wPercent: 2.51,
      impulse: 'expanding',
      date: '2026-11-18',
      history: [
        { date: '2026-10-21', netLiquidity: 5825, fedAssets: 6740, tga: 900, rrp: 15 },
        { date: '2026-11-18', netLiquidity: 5920, fedAssets: 6741, tga: 820, rrp: 1 },
      ],
    },
    comparisons: {
      sp500: mkSeries([6500, 6700, 6850, 6910]),
      gold: mkSeries([3200, 3350, 3460, 3515]),
    },
    updatedAt: '2026-11-21T20:00:00Z',
  };
}

function buildStressMacro(): MacroOverview {
  const m = buildExpansionMacro();
  return {
    ...m,
    dxy: {
      ...m.dxy,
      quote: { ...m.dxy.quote, price: 108.5, changePercent: 0.75 },
      trend: 'bullish',
    },
    m2: {
      ...m.m2,
      yoyPercent: -1.4,
      threeMonthAnnualizedPercent: -2.1,
      status: 'contracting',
    },
    us10y: {
      ...m.us10y,
      yieldPercent: 5.15,
      change1mBps: 35,
      spread2s10sPercent: -0.35,
      spread2s10sBps: -35,
      curveStatus: 'inverted',
    },
    creditSpreads: {
      ...m.creditSpreads,
      hyOasBps: 560,
      hyOasPercent: 5.6,
      percentile5y: 92,
      regime: 'stress',
    },
    netLiquidity: {
      ...m.netLiquidity,
      delta4wB: -120,
      delta4wPercent: -2.1,
      delta13wB: -210,
      delta13wPercent: -3.5,
      impulse: 'contracting',
    },
  };
}

function buildTrendCandles(direction: 'up' | 'down', count = 220): Candle[] {
  const base = 1_700_000_000;
  return Array.from({ length: count }, (_, i) => {
    const slope = direction === 'up' ? 2.2 : -2.2;
    const close = 3000 + i * slope + Math.sin(i / 6) * 24;
    return {
      time: base + i * 86400,
      open: close - (direction === 'up' ? 4 : -4),
      high: close + 12,
      low: close - 12,
      close,
      volume: 150000,
    };
  });
}

describe('Signals & German Prose Analysis Engine', () => {
  it('evaluates expansion macro regime and generates rich German macro prose with real numbers', () => {
    const macro = buildExpansionMacro();
    const regime = evaluateMacroRegime(macro);
    expect(regime.regime).toBe('expansion');
    expect(regime.score).toBeGreaterThanOrEqual(22);
    expect(regime.pillars).toHaveLength(5);

    const prose = generateMacroProseReport(macro, regime, [
      {
        assetId: 'GOLD',
        name: 'Gold',
        price: 3515.4,
        changePercent: 1.2,
        confluence: 68,
        bias: 'Stark Bullisch',
      },
      {
        assetId: 'SP500',
        name: 'S&P 500',
        price: 6910.4,
        changePercent: 0.65,
        confluence: 52,
        bias: 'Stark Bullisch',
      },
    ]);

    expect(prose.headline).toContain('Makro-Briefing');
    expect(prose.compactSummary).toContain('5,92');
    expect(prose.compactSummary).toContain('318 bps');
    expect(prose.paragraphs).toHaveLength(3);
    expect(prose.conclusions.length).toBeGreaterThanOrEqual(4);
    expect(prose.markdown).toContain('Wichtigste Schlussfolgerungen');
  });

  it('evaluates risk-off stress macro scenario, fires alerts, and adapts prose conclusions', () => {
    const stressMacro = buildStressMacro();
    const regime = evaluateMacroRegime(stressMacro);
    expect(regime.regime).toBe('risk-off');
    expect(regime.score).toBeLessThanOrEqual(-50);
    expect(regime.alerts.some((a) => a.includes('Liquiditätsentzug'))).toBe(true);
    expect(regime.alerts.some((a) => a.includes('Kreditstress'))).toBe(true);
    expect(regime.alerts.some((a) => a.includes('invertiert'))).toBe(true);

    const prose = generateMacroProseReport(stressMacro, regime, []);
    expect(prose.headline).toContain('Risk-Off');
    expect(prose.compactSummary).toContain('560 bps');
    expect(prose.conclusions[0].text).toContain('Vorsicht');
  });

  it('computes bounded confluence score and detailed German prose for both bullish and bearish assets', () => {
    const expMacro = buildExpansionMacro();
    const expRegime = evaluateMacroRegime(expMacro);
    const bullCandles = buildTrendCandles('up', 220);
    const bullAnalysis = runFullAssetAnalysis('GOLD', bullCandles, expMacro, '1d', 'intermediate');

    expect(bullAnalysis.scores.confluence).toBeGreaterThan(20);
    expect(bullAnalysis.scores.confluence).toBeLessThanOrEqual(100);
    expect(bullAnalysis.fibonacci).not.toBeNull();

    const quote: QuoteSummary = {
      id: 'GOLD',
      symbol: 'GC=F',
      name: 'Gold (COMEX Futures)',
      shortName: 'Gold',
      price: bullCandles[bullCandles.length - 1].close,
      change: 24.5,
      changePercent: 0.7,
      prevClose: bullCandles[bullCandles.length - 2].close,
      dayHigh: bullCandles[bullCandles.length - 1].high,
      dayLow: bullCandles[bullCandles.length - 1].low,
      fiftyTwoWeekHigh: 3600,
      fiftyTwoWeekLow: 2800,
      currency: 'USD',
      unit: 'USD/oz',
      decimals: 2,
      updatedAt: '2026-11-21T20:00:00Z',
    };

    const bullReport = generateAssetProseReport(
      'Gold (COMEX Futures)',
      '1d',
      quote,
      bullAnalysis,
      expRegime,
    );
    expect(bullReport.headline).toContain('Gold');
    expect(bullReport.paragraphs).toHaveLength(4);
    expect(bullReport.conclusions).toHaveLength(4);

    // Bearish asset under stress macro
    const stressMacro = buildStressMacro();
    const stressRegime = evaluateMacroRegime(stressMacro);
    const bearCandles = buildTrendCandles('down', 220);
    const bearAnalysis = runFullAssetAnalysis('NASDAQ100', bearCandles, stressMacro, '4h', 'minor');
    expect(bearAnalysis.scores.confluence).toBeLessThan(-20);
    expect(bearAnalysis.scores.confluence).toBeGreaterThanOrEqual(-100);

    const bearReport = generateAssetProseReport(
      'Nasdaq 100 Index',
      '4h',
      undefined,
      bearAnalysis,
      stressRegime,
    );
    expect(bearReport.subheadline).toContain('4-Stunden-Chart');
    expect(bearReport.conclusions[3].text).toContain('Defensiv');
  });
});

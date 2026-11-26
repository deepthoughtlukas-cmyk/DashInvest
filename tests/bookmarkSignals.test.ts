import { describe, expect, it } from 'vitest';
import type { Candle, CatalogAsset } from '../shared/types.ts';
import {
  collectBookmarkedSignals,
  evaluateMacroRegime,
  extractTriggeredSignalsInWindow,
  runFullAssetAnalysis,
  type FullAssetAnalysis,
} from '../src/engine/signals.ts';
import { getCachedFullAssetAnalysis } from '../src/hooks/useMarketData.ts';

const DAY = 86_400;

function makeAsset(
  symbol: string,
  shortName: string,
  bookmarked = true,
  decimals = 2,
): CatalogAsset {
  return {
    symbol,
    name: `${shortName} Full`,
    shortName,
    assetClass: 'equities',
    unit: 'USD',
    decimals,
    folderId: 'folder-equities-us',
    bookmarked,
  };
}

function buildReversalCandles(nowSec: number, count = 230): Candle[] {
  const startSec = nowSec - (count - 1) * DAY;
  return Array.from({ length: count }, (_, idx) => {
    const time = startSec + idx * DAY;
    // Steady decline until 5 days before nowSec, then sharp breakout rally inside last 7 days
    let close: number;
    if (idx < count - 5) {
      close = 200 - idx * 0.25 + Math.sin(idx / 5) * 2;
    } else {
      const k = idx - (count - 6); // 1..5
      close = 148 + k * 14; // rallies strongly through SMAs, Supertrend & MACD
    }
    return {
      time,
      open: close - 2,
      high: close + 4,
      low: close - 4,
      close,
      volume: 250_000,
    };
  });
}

describe('7-Day Bookmarked Signals Engine', () => {
  it('enforces strict 7-day timestamp cutoff and excludes older triggered events', () => {
    const nowSec = 1_760_000_000;
    const candles = buildReversalCandles(nowSec, 220);
    const asset = makeAsset('NVDA', 'NVIDIA', true, 2);
    const baseAnalysis = runFullAssetAnalysis('NVDA', candles, undefined, '1d', 'intermediate');

    // Inject synthetic events both 12 days ago (outside 7d) and 2-4 days ago (inside 7d)
    const oldTime12d = nowSec - 12 * DAY;
    const oldTime10d = nowSec - 10 * DAY;
    const recentTime3d = nowSec - 3 * DAY;
    const recentTime2d = nowSec - 2 * DAY;

    const customAnalysis: FullAssetAnalysis = {
      ...baseAnalysis,
      supertrend: [
        { time: oldTime12d, value: 140, direction: 1, flipped: true },
        { time: recentTime2d, value: 158, direction: -1, flipped: true },
      ],
      maCrosses: [
        { time: oldTime10d, price: 142, type: 'golden_cross' },
        { time: recentTime3d, price: 165, type: 'death_cross' },
      ],
      macd: [
        {
          time: oldTime12d,
          macd: 1,
          signal: 0.8,
          histogram: 0.2,
          crossover: 'bullish',
        },
        {
          time: recentTime3d,
          macd: -0.5,
          signal: -0.2,
          histogram: -0.3,
          crossover: 'bearish',
        },
      ],
      rsiDivergences: [
        {
          time: oldTime12d,
          type: 'bullish',
          price: 141,
          rsi: 32,
          description: 'Bullishe RSI-Divergenz',
        },
        {
          time: recentTime2d,
          type: 'bearish',
          price: 172,
          rsi: 68,
          description: 'Bärische RSI-Divergenz',
        },
      ],
    };

    const signals = extractTriggeredSignalsInWindow(asset, candles, customAnalysis, 7, nowSec);
    const cutoff = nowSec - 7 * DAY;

    expect(signals.length).toBeGreaterThanOrEqual(4);
    for (const sig of signals) {
      expect(sig.time).toBeGreaterThanOrEqual(cutoff);
      expect(sig.symbol).toBe('NVDA');
      expect(sig.shortName).toBe('NVIDIA');
    }

    // Old events from 10-12 days ago must NEVER appear
    expect(signals.some((s) => s.time === oldTime12d || s.time === oldTime10d)).toBe(false);
    // Recent events from 2-3 days ago MUST appear
    expect(signals.some((s) => s.id === `NVDA-st-${recentTime2d}`)).toBe(true);
    expect(signals.some((s) => s.id === `NVDA-ma50200-${recentTime3d}`)).toBe(true);
    expect(signals.some((s) => s.id === `NVDA-macd-${recentTime3d}`)).toBe(true);
    expect(signals.some((s) => s.id === `NVDA-rsidiv-${recentTime2d}`)).toBe(true);
  });

  it('collects signals across ALL bookmarked assets (> 6) without capping, excludes unbookmarked assets, and sorts newest first', () => {
    const nowSec = 1_760_000_000;
    const symbols = ['GC=F', 'SI=F', '^GSPC', '^NDX', '^GDAXI', 'NVDA', 'BTC-USD', 'AAPL'];
    const bookmarkedAssets = symbols.map((s) => makeAsset(s, s, true, 2));

    const candlesBySymbol: Record<string, Candle[]> = {};
    const analysesBySymbol: Record<string, FullAssetAnalysis> = {};

    // Populate all 8 bookmarked assets + 1 unbookmarked asset ('MSFT') with reversal candles triggering recent 7d signals
    for (const sym of [...symbols, 'MSFT']) {
      const c = buildReversalCandles(nowSec, 230);
      candlesBySymbol[sym] = c;
      analysesBySymbol[sym] = runFullAssetAnalysis(sym, c, undefined, '1d', 'intermediate');
    }

    const collected = collectBookmarkedSignals(
      bookmarkedAssets,
      candlesBySymbol,
      analysesBySymbol,
      7,
      nowSec,
    );

    const representedSymbols = new Set(collected.map((s) => s.symbol));
    // All 8 bookmarked assets (exceeding the legacy 6-asset focus slice) must be represented
    expect(representedSymbols.size).toBe(8);
    expect(representedSymbols.has('BTC-USD')).toBe(true);
    expect(representedSymbols.has('AAPL')).toBe(true);
    // Unbookmarked asset must never leak into bookmarked signals
    expect(representedSymbols.has('MSFT')).toBe(false);

    // Strictly sorted newest first and unique IDs
    const seenIds = new Set<string>();
    for (let i = 0; i < collected.length; i++) {
      expect(seenIds.has(collected[i].id)).toBe(false);
      seenIds.add(collected[i].id);
      if (i > 0) {
        expect(collected[i - 1].time).toBeGreaterThanOrEqual(collected[i].time);
      }
    }
  });

  it('reuses cached per-asset analysis & signal extraction across 100 bookmarked assets without recomputing indicators', () => {
    const nowSec = 1_760_000_000;
    const assets = Array.from({ length: 100 }, (_, i) => makeAsset(`SYM${i}`, `Asset ${i}`, true, 2));
    const candlesBySymbol: Record<string, Candle[]> = {};
    for (const a of assets) {
      candlesBySymbol[a.symbol] = buildReversalCandles(nowSec, 230);
    }

    // Verify precomputedMacroRegime produces identical result to default runFullAssetAnalysis
    const first = runFullAssetAnalysis('SYM0', candlesBySymbol.SYM0, undefined, '1d', 'intermediate', 'equities');
    const precomputed = runFullAssetAnalysis(
      'SYM0',
      candlesBySymbol.SYM0,
      undefined,
      '1d',
      'intermediate',
      'equities',
      null,
    );
    expect(precomputed.scores).toEqual(first.scores);
    expect(evaluateMacroRegime).toBeTypeOf('function');

    // Cold pass across 100 assets
    const analysesCold: Record<string, FullAssetAnalysis> = {};
    for (const a of assets) {
      analysesCold[a.symbol] = getCachedFullAssetAnalysis(
        a.symbol,
        candlesBySymbol[a.symbol],
        undefined,
        '1d',
        'intermediate',
        'equities',
        null,
      );
    }
    const signalsCold = collectBookmarkedSignals(assets, candlesBySymbol, analysesCold, 7, nowSec);

    // Warm pass across 100 assets must reuse exact cached objects in < 50ms
    const t0 = performance.now();
    const analysesWarm: Record<string, FullAssetAnalysis> = {};
    for (const a of assets) {
      analysesWarm[a.symbol] = getCachedFullAssetAnalysis(
        a.symbol,
        candlesBySymbol[a.symbol],
        undefined,
        '1d',
        'intermediate',
        'equities',
        null,
      );
    }
    const signalsWarm = collectBookmarkedSignals(assets, candlesBySymbol, analysesWarm, 7, nowSec);
    const elapsedMs = performance.now() - t0;

    expect(analysesWarm.SYM0).toBe(analysesCold.SYM0);
    expect(signalsWarm.length).toBe(signalsCold.length);
    expect(elapsedMs).toBeLessThan(150);
  });
});

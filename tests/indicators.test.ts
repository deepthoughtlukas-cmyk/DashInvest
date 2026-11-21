import { describe, expect, it } from 'vitest';
import type { Candle } from '../shared/types.ts';
import {
  calculateEMA,
  calculateSMA,
  calculateVWAP,
  detectMACrosses,
  toHeikinAshi,
} from '../src/engine/movingAverages.ts';
import {
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateIchimoku,
  calculateMACD,
  calculateRSI,
  calculateSupertrend,
  detectRSIDivergences,
} from '../src/engine/indicators.ts';

function makeCandles(closes: number[], spread = 1.5, volume = 1000): Candle[] {
  const baseTime = 1_700_000_000;
  return closes.map((c, idx) => ({
    time: baseTime + idx * 86400,
    open: idx === 0 ? c : closes[idx - 1],
    high: c + spread,
    low: c - spread,
    close: c,
    volume,
  }));
}

describe('Moving Averages & Technical Indicators', () => {
  it('computes accurate SMA, EMA, Heikin-Ashi, Golden Cross and Death Cross', () => {
    const prices = [
      ...Array.from({ length: 20 }, (_, i) => 120 - i * 1.2), // falling
      ...Array.from({ length: 20 }, (_, i) => 95 + i * 2.5),  // rising -> Golden Cross
      ...Array.from({ length: 20 }, (_, i) => 145 - i * 3.0), // falling -> Death Cross
    ];
    const candles = makeCandles(prices);

    const sma5 = calculateSMA(candles, 5);
    expect(sma5).toHaveLength(prices.length - 4);
    const first5Avg = prices.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    expect(sma5[0].value).toBeCloseTo(first5Avg, 6);

    const ema5 = calculateEMA(candles, 5);
    expect(ema5).toHaveLength(prices.length - 4);
    expect(ema5[0].value).toBeCloseTo(first5Avg, 6);

    const ha = toHeikinAshi(candles);
    expect(ha).toHaveLength(candles.length);
    expect(ha[0].close).toBeCloseTo(
      (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4,
      6,
    );

    const emaFast = calculateEMA(candles, 3);
    const smaSlow = calculateSMA(candles, 10);
    const crosses = detectMACrosses(emaFast, smaSlow);
    expect(crosses.some((c) => c.type === 'golden_cross')).toBe(true);
    expect(crosses.some((c) => c.type === 'death_cross')).toBe(true);
  });

  it('computes VWAP with volume and gracefully skips VWAP when volume is zero', () => {
    const noVol = makeCandles([100, 102, 104, 103, 105], 1, 0);
    expect(calculateVWAP(noVol)).toEqual([]);

    const withVol = makeCandles([100, 102, 104, 103, 105], 1, 500);
    const vwap = calculateVWAP(withVol, false);
    expect(vwap).toHaveLength(5);
    expect(vwap[vwap.length - 1].value).toBeGreaterThan(100);
  });

  it('computes bounded RSI edge cases, ATR, MACD, ADX, Ichimoku, Bollinger Squeeze and Supertrend flips', () => {
    // RSI edge cases: strictly up -> 100, strictly down -> 0, flat -> 50
    const upCandles = makeCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    const downCandles = makeCandles(Array.from({ length: 20 }, (_, i) => 200 - i));
    const flatCandles = makeCandles(Array.from({ length: 20 }, () => 100), 0);
    expect(calculateRSI(upCandles, 14).at(-1)?.value).toBeCloseTo(100, 4);
    expect(calculateRSI(downCandles, 14).at(-1)?.value).toBeCloseTo(0, 4);
    expect(calculateRSI(flatCandles, 14).at(-1)?.value).toBeCloseTo(50, 4);

    const wave = [
      ...Array.from({ length: 30 }, (_, i) => 100 + i * 1.5),
      ...Array.from({ length: 25 }, (_, i) => 145 - i * 2.0),
      ...Array.from({ length: 25 }, (_, i) => 95 + i * 2.2),
    ];
    const candles = makeCandles(wave, 1.2);

    const atr = calculateATR(candles, 14);
    expect(atr.length).toBeGreaterThan(50);
    expect(atr.every((p) => p.value > 0)).toBe(true);

    const st = calculateSupertrend(candles, 10, 3);
    expect(st.some((p) => p.direction === 1)).toBe(true);
    expect(st.some((p) => p.direction === -1)).toBe(true);
    expect(st.some((p) => p.flipped)).toBe(true);

    const macd = calculateMACD(candles);
    expect(macd.length).toBeGreaterThan(30);
    expect(macd.some((p) => p.crossover !== null)).toBe(true);

    const adx = calculateADX(candles, 14);
    expect(adx.length).toBeGreaterThan(30);
    expect(adx.every((p) => p.adx >= 0 && p.adx <= 100)).toBe(true);

    const ichi = calculateIchimoku(candles);
    expect(ichi.tenkan.length).toBe(candles.length - 8);
    expect(ichi.kijun.length).toBe(candles.length - 25);
    expect(ichi.senkouA.length).toBeGreaterThan(20);
    expect(ichi.senkouB.length).toBeGreaterThan(1);

    // Bollinger squeeze after wide swings followed by ultra-tight consolidation
    const squeezeWave = [
      ...Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 8 : -8)),
      ...Array.from({ length: 25 }, (_, i) => 100 + (i % 2 === 0 ? 0.1 : -0.1)),
    ];
    const bb = calculateBollingerBands(makeCandles(squeezeWave, 0.2), 20, 2);
    expect(bb.every((p) => p.upper >= p.middle && p.middle >= p.lower)).toBe(true);
    expect(bb.at(-1)?.isSqueeze).toBe(true);
  });

  it('detects both bullish and bearish RSI divergences deterministically', () => {
    // Bullish divergence: sharp plunge to low1 (~75), bounce, then slightly lower low2 (~74) via gentler slide
    const bullCloses = [
      120, 119, 118, 117, 116, 115, 114, 113, 112, 111, 110, 109, 108, 107, 106,
      102, 95, 86, 75, // sharp Pivot Low 1 -> very low RSI
      84, 92, 98, 95, 92, 89, 86, 83, 80, 77, 74, // gentler drift to lower low -> higher RSI
      79, 84, 89, 94, 99,
    ];
    const bullCandles = makeCandles(bullCloses, 0.2);
    const bullRsi = calculateRSI(bullCandles, 7);
    const bullDivs = detectRSIDivergences(bullCandles, bullRsi, 2);
    expect(bullDivs.some((d) => d.type === 'bullish')).toBe(true);

    // Bearish divergence: sharp surge to high1 (~145), pullback, then slightly higher high2 (~146) via gentle climb
    const bearCloses = [
      90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104,
      110, 122, 134, 145, // sharp Pivot High 1 -> extreme high RSI
      136, 128, 122, 126, 130, 134, 137, 140, 142, 144, 146, // gentler climb -> lower RSI
      141, 135, 129, 124, 119,
    ];
    const bearCandles = makeCandles(bearCloses, 0.2);
    const bearRsi = calculateRSI(bearCandles, 7);
    const bearDivs = detectRSIDivergences(bearCandles, bearRsi, 2);
    expect(bearDivs.some((d) => d.type === 'bearish')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { Candle } from '../shared/types.ts';
import { computeAutoFibonacci, computeFibonacciFromAnchors } from '../src/engine/fibonacci.ts';
import {
  analyzeElliottWaves,
  validateImpulseRules,
  type WavePivot,
} from '../src/engine/elliottWave.ts';

function interpolateWaypoints(waypoints: number[], stepsPerLeg = 8): Candle[] {
  const baseTime = 1_700_000_000;
  const candles: Candle[] = [];
  let idx = 0;

  for (let w = 0; w < waypoints.length - 1; w++) {
    const start = waypoints[w];
    const end = waypoints[w + 1];
    for (let s = 0; s < stepsPerLeg; s++) {
      const t = s / stepsPerLeg;
      const price = start + (end - start) * t;
      candles.push({
        time: baseTime + idx * 86400,
        open: price,
        high: price + 0.8,
        low: price - 0.8,
        close: price,
        volume: 1000,
      });
      idx++;
    }
  }
  const last = waypoints[waypoints.length - 1];
  candles.push({
    time: baseTime + idx * 86400,
    open: last,
    high: last + 0.8,
    low: last - 0.8,
    close: last,
    volume: 1000,
  });
  return candles;
}

describe('Fibonacci & Elliott Wave Engine', () => {
  it('computes accurate uptrend and downtrend retracements, golden pocket and extensions', () => {
    const upFib = computeFibonacciFromAnchors(
      { time: 1000, price: 100 },
      { time: 2000, price: 200 },
      137,
    );
    expect(upFib.direction).toBe('uptrend');
    expect(upFib.goldenPocket.low).toBeCloseTo(135, 4);
    expect(upFib.goldenPocket.high).toBeCloseTo(138.2, 4);
    expect(upFib.inGoldenPocket).toBe(true);
    expect(upFib.levels.find((l) => l.ratio === 1.618)?.price).toBeCloseTo(261.8, 4);

    // Downtrend anchor (200 -> 100): 0.618 bounce is 161.8, 1.618 downside extension is 38.2
    const downFib = computeFibonacciFromAnchors(
      { time: 1000, price: 200 },
      { time: 2000, price: 100 },
      163,
    );
    expect(downFib.direction).toBe('downtrend');
    expect(downFib.goldenPocket.low).toBeCloseTo(161.8, 4);
    expect(downFib.goldenPocket.high).toBeCloseTo(165, 4);
    expect(downFib.inGoldenPocket).toBe(true);
    expect(downFib.levels.find((l) => l.ratio === 1.618)?.price).toBeCloseTo(38.2, 4);
  });

  it('auto-detects both uptrend and downtrend swings from candle windows', () => {
    const upCandles = interpolateWaypoints([100, 180, 140]);
    const autoUp = computeAutoFibonacci(upCandles, 100);
    expect(autoUp?.direction).toBe('uptrend');

    const downCandles = interpolateWaypoints([200, 120, 155]);
    const autoDown = computeAutoFibonacci(downCandles, 100);
    expect(autoDown?.direction).toBe('downtrend');
  });

  it('enforces the 3 core Elliott Wave impulse rules strictly', () => {
    const mk = (index: number, price: number, kind: 'high' | 'low'): WavePivot => ({
      index,
      time: 1_700_000_000 + index * 86400,
      price,
      kind,
    });

    const valid = validateImpulseRules(
      [
        mk(0, 100, 'low'),
        mk(5, 130, 'high'),
        mk(10, 112, 'low'),
        mk(18, 165, 'high'),
        mk(24, 145, 'low'),
        mk(30, 175, 'high'),
      ],
      'bullish',
    );
    expect(valid.valid).toBe(true);

    // Rule 1 violation: Wave 2 goes below origin
    const w2Invalid = validateImpulseRules(
      [
        mk(0, 100, 'low'),
        mk(5, 130, 'high'),
        mk(10, 95, 'low'),
        mk(18, 165, 'high'),
        mk(24, 145, 'low'),
        mk(30, 175, 'high'),
      ],
      'bullish',
    );
    expect(w2Invalid.valid).toBe(false);
    expect(w2Invalid.wave2Valid).toBe(false);

    // Rule 3 violation: Wave 4 overlaps Wave 1 territory
    const w4Invalid = validateImpulseRules(
      [
        mk(0, 100, 'low'),
        mk(5, 130, 'high'),
        mk(10, 112, 'low'),
        mk(18, 165, 'high'),
        mk(24, 125, 'low'),
        mk(30, 175, 'high'),
      ],
      'bullish',
    );
    expect(w4Invalid.valid).toBe(false);
    expect(w4Invalid.wave4Valid).toBe(false);

    // Rule 2 violation: Wave 3 is shortest (W1=30, W3=20, W5=35)
    const w3Shortest = validateImpulseRules(
      [
        mk(0, 100, 'low'),
        mk(5, 130, 'high'),
        mk(10, 115, 'low'),
        mk(18, 135, 'high'),
        mk(24, 131, 'low'),
        mk(30, 166, 'high'),
      ],
      'bullish',
    );
    expect(w3Shortest.valid).toBe(false);
    expect(w3Shortest.wave3Valid).toBe(false);
  });

  it('recognizes bullish, bearish, in-progress Wave 5, and A-B-C Elliott structures', () => {
    // 1. Completed 5-wave bullish impulse
    const bull5 = interpolateWaypoints([100, 130, 112, 162, 144, 174], 7);
    const resBull = analyzeElliottWaves(bull5, 'intermediate');
    expect(resBull.primary?.patternType).toBe('impulse');
    expect(resBull.primary?.direction).toBe('bullish');
    expect(resBull.primary?.confidence).toBeGreaterThanOrEqual(50);

    // 2. Completed 5-wave bearish impulse
    const bear5 = interpolateWaypoints([200, 170, 188, 138, 156, 126], 7);
    const resBear = analyzeElliottWaves(bear5, 'intermediate');
    expect(resBear.primary?.patternType).toBe('impulse');
    expect(resBear.primary?.direction).toBe('bearish');

    // 3. In-progress Wave 5 (5 pivots 0-1-2-3-4)
    const activeW5 = interpolateWaypoints([100, 130, 112, 162, 144], 8);
    const resW5 = analyzeElliottWaves(activeW5, 'intermediate');
    expect(resW5.primary?.patternType).toBe('impulse');
    expect(resW5.primary?.activeWave).toContain('Welle (5)');
    expect(resW5.primary?.invalidationLevel).toBeCloseTo(130.8, 0);

    // 4. Corrective A-B-C (4 pivots)
    const abc = interpolateWaypoints([180, 140, 165, 122], 8);
    const resAbc = analyzeElliottWaves(abc, 'intermediate');
    expect(resAbc.primary?.patternType).toBe('abc_correction');
  });
});

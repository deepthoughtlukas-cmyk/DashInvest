import type { Candle, ElliottDegree } from '../../shared/types.ts';
import { calculateATR } from './indicators.ts';

export interface WavePivot {
  index: number;
  time: number;
  price: number;
  kind: 'high' | 'low';
  provisional?: boolean;
}

export interface LabeledWavePoint extends WavePivot {
  label: string; // '0' | '1' | '2' | '3' | '4' | '5' | 'A' | 'B' | 'C'
}

export interface ElliottWaveCount {
  patternType: 'impulse' | 'abc_correction';
  direction: 'bullish' | 'bearish';
  degree: ElliottDegree;
  points: LabeledWavePoint[];
  activeWave: string;
  status: string;
  invalidationLevel: number;
  targetZone: {
    low: number;
    high: number;
    label: string;
  };
  confidence: number; // 0..100
  rulesChecked: {
    wave2Valid: boolean;
    wave3Valid: boolean;
    wave4Valid: boolean;
  };
  rationale: string;
}

export interface ElliottAnalysisResult {
  degree: ElliottDegree;
  pivots: WavePivot[];
  primary: ElliottWaveCount | null;
  alternative: ElliottWaveCount | null;
}

function getDegreeMultiplier(degree: ElliottDegree): number {
  switch (degree) {
    case 'minor':
      return 1.6;
    case 'intermediate':
      return 2.7;
    case 'primary':
      return 4.4;
  }
}

export function extractZigZagPivots(
  candles: Candle[],
  degree: ElliottDegree = 'intermediate',
): WavePivot[] {
  if (candles.length < 5) return [];

  const atrSeries = calculateATR(candles, 14);
  const atrMap = new Map(atrSeries.map((p) => [p.time, p.value]));
  const avgRange =
    candles.reduce((acc, c) => acc + (c.high - c.low), 0) / candles.length || candles[0].close * 0.01;
  const mult = getDegreeMultiplier(degree);

  const getThreshold = (time: number, price: number) => {
    const atr = atrMap.get(time) ?? avgRange;
    return Math.max(atr * mult, price * 0.004);
  };

  let pivots: WavePivot[] = [];
  let trend: 'up' | 'down' | null = null;
  let extremeHigh: WavePivot = {
    index: 0,
    time: candles[0].time,
    price: candles[0].high,
    kind: 'high',
  };
  let extremeLow: WavePivot = {
    index: 0,
    time: candles[0].time,
    price: candles[0].low,
    kind: 'low',
  };

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const threshold = getThreshold(c.time, c.close);

    if (trend === null) {
      if (c.high > extremeHigh.price) {
        extremeHigh = { index: i, time: c.time, price: c.high, kind: 'high' };
      }
      if (c.low < extremeLow.price) {
        extremeLow = { index: i, time: c.time, price: c.low, kind: 'low' };
      }

      if (c.high - extremeLow.price >= threshold && extremeLow.index <= i) {
        pivots.push(extremeLow);
        trend = 'up';
        extremeHigh = { index: i, time: c.time, price: c.high, kind: 'high' };
      } else if (extremeHigh.price - c.low >= threshold && extremeHigh.index <= i) {
        pivots.push(extremeHigh);
        trend = 'down';
        extremeLow = { index: i, time: c.time, price: c.low, kind: 'low' };
      }
      continue;
    }

    if (trend === 'up') {
      if (c.high >= extremeHigh.price) {
        extremeHigh = { index: i, time: c.time, price: c.high, kind: 'high' };
      } else if (extremeHigh.price - c.low >= threshold) {
        pivots.push(extremeHigh);
        trend = 'down';
        extremeLow = { index: i, time: c.time, price: c.low, kind: 'low' };
      }
    } else {
      if (c.low <= extremeLow.price) {
        extremeLow = { index: i, time: c.time, price: c.low, kind: 'low' };
      } else if (c.high - extremeLow.price >= threshold) {
        pivots.push(extremeLow);
        trend = 'up';
        extremeHigh = { index: i, time: c.time, price: c.high, kind: 'high' };
      }
    }
  }

  // Append active trailing swing leg so recent price action participates in active wave counts
  const lastCandle = candles[candles.length - 1];
  const lastThreshold = getThreshold(lastCandle.time, lastCandle.close) * 0.45;
  if (trend === 'up' && (pivots.length === 0 || extremeHigh.index > pivots[pivots.length - 1].index)) {
    const lastPivot = pivots[pivots.length - 1];
    if (!lastPivot || Math.abs(extremeHigh.price - lastPivot.price) >= lastThreshold) {
      pivots.push({ ...extremeHigh, provisional: true });
    }
  } else if (
    trend === 'down' &&
    (pivots.length === 0 || extremeLow.index > pivots[pivots.length - 1].index)
  ) {
    const lastPivot = pivots[pivots.length - 1];
    if (!lastPivot || Math.abs(extremeLow.price - lastPivot.price) >= lastThreshold) {
      pivots.push({ ...extremeLow, provisional: true });
    }
  }

  // Deduplicate strictly alternating kinds & strictly increasing index
  const clean: WavePivot[] = [];
  for (const p of pivots) {
    const prev = clean[clean.length - 1];
    if (!prev) {
      clean.push(p);
      continue;
    }
    if (p.index <= prev.index) continue;
    if (p.kind === prev.kind) {
      if (
        (p.kind === 'high' && p.price > prev.price) ||
        (p.kind === 'low' && p.price < prev.price)
      ) {
        clean[clean.length - 1] = p;
      }
      continue;
    }
    clean.push(p);
  }

  pivots = clean;
  return pivots;
}

export function validateImpulseRules(
  pts: [WavePivot, WavePivot, WavePivot, WavePivot, WavePivot, WavePivot?],
  direction: 'bullish' | 'bearish',
): { valid: boolean; wave2Valid: boolean; wave3Valid: boolean; wave4Valid: boolean } {
  const [p0, p1, p2, p3, p4, p5] = pts;

  const isBull = direction === 'bullish';
  const dirOk = isBull
    ? p1.price > p0.price && p2.price < p1.price && p3.price > p2.price && p4.price < p3.price
    : p1.price < p0.price && p2.price > p1.price && p3.price < p2.price && p4.price > p3.price;

  if (!dirOk) {
    return { valid: false, wave2Valid: false, wave3Valid: false, wave4Valid: false };
  }

  // Rule 1: Wave 2 never retraces 100% or more of Wave 1
  const wave2Valid = isBull ? p2.price > p0.price : p2.price < p0.price;

  // Rule 3: Wave 4 never enters Wave 1 territory
  const wave4Valid = isBull ? p4.price > p1.price : p4.price < p1.price;

  // Rule 2: Wave 3 is never the shortest of Waves 1, 3, 5
  const w1 = Math.abs(p1.price - p0.price);
  const w3 = Math.abs(p3.price - p2.price);
  let wave3Valid = w3 > w1 * 0.7;

  if (p5) {
    const p5DirOk = isBull ? p5.price > p3.price * 0.985 : p5.price < p3.price * 1.015;
    const w5 = Math.abs(p5.price - p4.price);
    wave3Valid = p5DirOk && !(w3 < w1 && w3 < w5);
  }

  return {
    valid: wave2Valid && wave3Valid && wave4Valid,
    wave2Valid,
    wave3Valid,
    wave4Valid,
  };
}

function closenessScore(actual: number, ideal: number, tolerance: number): number {
  const diff = Math.abs(actual - ideal);
  if (diff >= tolerance) return 0;
  return 1 - diff / tolerance;
}

function buildImpulseCandidate(
  slice: WavePivot[],
  degree: ElliottDegree,
  totalPivots: number,
  endPivotIndex: number,
  currentPrice: number,
): ElliottWaveCount | null {
  if (slice.length !== 5 && slice.length !== 6) return null;

  const p0 = slice[0];
  const p1 = slice[1];
  const p2 = slice[2];
  const p3 = slice[3];
  const p4 = slice[4];
  const p5 = slice.length === 6 ? slice[5] : undefined;

  const direction: 'bullish' | 'bearish' = p1.price > p0.price ? 'bullish' : 'bearish';
  const rules = validateImpulseRules([p0, p1, p2, p3, p4, p5], direction);
  if (!rules.valid) return null;

  const w1 = Math.abs(p1.price - p0.price);
  const w2 = Math.abs(p2.price - p1.price);
  const w3 = Math.abs(p3.price - p2.price);
  const w4 = Math.abs(p4.price - p3.price);
  if (w1 === 0 || w3 === 0) return null;

  const r2 = w2 / w1;
  const r3 = w3 / w1;
  const r4 = w4 / w3;

  let fibScore = 0;
  fibScore += Math.max(closenessScore(r2, 0.618, 0.35), closenessScore(r2, 0.5, 0.35)) * 24;
  fibScore +=
    (r3 >= 1.272 ? 28 : closenessScore(r3, 1.618, 0.75) * 28);
  fibScore += Math.max(closenessScore(r4, 0.382, 0.25), closenessScore(r4, 0.236, 0.22)) * 22;

  if (p5) {
    const w5 = Math.abs(p5.price - p4.price);
    const r5 = w5 / w1;
    fibScore += Math.max(closenessScore(r5, 1.0, 0.5), closenessScore(r5, 0.618, 0.4)) * 14;
  } else {
    fibScore += 10;
  }

  // Recency bonus: candidates ending at the very latest pivot are far more relevant
  const recencyPenalty = Math.max(0, totalPivots - 1 - endPivotIndex) * 8;
  const confidence = Math.max(38, Math.min(96, Math.round(fibScore + 14 - recencyPenalty)));

  const labels = p5 ? ['0', '1', '2', '3', '4', '5'] : ['0', '1', '2', '3', '4'];
  const points: LabeledWavePoint[] = slice.map((p, idx) => ({
    ...p,
    label: labels[idx],
  }));

  const isBull = direction === 'bullish';
  const sign = isBull ? 1 : -1;

  if (!p5) {
    // Active Wave 5 in progress (or completing Wave 4 -> Wave 5)
    const targetLow = p4.price + sign * w1 * 0.618;
    const targetHigh = p4.price + sign * w1 * 1.0;
    const invalidationLevel = p1.price; // Wave 4/5 invalidates if price falls back into Wave 1 territory

    return {
      patternType: 'impulse',
      direction,
      degree,
      points,
      activeWave: 'Welle (5) im Aufbau',
      status: isBull ? 'Aufwärtsimpuls (Welle 5 aktiv)' : 'Abwärtsimpuls (Welle 5 aktiv)',
      invalidationLevel,
      targetZone: {
        low: Math.min(targetLow, targetHigh),
        high: Math.max(targetLow, targetHigh),
        label: 'Zielzone Welle (5)',
      },
      confidence,
      rulesChecked: {
        wave2Valid: rules.wave2Valid,
        wave3Valid: rules.wave3Valid,
        wave4Valid: rules.wave4Valid,
      },
      rationale: `Regelkonformer 5-Wellen-Impuls ab ${p0.price.toFixed(
        2,
      )}: Welle 2 korrigierte ${(r2 * 100).toFixed(0)} % von W1, Welle 3 erreichte ${(
        r3 * 100
      ).toFixed(0)} % von W1, Welle 4 hielt sauber über W1.`,
    };
  }

  // 5-wave impulse completed -> project subsequent A-B-C correction zone (0.382 - 0.618 of total impulse)
  const totalSpan = Math.abs(p5.price - p0.price);
  const corrLow = p5.price - sign * totalSpan * 0.618;
  const corrHigh = p5.price - sign * totalSpan * 0.382;
  const invalidationLevel = p4.price;
  const wave5Extended = isBull ? currentPrice > p5.price : currentPrice < p5.price;

  return {
    patternType: 'impulse',
    direction,
    degree,
    points,
    activeWave: wave5Extended ? 'Welle (5) Ausdehnung' : 'Korrektur nach Welle (5)',
    status: isBull ? '5-Wellen-Impuls abgeschlossen (Bullish)' : '5-Wellen-Impuls abgeschlossen (Bärisch)',
    invalidationLevel,
    targetZone: {
      low: Math.min(corrLow, corrHigh),
      high: Math.max(corrLow, corrHigh),
      label: 'Erwartete A-B-C Korrekturzone',
    },
    confidence,
    rulesChecked: {
      wave2Valid: rules.wave2Valid,
      wave3Valid: rules.wave3Valid,
      wave4Valid: rules.wave4Valid,
    },
    rationale: `Vollständige Impulsstruktur (1)–(5) erkannt (W3 = ${(r3 * 100).toFixed(
      0,
    )} % W1). Nach Abschluss von Welle (5) liegt die typische Fibonacci-Korrekturzone bei 38,2–61,8 % des Gesamtimpulses.`,
  };
}

function buildAbcCandidate(
  slice: WavePivot[],
  degree: ElliottDegree,
  totalPivots: number,
  endPivotIndex: number,
): ElliottWaveCount | null {
  if (slice.length !== 4) return null;
  const [p0, pA, pB, pC] = slice;

  const isBearishCorr = pA.price < p0.price; // A down, B up, C down
  const dirOk = isBearishCorr
    ? pA.price < p0.price && pB.price > pA.price && pC.price < pB.price
    : pA.price > p0.price && pB.price < pA.price && pC.price > pB.price;

  if (!dirOk) return null;

  const wA = Math.abs(pA.price - p0.price);
  const wB = Math.abs(pB.price - pA.price);
  const wC = Math.abs(pC.price - pB.price);
  if (wA === 0) return null;

  const rB = wB / wA;
  const rC = wC / wA;

  // Classic ZigZag or regular/expanded flat bounds
  if (rB > 1.25 || rC < 0.5) return null;

  const fibScore =
    Math.max(closenessScore(rB, 0.618, 0.35), closenessScore(rB, 0.5, 0.35)) * 40 +
    Math.max(closenessScore(rC, 1.0, 0.45), closenessScore(rC, 1.272, 0.45)) * 45;

  const recencyPenalty = Math.max(0, totalPivots - 1 - endPivotIndex) * 7;
  const confidence = Math.max(35, Math.min(90, Math.round(fibScore + 12 - recencyPenalty)));

  const points: LabeledWavePoint[] = [
    { ...p0, label: '0' },
    { ...pA, label: 'A' },
    { ...pB, label: 'B' },
    { ...pC, label: 'C' },
  ];

  // After A-B-C completes, next impulse resumes opposite to A-C direction
  const nextDirection: 'bullish' | 'bearish' = isBearishCorr ? 'bullish' : 'bearish';
  const sign = nextDirection === 'bullish' ? 1 : -1;
  const targetLow = pC.price + sign * wA * 0.618;
  const targetHigh = pC.price + sign * wA * 1.272;

  return {
    patternType: 'abc_correction',
    direction: isBearishCorr ? 'bearish' : 'bullish',
    degree,
    points,
    activeWave: 'Abschluss Welle (C)',
    status: isBearishCorr ? 'Abwärtskorrektur A–B–C' : 'Erholungskorrektur A–B–C',
    invalidationLevel: isBearishCorr ? pC.price * 0.99 : pC.price * 1.01,
    targetZone: {
      low: Math.min(targetLow, targetHigh),
      high: Math.max(targetLow, targetHigh),
      label: isBearishCorr ? 'Rebound-Ziel nach (C)' : 'Folgeziel nach (C)',
    },
    confidence,
    rulesChecked: {
      wave2Valid: rB <= 1.0,
      wave3Valid: true,
      wave4Valid: true,
    },
    rationale: `Korrektive A–B–C-Sequenz: Welle B erreichte ${(rB * 100).toFixed(
      0,
    )} % von A, Welle C entspricht ${(rC * 100).toFixed(0)} % von A.`,
  };
}

export function analyzeElliottWaves(
  candles: Candle[],
  degree: ElliottDegree = 'intermediate',
): ElliottAnalysisResult {
  const pivots = extractZigZagPivots(candles, degree);
  if (pivots.length < 4) {
    return { degree, pivots, primary: null, alternative: null };
  }

  const currentPrice = candles[candles.length - 1].close;
  const candidates: ElliottWaveCount[] = [];

  // Search recent 6-pivot and 5-pivot impulse windows
  for (let end = pivots.length - 1; end >= Math.max(3, pivots.length - 4); end--) {
    if (end >= 5) {
      const imp6 = buildImpulseCandidate(
        pivots.slice(end - 5, end + 1),
        degree,
        pivots.length,
        end,
        currentPrice,
      );
      if (imp6) candidates.push(imp6);
    }

    if (end >= 4) {
      const imp5 = buildImpulseCandidate(
        pivots.slice(end - 4, end + 1),
        degree,
        pivots.length,
        end,
        currentPrice,
      );
      if (imp5) candidates.push(imp5);
    }

    if (end >= 3) {
      const abc = buildAbcCandidate(
        pivots.slice(end - 3, end + 1),
        degree,
        pivots.length,
        end,
      );
      if (abc) candidates.push(abc);
    }
  }

  // Sort by highest confidence, favoring impulse patterns slightly when tied
  candidates.sort((a, b) => {
    const scoreA = a.confidence + (a.patternType === 'impulse' ? 4 : 0);
    const scoreB = b.confidence + (b.patternType === 'impulse' ? 4 : 0);
    return scoreB - scoreA;
  });

  const primary = candidates[0] ?? null;
  const alternative =
    candidates.find(
      (c) =>
        primary &&
        (c.patternType !== primary.patternType || c.direction !== primary.direction),
    ) ?? null;

  return {
    degree,
    pivots,
    primary,
    alternative,
  };
}

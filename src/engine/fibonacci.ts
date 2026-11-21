import type { Candle } from '../../shared/types.ts';

export interface FibLevel {
  ratio: number;
  label: string;
  price: number;
  isGoldenPocket: boolean;
  isExtension: boolean;
}

export interface FibAnchor {
  time: number;
  price: number;
}

export interface FibonacciAnalysis {
  direction: 'uptrend' | 'downtrend';
  anchorStart: FibAnchor; // 1.0 origin (Swing Low in uptrend, Swing High in downtrend)
  anchorEnd: FibAnchor;   // 0.0 end (Swing High in uptrend, Swing Low in downtrend)
  levels: FibLevel[];
  goldenPocket: { low: number; high: number };
  inGoldenPocket: boolean;
  nearKeyLevel: FibLevel | null;
  nearestSupport: FibLevel | null;
  nearestResistance: FibLevel | null;
  pricePositionLabel: string;
}

const RETRACEMENT_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.65, 0.786, 1];
const EXTENSION_RATIOS = [1.272, 1.618, 2.618];

export function computeFibonacciFromAnchors(
  start: FibAnchor,
  end: FibAnchor,
  currentPrice: number,
): FibonacciAnalysis {
  const direction: 'uptrend' | 'downtrend' = end.price >= start.price ? 'uptrend' : 'downtrend';
  const span = Math.abs(end.price - start.price);

  // Standard convention:
  // In an uptrend (low -> high): 0.0 is the Swing High, 1.0 is the Swing Low (retracement pulls back down from High).
  // Extensions project above the Swing High: High + (ratio - 1) * span (e.g. 1.272 -> +0.272*span above High, 1.618 -> +0.618*span above High).
  // In a downtrend (high -> low): 0.0 is the Swing Low, 1.0 is the Swing High (retracement bounces up from Low).
  // Extensions project below the Swing Low: Low - (ratio - 1) * span.
  const levels: FibLevel[] = [];

  for (const r of RETRACEMENT_RATIOS) {
    const price =
      direction === 'uptrend' ? end.price - span * r : end.price + span * r;
    levels.push({
      ratio: r,
      label: r === 0.65 ? '0.650 (GP)' : r === 0.618 ? '0.618 (GP)' : r.toFixed(3),
      price,
      isGoldenPocket: r === 0.618 || r === 0.65,
      isExtension: false,
    });
  }

  for (const r of EXTENSION_RATIOS) {
    const price =
      direction === 'uptrend'
        ? end.price + span * (r - 1)
        : end.price - span * (r - 1);
    levels.push({
      ratio: r,
      label: `${r.toFixed(3)} Ext`,
      price,
      isGoldenPocket: false,
      isExtension: true,
    });
  }

  const fib618 = levels.find((l) => l.ratio === 0.618)!.price;
  const fib650 = levels.find((l) => l.ratio === 0.65)!.price;
  const goldenPocket = {
    low: Math.min(fib618, fib650),
    high: Math.max(fib618, fib650),
  };

  const tolerance = span * 0.025 || currentPrice * 0.005;
  const inGoldenPocket =
    currentPrice >= goldenPocket.low - tolerance &&
    currentPrice <= goldenPocket.high + tolerance;

  const sortedByDist = [...levels].sort(
    (a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice),
  );
  const closest = sortedByDist[0] ?? null;
  const nearKeyLevel =
    closest && Math.abs(closest.price - currentPrice) <= Math.max(span * 0.03, currentPrice * 0.006)
      ? closest
      : null;

  const below = levels
    .filter((l) => l.price <= currentPrice)
    .sort((a, b) => b.price - a.price);
  const above = levels
    .filter((l) => l.price > currentPrice)
    .sort((a, b) => a.price - b.price);

  const nearestSupport = below[0] ?? null;
  const nearestResistance = above[0] ?? null;

  let pricePositionLabel = 'Zwischen Schlüsselniveaus';
  if (inGoldenPocket) {
    pricePositionLabel = 'Im Golden Pocket (0.618–0.650)';
  } else if (
    (direction === 'uptrend' && currentPrice > end.price) ||
    (direction === 'downtrend' && currentPrice < end.price)
  ) {
    pricePositionLabel = 'Extension-Bereich über Swing-Extrem';
  } else if (nearKeyLevel) {
    pricePositionLabel = `Am Fib-Niveau ${nearKeyLevel.label}`;
  } else if (direction === 'uptrend') {
    const retracePct = span > 0 ? ((end.price - currentPrice) / span) * 100 : 0;
    pricePositionLabel = `Retracement ~${retracePct.toFixed(1)} % des Aufwärts-Swings`;
  } else {
    const retracePct = span > 0 ? ((currentPrice - end.price) / span) * 100 : 0;
    pricePositionLabel = `Gegenbewegung ~${retracePct.toFixed(1)} % des Abwärts-Swings`;
  }

  return {
    direction,
    anchorStart: start,
    anchorEnd: end,
    levels,
    goldenPocket,
    inGoldenPocket,
    nearKeyLevel,
    nearestSupport,
    nearestResistance,
    pricePositionLabel,
  };
}

export function computeAutoFibonacci(
  candles: Candle[],
  lookbackBars = 120,
): FibonacciAnalysis | null {
  if (candles.length < 10) return null;
  const window = candles.slice(-Math.min(lookbackBars, candles.length));

  let minBar = window[0];
  let minIdx = 0;
  let maxBar = window[0];
  let maxIdx = 0;

  for (let i = 1; i < window.length; i++) {
    if (window[i].low < minBar.low) {
      minBar = window[i];
      minIdx = i;
    }
    if (window[i].high > maxBar.high) {
      maxBar = window[i];
      maxIdx = i;
    }
  }

  if (maxBar.high <= minBar.low) return null;

  const currentPrice = window[window.length - 1].close;

  // If the swing low occurred before the swing high, dominant impulse is upward.
  // If the swing high occurred before the swing low, dominant impulse is downward.
  if (minIdx <= maxIdx) {
    return computeFibonacciFromAnchors(
      { time: minBar.time, price: minBar.low },
      { time: maxBar.time, price: maxBar.high },
      currentPrice,
    );
  }

  return computeFibonacciFromAnchors(
    { time: maxBar.time, price: maxBar.high },
    { time: minBar.time, price: minBar.low },
    currentPrice,
  );
}

import type { Candle } from '../../shared/types.ts';

export interface TimeValue {
  time: number;
  value: number;
}

export interface MACrossEvent {
  time: number;
  price: number;
  type: 'golden_cross' | 'death_cross';
}

export function calculateSMA(candles: Candle[], period: number): TimeValue[] {
  if (period <= 0 || candles.length < period) return [];
  const result: TimeValue[] = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result.push({
        time: candles[i].time,
        value: sum / period,
      });
    }
  }
  return result;
}

export function calculateEMA(candles: Candle[], period: number): TimeValue[] {
  if (period <= 0 || candles.length < period) return [];
  const result: TimeValue[] = [];
  const k = 2 / (period + 1);

  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += candles[i].close;
  }
  let ema = initialSum / period;
  result.push({ time: candles[period - 1].time, value: ema });

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    result.push({ time: candles[i].time, value: ema });
  }
  return result;
}

/**
 * Rolling / anchored session VWAP.
 * For intraday candles, resets at each UTC day boundary; for daily/weekly candles, computes a rolling 20-bar VWAP.
 * Gracefully returns empty array if total volume across bars is 0 (e.g., cash indices without volume).
 */
export function calculateVWAP(candles: Candle[], isIntraday = false): TimeValue[] {
  if (candles.length === 0) return [];
  const hasVolume = candles.some((c) => c.volume > 0);
  if (!hasVolume) return [];

  const result: TimeValue[] = [];
  if (isIntraday) {
    let currentDay = '';
    let cumPv = 0;
    let cumVol = 0;
    for (const c of candles) {
      const day = new Date(c.time * 1000).toISOString().slice(0, 10);
      if (day !== currentDay) {
        currentDay = day;
        cumPv = 0;
        cumVol = 0;
      }
      const tp = (c.high + c.low + c.close) / 3;
      const vol = Math.max(c.volume, 0);
      cumPv += tp * vol;
      cumVol += vol;
      if (cumVol > 0) {
        result.push({ time: c.time, value: cumPv / cumVol });
      }
    }
    return result;
  }

  const windowSize = 20;
  for (let i = 0; i < candles.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    let pv = 0;
    let vol = 0;
    for (let j = start; j <= i; j++) {
      const c = candles[j];
      const tp = (c.high + c.low + c.close) / 3;
      pv += tp * Math.max(c.volume, 0);
      vol += Math.max(c.volume, 0);
    }
    if (vol > 0) {
      result.push({ time: candles[i].time, value: pv / vol });
    }
  }
  return result;
}

export function toHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const ha: Candle[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen =
      i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    ha.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    });
  }

  return ha;
}

export function detectMACrosses(fast: TimeValue[], slow: TimeValue[]): MACrossEvent[] {
  if (fast.length === 0 || slow.length === 0) return [];
  const fastMap = new Map(fast.map((p) => [p.time, p.value]));
  const aligned: Array<{ time: number; f: number; s: number }> = [];

  for (const sPoint of slow) {
    const fVal = fastMap.get(sPoint.time);
    if (fVal !== undefined) {
      aligned.push({ time: sPoint.time, f: fVal, s: sPoint.value });
    }
  }

  const events: MACrossEvent[] = [];
  for (let i = 1; i < aligned.length; i++) {
    const prev = aligned[i - 1];
    const curr = aligned[i];
    if (prev.f <= prev.s && curr.f > curr.s) {
      events.push({ time: curr.time, price: curr.s, type: 'golden_cross' });
    } else if (prev.f >= prev.s && curr.f < curr.s) {
      events.push({ time: curr.time, price: curr.s, type: 'death_cross' });
    }
  }
  return events;
}

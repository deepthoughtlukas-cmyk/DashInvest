import type { Candle } from '../../shared/types.ts';
import { calculateEMA, calculateSMA, type TimeValue } from './movingAverages.ts';

export interface SupertrendPoint {
  time: number;
  value: number;
  direction: 1 | -1; // 1 = Bullish (support below price), -1 = Bearish (resistance above price)
  flipped: boolean;
}

export interface BollingerPoint {
  time: number;
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
  isSqueeze: boolean;
}

export interface IchimokuResult {
  tenkan: TimeValue[];
  kijun: TimeValue[];
  senkouA: TimeValue[];
  senkouB: TimeValue[];
}

export interface RSIDivergence {
  time: number;
  price: number;
  rsi: number;
  type: 'bullish' | 'bearish';
  description: string;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
  crossover: 'bullish' | 'bearish' | null;
}

export interface ADXPoint {
  time: number;
  adx: number;
  plusDI: number;
  minusDI: number;
}

export function calculateATR(candles: Candle[], period = 14): TimeValue[] {
  if (candles.length <= period || period <= 0) return [];
  const tr: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const c = candles[i];
    tr.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose),
      ),
    );
  }

  let atr = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  const result: TimeValue[] = [{ time: candles[period].time, value: atr }];

  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result.push({ time: candles[i].time, value: atr });
  }

  return result;
}

export function calculateSupertrend(
  candles: Candle[],
  period = 10,
  multiplier = 3,
): SupertrendPoint[] {
  const atrSeries = calculateATR(candles, period);
  if (atrSeries.length === 0) return [];

  const atrMap = new Map(atrSeries.map((p) => [p.time, p.value]));
  const result: SupertrendPoint[] = [];

  let finalUpper = 0;
  let finalLower = 0;
  let direction: 1 | -1 = 1;
  let initialized = false;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const atr = atrMap.get(c.time);
    if (atr === undefined) continue;

    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    if (!initialized) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      direction = c.close >= hl2 ? 1 : -1;
      initialized = true;
      result.push({
        time: c.time,
        value: direction === 1 ? finalLower : finalUpper,
        direction,
        flipped: false,
      });
      continue;
    }

    const prevClose = candles[i - 1].close;
    const prevUpper = finalUpper;
    const prevLower = finalLower;
    const prevDir: 1 | -1 = direction;

    finalUpper = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper;
    finalLower = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower;

    if (prevDir === -1 && c.close > prevUpper) {
      direction = 1;
    } else if (prevDir === 1 && c.close < prevLower) {
      direction = -1;
    } else {
      direction = prevDir;
    }

    result.push({
      time: c.time,
      value: direction === 1 ? finalLower : finalUpper,
      direction,
      flipped: direction !== prevDir,
    });
  }

  return result;
}

export function calculateBollingerBands(
  candles: Candle[],
  period = 20,
  stdDevMult = 2,
): BollingerPoint[] {
  const sma = calculateSMA(candles, period);
  if (sma.length === 0) return [];

  const candleByTime = new Map(candles.map((c, idx) => [c.time, idx]));
  const rawPoints: Array<{
    time: number;
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
  }> = [];

  for (const midPoint of sma) {
    const endIdx = candleByTime.get(midPoint.time);
    if (endIdx === undefined || endIdx < period - 1) continue;
    let variance = 0;
    for (let j = endIdx - period + 1; j <= endIdx; j++) {
      const diff = candles[j].close - midPoint.value;
      variance += diff * diff;
    }
    const sd = Math.sqrt(variance / period);
    const upper = midPoint.value + stdDevMult * sd;
    const lower = midPoint.value - stdDevMult * sd;
    const bandwidth = midPoint.value !== 0 ? ((upper - lower) / midPoint.value) * 100 : 0;

    rawPoints.push({
      time: midPoint.time,
      upper,
      middle: midPoint.value,
      lower,
      bandwidth,
    });
  }

  return rawPoints.map((pt, idx) => {
    const lookback = rawPoints.slice(Math.max(0, idx - 60), idx + 1).map((p) => p.bandwidth);
    const sorted = [...lookback].sort((a, b) => a - b);
    const p15 = sorted[Math.floor(sorted.length * 0.15)] ?? pt.bandwidth;
    return {
      ...pt,
      isSqueeze: lookback.length >= 20 && pt.bandwidth <= p15,
    };
  });
}

function donchianMid(candles: Candle[], endIdx: number, period: number): number | null {
  if (endIdx < period - 1) return null;
  let hh = -Infinity;
  let ll = Infinity;
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    if (candles[i].high > hh) hh = candles[i].high;
    if (candles[i].low < ll) ll = candles[i].low;
  }
  return (hh + ll) / 2;
}

export function calculateIchimoku(candles: Candle[]): IchimokuResult {
  const tenkan: TimeValue[] = [];
  const kijun: TimeValue[] = [];
  const senkouA: TimeValue[] = [];
  const senkouB: TimeValue[] = [];

  for (let i = 0; i < candles.length; i++) {
    const tVal = donchianMid(candles, i, 9);
    const kVal = donchianMid(candles, i, 26);
    const bSrcIdx = i - 26;
    if (tVal !== null) tenkan.push({ time: candles[i].time, value: tVal });
    if (kVal !== null) kijun.push({ time: candles[i].time, value: kVal });

    if (bSrcIdx >= 0) {
      const tShifted = donchianMid(candles, bSrcIdx, 9);
      const kShifted = donchianMid(candles, bSrcIdx, 26);
      const bShifted = donchianMid(candles, bSrcIdx, 52);
      if (tShifted !== null && kShifted !== null) {
        senkouA.push({ time: candles[i].time, value: (tShifted + kShifted) / 2 });
      }
      if (bShifted !== null) {
        senkouB.push({ time: candles[i].time, value: bShifted });
      }
    }
  }

  return { tenkan, kijun, senkouA, senkouB };
}

export function calculateRSI(candles: Candle[], period = 14): TimeValue[] {
  if (candles.length <= period || period <= 0) return [];
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const toRsi = (g: number, l: number) => {
    if (l === 0 && g === 0) return 50;
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  };

  const result: TimeValue[] = [{ time: candles[period].time, value: toRsi(avgGain, avgLoss) }];

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push({ time: candles[i].time, value: toRsi(avgGain, avgLoss) });
  }

  return result;
}

export function detectRSIDivergences(
  candles: Candle[],
  rsi: TimeValue[],
  pivotWindow = 4,
): RSIDivergence[] {
  if (candles.length < pivotWindow * 4 || rsi.length < pivotWindow * 4) return [];

  const rsiMap = new Map(rsi.map((p) => [p.time, p.value]));
  const aligned: Array<{ time: number; high: number; low: number; close: number; rsi: number }> = [];

  for (const c of candles) {
    const r = rsiMap.get(c.time);
    if (r !== undefined) {
      aligned.push({ time: c.time, high: c.high, low: c.low, close: c.close, rsi: r });
    }
  }

  const lows: number[] = [];
  const highs: number[] = [];

  for (let i = pivotWindow; i < aligned.length - pivotWindow; i++) {
    let isLow = true;
    let isHigh = true;
    for (let j = i - pivotWindow; j <= i + pivotWindow; j++) {
      if (j === i) continue;
      if (aligned[j].low <= aligned[i].low) isLow = false;
      if (aligned[j].high >= aligned[i].high) isHigh = false;
    }
    if (isLow) lows.push(i);
    if (isHigh) highs.push(i);
  }

  const divergences: RSIDivergence[] = [];

  for (let k = 1; k < lows.length; k++) {
    const prevIdx = lows[k - 1];
    const currIdx = lows[k];
    if (currIdx - prevIdx < 5 || currIdx - prevIdx > 65) continue;
    const p1 = aligned[prevIdx];
    const p2 = aligned[currIdx];
    if (p2.low < p1.low && p2.rsi > p1.rsi + 2.5 && p2.rsi < 50) {
      divergences.push({
        time: p2.time,
        price: p2.low,
        rsi: Number(p2.rsi.toFixed(1)),
        type: 'bullish',
        description: `Bullishe RSI-Divergenz (Tieferes Preistief bei höherem RSI ${p1.rsi.toFixed(
          0,
        )} -> ${p2.rsi.toFixed(0)})`,
      });
    }
  }

  for (let k = 1; k < highs.length; k++) {
    const prevIdx = highs[k - 1];
    const currIdx = highs[k];
    if (currIdx - prevIdx < 5 || currIdx - prevIdx > 65) continue;
    const p1 = aligned[prevIdx];
    const p2 = aligned[currIdx];
    if (p2.high > p1.high && p2.rsi < p1.rsi - 2.5 && p2.rsi > 50) {
      divergences.push({
        time: p2.time,
        price: p2.high,
        rsi: Number(p2.rsi.toFixed(1)),
        type: 'bearish',
        description: `Bärische RSI-Divergenz (Höheres Preishoch bei schwächerem RSI ${p1.rsi.toFixed(
          0,
        )} -> ${p2.rsi.toFixed(0)})`,
      });
    }
  }

  return divergences.sort((a, b) => a.time - b.time);
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDPoint[] {
  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);
  if (fastEma.length === 0 || slowEma.length === 0) return [];

  const fastMap = new Map(fastEma.map((p) => [p.time, p.value]));
  const macdLine: TimeValue[] = [];

  for (const s of slowEma) {
    const f = fastMap.get(s.time);
    if (f !== undefined) {
      macdLine.push({ time: s.time, value: f - s.value });
    }
  }

  if (macdLine.length < signalPeriod) return [];
  const k = 2 / (signalPeriod + 1);
  let signal = macdLine.slice(0, signalPeriod).reduce((a, b) => a + b.value, 0) / signalPeriod;

  const result: MACDPoint[] = [];
  for (let i = signalPeriod - 1; i < macdLine.length; i++) {
    if (i > signalPeriod - 1) {
      signal = macdLine[i].value * k + signal * (1 - k);
    }
    const macd = macdLine[i].value;
    const histogram = macd - signal;
    const prev = result[result.length - 1];
    let crossover: 'bullish' | 'bearish' | null = null;
    if (prev) {
      if (prev.macd <= prev.signal && macd > signal) crossover = 'bullish';
      else if (prev.macd >= prev.signal && macd < signal) crossover = 'bearish';
    }
    result.push({
      time: macdLine[i].time,
      macd,
      signal,
      histogram,
      crossover,
    });
  }

  return result;
}

export function calculateADX(candles: Candle[], period = 14): ADXPoint[] {
  if (candles.length < period * 2 + 2) return [];

  const trList: number[] = [];
  const plusDmList: number[] = [];
  const minusDmList: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    trList.push(tr);
    plusDmList.push(plusDm);
    minusDmList.push(minusDm);
  }

  let smoothTr = trList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDm = plusDmList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDm = minusDmList.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: Array<{ time: number; dx: number; plusDI: number; minusDI: number }> = [];

  const pushDx = (idx: number) => {
    const plusDI = smoothTr > 0 ? (100 * smoothPlusDm) / smoothTr : 0;
    const minusDI = smoothTr > 0 ? (100 * smoothMinusDm) / smoothTr : 0;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (100 * Math.abs(plusDI - minusDI)) / diSum : 0;
    dxValues.push({ time: candles[idx + 1].time, dx, plusDI, minusDI });
  };

  pushDx(period - 1);

  for (let i = period; i < trList.length; i++) {
    smoothTr = smoothTr - smoothTr / period + trList[i];
    smoothPlusDm = smoothPlusDm - smoothPlusDm / period + plusDmList[i];
    smoothMinusDm = smoothMinusDm - smoothMinusDm / period + minusDmList[i];
    pushDx(i);
  }

  if (dxValues.length < period) return [];

  let adx = dxValues.slice(0, period).reduce((a, b) => a + b.dx, 0) / period;
  const result: ADXPoint[] = [
    {
      time: dxValues[period - 1].time,
      adx,
      plusDI: dxValues[period - 1].plusDI,
      minusDI: dxValues[period - 1].minusDI,
    },
  ];

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i].dx) / period;
    result.push({
      time: dxValues[i].time,
      adx,
      plusDI: dxValues[i].plusDI,
      minusDI: dxValues[i].minusDI,
    });
  }

  return result;
}

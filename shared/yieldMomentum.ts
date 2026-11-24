import type { MacroPoint, Us3mMomentumAnalysis } from './types.ts';

function computeEmaValues(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = values[0];
  out.push(ema);
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

/**
 * Computes a leading yield-momentum indicator on constant-maturity 3-Month US Treasury yields (DGS3MO).
 * Uses EMA(10) - EMA(30) spread in basis points, 5-trading-day acceleration, zero-line turn recency,
 * and divergence comparison vs. 10Y Treasury yield 1-month momentum (as short-end yields often lead 10Y moves).
 */
export function analyzeUs3mMomentum(
  history: MacroPoint[],
  us10yChange1mBps = 0,
): Us3mMomentumAnalysis {
  if (history.length < 15) {
    const last = history[history.length - 1]?.value ?? 0;
    return {
      status: 'neutral',
      statusLabel: 'Datenbasis zu kurz',
      direction: 'neutral',
      isTurning: false,
      emaFast: Number(last.toFixed(3)),
      emaSlow: Number(last.toFixed(3)),
      momentumBps: 0,
      momentumDelta5dBps: 0,
      lastTurnDate: null,
      lastTurnDirection: null,
      tradingDaysSinceTurn: null,
      leadSignal: 'aligned',
      leadSummary: '3M & 10J aktuell im Gleichlauf',
      summary: 'Noch zu wenig Historie für verlässliche 3M-Momentum-Signale.',
    };
  }

  const closes = history.map((p) => p.value);
  const emaFastArr = computeEmaValues(closes, 10);
  const emaSlowArr = computeEmaValues(closes, 30);
  const momSeriesBps = closes.map((_, i) => (emaFastArr[i] - emaSlowArr[i]) * 100);

  const lastIdx = closes.length - 1;
  const emaFast = Number(emaFastArr[lastIdx].toFixed(3));
  const emaSlow = Number(emaSlowArr[lastIdx].toFixed(3));
  const momentumBps = Number(momSeriesBps[lastIdx].toFixed(1));
  const lookbackIdx = Math.max(0, lastIdx - 5);
  const momentumDelta5dBps = Number((momSeriesBps[lastIdx] - momSeriesBps[lookbackIdx]).toFixed(1));
  const recent5dYieldDeltaBps = (closes[lastIdx] - closes[lookbackIdx]) * 100;

  let lastTurnIdx: number | null = null;
  let lastTurnDirection: 'up' | 'down' | null = null;

  for (let i = Math.max(10, 1); i < momSeriesBps.length; i++) {
    const prev = momSeriesBps[i - 1];
    const curr = momSeriesBps[i];
    if (prev <= 0 && curr > 0) {
      lastTurnIdx = i;
      lastTurnDirection = 'up';
    } else if (prev >= 0 && curr < 0) {
      lastTurnIdx = i;
      lastTurnDirection = 'down';
    }
  }

  const lastTurnDate = lastTurnIdx !== null ? history[lastTurnIdx].date : null;
  const tradingDaysSinceTurn = lastTurnIdx !== null ? lastIdx - lastTurnIdx : null;

  let status: Us3mMomentumAnalysis['status'] = 'neutral';
  let statusLabel = 'Seitwärts / Stabil';
  let direction: Us3mMomentumAnalysis['direction'] = 'neutral';
  let isTurning = false;

  const recentUpCross =
    lastTurnDirection === 'up' &&
    tradingDaysSinceTurn !== null &&
    tradingDaysSinceTurn <= 15 &&
    momentumBps >= 1.5 &&
    recent5dYieldDeltaBps >= 1;
  const recentDownCross =
    lastTurnDirection === 'down' &&
    tradingDaysSinceTurn !== null &&
    tradingDaysSinceTurn <= 15 &&
    momentumBps <= -1.5 &&
    recent5dYieldDeltaBps <= -1;
  const inflectionUp =
    momentumDelta5dBps >= 5 && momentumBps > -6 && recent5dYieldDeltaBps >= 3;
  const inflectionDown =
    momentumDelta5dBps <= -5 && momentumBps < 6 && recent5dYieldDeltaBps <= -3;

  if (recentUpCross || inflectionUp) {
    status = 'turning_up';
    statusLabel = 'Momentum dreht aufwärts';
    direction = 'up';
    isTurning = true;
  } else if (recentDownCross || inflectionDown) {
    status = 'turning_down';
    statusLabel = 'Momentum dreht abwärts';
    direction = 'down';
    isTurning = true;
  } else if (momentumBps >= 3) {
    status = 'rising';
    statusLabel = 'Aufwärts-Momentum';
    direction = 'up';
  } else if (momentumBps <= -3) {
    status = 'falling';
    statusLabel = 'Abwärts-Momentum';
    direction = 'down';
  }

  let leadSignal: Us3mMomentumAnalysis['leadSignal'] = 'aligned';
  let leadSummary = '3M & 10J aktuell im Gleichlauf';

  if ((status === 'turning_up' || status === 'rising') && us10yChange1mBps <= 5) {
    leadSignal = 'diverging_up';
    leadSummary = 'Vorlauf-Warnung: 3M zieht an, 10J noch ruhig';
  } else if ((status === 'turning_down' || status === 'falling') && us10yChange1mBps >= -5) {
    leadSignal = 'diverging_down';
    leadSummary = 'Vorlauf-Entlastung: 3M kippt ab, 10J noch hoch';
  }

  let summary: string;
  if (status === 'turning_up') {
    summary =
      'Kurzfrist-Zins dreht nach oben — oft Vorläufer für steigende 10J-Renditen und Gegenwind für Aktien & Gold.';
  } else if (status === 'turning_down') {
    summary =
      'Kurzfrist-Zins kippt nach unten — frühes Zeichen für Entspannung bei den 10J-Renditen und Zins-Rückenwind.';
  } else if (status === 'rising') {
    summary = '3M-Rendite baut Aufwärtsdruck auf; längere Laufzeiten folgen diesem Impuls oft zeitversetzt.';
  } else if (status === 'falling') {
    summary = '3M-Rendite verliert spürbar an Zinsdruck — begünstigt perspektivisch sinkende 10J-Zinsen.';
  } else {
    summary = 'Keine Richtungsdrehung am kurzen Ende; 3M-Zins läuft ruhig ohne Vorlaufsignal.';
  }

  return {
    status,
    statusLabel,
    direction,
    isTurning,
    emaFast,
    emaSlow,
    momentumBps,
    momentumDelta5dBps,
    lastTurnDate,
    lastTurnDirection,
    tradingDaysSinceTurn,
    leadSignal,
    leadSummary,
    summary,
  };
}

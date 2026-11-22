import {
  DEFAULT_CATALOG_BY_SYMBOL,
  inferAssetClass,
  resolveCanonicalSymbol,
} from '../../shared/catalog.ts';
import type {
  AssetClass,
  Candle,
  ElliottDegree,
  MacroOverview,
  Timeframe,
} from '../../shared/types.ts';
import {
  calculateEMA,
  calculateSMA,
  calculateVWAP,
  detectMACrosses,
  type MACrossEvent,
  type TimeValue,
} from './movingAverages.ts';
import {
  calculateADX,
  calculateBollingerBands,
  calculateIchimoku,
  calculateMACD,
  calculateRSI,
  calculateSupertrend,
  detectRSIDivergences,
  type ADXPoint,
  type BollingerPoint,
  type IchimokuResult,
  type MACDPoint,
  type RSIDivergence,
  type SupertrendPoint,
} from './indicators.ts';
import { computeAutoFibonacci, type FibonacciAnalysis } from './fibonacci.ts';
import { analyzeElliottWaves, type ElliottAnalysisResult } from './elliottWave.ts';

export interface MacroPillarEvaluation {
  id: 'netLiquidity' | 'm2' | 'creditSpreads' | 'us10y' | 'dxy';
  label: string;
  score: number; // -2 to +2
  statusLabel: string;
  summary: string;
}

export interface MacroRegimeEvaluation {
  score: number; // -100..+100
  regime: 'expansion' | 'neutral' | 'risk-off';
  regimeLabel: string;
  pillars: MacroPillarEvaluation[];
  alerts: string[];
}

export interface SignalEvent {
  id: string;
  assetId: string;
  time: number;
  title: string;
  detail: string;
  severity: 'bullish' | 'bearish' | 'warning' | 'info';
  source: 'Trend' | 'Momentum' | 'Fibonacci' | 'Elliott' | 'Makro';
}

export interface FullAssetAnalysis {
  assetId: string;
  symbol: string;
  assetClass: AssetClass;
  timeframe: Timeframe;
  latestPrice: number;
  ema9: TimeValue[];
  ema21: TimeValue[];
  sma50: TimeValue[];
  sma200: TimeValue[];
  vwap: TimeValue[];
  maCrosses: MACrossEvent[];
  supertrend: SupertrendPoint[];
  bollinger: BollingerPoint[];
  ichimoku: IchimokuResult;
  rsi: TimeValue[];
  rsiDivergences: RSIDivergence[];
  macd: MACDPoint[];
  adx: ADXPoint[];
  fibonacci: FibonacciAnalysis | null;
  elliott: ElliottAnalysisResult;
  latest: {
    ema21: number | null;
    sma50: number | null;
    sma200: number | null;
    supertrendDir: 1 | -1 | null;
    supertrendVal: number | null;
    rsi: number | null;
    macdHist: number | null;
    macdBullish: boolean;
    adx: number | null;
    plusDI: number | null;
    minusDI: number | null;
    bollingerSqueeze: boolean;
  };
  scores: {
    trend: number;     // -100..+100
    momentum: number;  // -100..+100
    chartTech: number; // -100..+100
    macro: number;     // -100..+100
    confluence: number;// -100..+100
    bias: 'Stark Bullisch' | 'Bullisch' | 'Neutral' | 'Bärisch' | 'Stark Bärisch';
  };
  signals: SignalEvent[];
}

function clampScore(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v)));
}

export function evaluateMacroRegime(macro: MacroOverview): MacroRegimeEvaluation {
  const pillars: MacroPillarEvaluation[] = [];
  const alerts: string[] = [];

  // 1. US Net Liquidity (weight 30%)
  let nlScore = 0;
  if (macro.netLiquidity.delta4wB > 50 && macro.netLiquidity.delta13wB > 50) nlScore = 2;
  else if (macro.netLiquidity.delta4wB > 15 || macro.netLiquidity.delta13wB > 40) nlScore = 1;
  else if (macro.netLiquidity.delta4wB < -50 && macro.netLiquidity.delta13wB < -50) nlScore = -2;
  else if (macro.netLiquidity.delta4wB < -15 || macro.netLiquidity.delta13wB < -40) nlScore = -1;

  pillars.push({
    id: 'netLiquidity',
    label: 'US-Marktliquidität',
    score: nlScore,
    statusLabel:
      nlScore > 0 ? 'Expansiv' : nlScore < 0 ? 'Kontraktiv' : 'Stabil / Neutral',
    summary: `Netto-Liquidität bei ${macro.netLiquidity.currentT.toFixed(
      2,
    )} Bio. USD (4W: ${macro.netLiquidity.delta4wB >= 0 ? '+' : ''}${macro.netLiquidity.delta4wB.toFixed(
      0,
    )} Mrd. USD).`,
  });

  if (macro.netLiquidity.delta4wB <= -80) {
    alerts.push(
      `Liquiditätsentzug: US Net Liquidity in 4 Wochen um ${Math.abs(
        macro.netLiquidity.delta4wB,
      ).toFixed(0)} Mrd. USD gesunken`,
    );
  } else if (macro.netLiquidity.delta4wB >= 80) {
    alerts.push(
      `Liquiditätsschub: US Net Liquidity in 4 Wochen um +${macro.netLiquidity.delta4wB.toFixed(
        0,
      )} Mrd. USD gestiegen`,
    );
  }

  // 2. Credit Spreads (weight 25%)
  let csScore = 0;
  if (macro.creditSpreads.hyOasBps < 320) csScore = 2;
  else if (macro.creditSpreads.hyOasBps < 380) csScore = 1;
  else if (macro.creditSpreads.hyOasBps > 520) csScore = -2;
  else if (macro.creditSpreads.hyOasBps > 430 || macro.creditSpreads.change1mBps > 40) csScore = -1;

  pillars.push({
    id: 'creditSpreads',
    label: 'Credit Spreads (HY OAS)',
    score: csScore,
    statusLabel:
      macro.creditSpreads.regime === 'risk-on'
        ? 'Risk-On (Entspannt)'
        : macro.creditSpreads.regime === 'stress'
          ? 'Stress-Regime'
          : 'Neutral / Wachsam',
    summary: `HY OAS bei ${macro.creditSpreads.hyOasBps} bps (${macro.creditSpreads.percentile5y}. Perzentil 5J).`,
  });

  if (macro.creditSpreads.hyOasBps >= 450) {
    alerts.push(`Kreditstress: HY Credit Spreads auf ${macro.creditSpreads.hyOasBps} bps gestiegen`);
  }

  // 3. M2 Money Supply (weight 15%)
  let m2Score = 0;
  if (macro.m2.yoyPercent >= 3 && macro.m2.threeMonthAnnualizedPercent >= 2) m2Score = 2;
  else if (macro.m2.yoyPercent > 1 || macro.m2.threeMonthAnnualizedPercent > 1.5) m2Score = 1;
  else if (macro.m2.yoyPercent < -1) m2Score = -2;
  else if (macro.m2.yoyPercent < 0) m2Score = -1;

  pillars.push({
    id: 'm2',
    label: 'Geldmenge M2',
    score: m2Score,
    statusLabel:
      macro.m2.status === 'expanding'
        ? 'Wachsend'
        : macro.m2.status === 'contracting'
          ? 'Schrumpfend'
          : 'Seitwärts',
    summary: `M2 bei ${macro.m2.latestT.toFixed(2)} Bio. USD (${macro.m2.yoyPercent >= 0 ? '+' : ''}${macro.m2.yoyPercent.toFixed(
      1,
    )} % YoY).`,
  });

  // 4. 10Y Treasury Yield (weight 15%)
  let y10Score = 0;
  if (macro.us10y.change1mBps <= -20 && macro.us10y.yieldPercent < 4.5) y10Score = 2;
  else if (macro.us10y.change1mBps <= -10) y10Score = 1;
  else if (macro.us10y.yieldPercent >= 4.8 && macro.us10y.change1mBps > 15) y10Score = -2;
  else if (macro.us10y.change1mBps >= 20 || macro.us10y.yieldPercent >= 4.75) y10Score = -1;

  pillars.push({
    id: 'us10y',
    label: '10J US-Renditen',
    score: y10Score,
    statusLabel:
      y10Score > 0 ? 'Entlastend' : y10Score < 0 ? 'Restriktiv' : 'Neutral',
    summary: `10J bei ${macro.us10y.yieldPercent.toFixed(2)} % (1M: ${macro.us10y.change1mBps >= 0 ? '+' : ''}${macro.us10y.change1mBps} bps).`,
  });

  if (macro.us10y.curveStatus === 'inverted') {
    alerts.push(`Zinskurve invertiert: 2s10s Spread bei ${macro.us10y.spread2s10sBps} bps`);
  }

  // 5. DXY (weight 15%)
  let dxyScore = 0;
  if (macro.dxy.trend === 'bearish' && macro.dxy.quote.changePercent < 0) dxyScore = 2;
  else if (macro.dxy.trend === 'bearish') dxyScore = 1;
  else if (macro.dxy.trend === 'bullish' && macro.dxy.quote.price > 105) dxyScore = -2;
  else if (macro.dxy.trend === 'bullish') dxyScore = -1;

  pillars.push({
    id: 'dxy',
    label: 'US-Dollar (DXY)',
    score: dxyScore,
    statusLabel:
      macro.dxy.trend === 'bullish'
        ? 'Dollar-Stärke (Gegenwind)'
        : macro.dxy.trend === 'bearish'
          ? 'Dollar-Schwäche (Rückenwind)'
          : 'Neutral',
    summary: `DXY bei ${macro.dxy.quote.price.toFixed(2)} Pkt. (${macro.dxy.trend}).`,
  });

  const weighted =
    (nlScore / 2) * 30 +
    (csScore / 2) * 25 +
    (m2Score / 2) * 15 +
    (y10Score / 2) * 15 +
    (dxyScore / 2) * 15;

  const score = clampScore(weighted);
  let regime: 'expansion' | 'neutral' | 'risk-off' = 'neutral';
  let regimeLabel = 'Neutral / Rotation';
  if (score >= 22) {
    regime = 'expansion';
    regimeLabel = 'Expansion / Risk-On';
  } else if (score <= -22) {
    regime = 'risk-off';
    regimeLabel = 'Liquiditätsdruck / Risk-Off';
  }

  return { score, regime, regimeLabel, pillars, alerts };
}

function computeAssetMacroScore(
  symbol: string,
  assetClass: AssetClass,
  macro: MacroOverview | undefined,
  macroRegime: MacroRegimeEvaluation | null,
): number {
  if (!macro || !macroRegime) return 0;

  const pMap = new Map(macroRegime.pillars.map((p) => [p.id, p.score]));
  const nl = (pMap.get('netLiquidity') ?? 0) * 50; // -100..100
  const cs = (pMap.get('creditSpreads') ?? 0) * 50;
  const m2 = (pMap.get('m2') ?? 0) * 50;
  const y10 = (pMap.get('us10y') ?? 0) * 50;
  const dxy = (pMap.get('dxy') ?? 0) * 50;

  if (symbol === 'SI=F') {
    return clampScore(dxy * 0.3 + nl * 0.25 + m2 * 0.2 + y10 * 0.15 + cs * 0.1);
  }
  if (symbol === '^NDX') {
    return clampScore(nl * 0.35 + y10 * 0.3 + cs * 0.2 + dxy * 0.15);
  }

  switch (assetClass) {
    case 'precious_metals':
      return clampScore(dxy * 0.35 + y10 * 0.25 + m2 * 0.25 + nl * 0.15);
    case 'commodities':
      return clampScore(dxy * 0.3 + m2 * 0.25 + nl * 0.25 + cs * 0.2);
    case 'crypto':
      // Crypto behaves as high-beta global liquidity & M2 proxy
      return clampScore(nl * 0.4 + m2 * 0.3 + dxy * 0.15 + cs * 0.15);
    case 'bonds':
      // Bond ETFs (TLT/HYG) benefit from falling yields (positive y10 score) and calm spreads
      return clampScore(y10 * 0.55 + cs * 0.25 + nl * 0.1 + m2 * 0.1);
    case 'forex':
      // Non-USD pairs (e.g. EUR/USD) benefit from falling DXY (positive dxy score)
      return clampScore(dxy * 0.6 + y10 * 0.2 + nl * 0.2);
    case 'equities':
    case 'etf':
      return clampScore(nl * 0.35 + y10 * 0.25 + cs * 0.25 + dxy * 0.15);
    case 'indices':
    default:
      return clampScore(nl * 0.35 + cs * 0.3 + m2 * 0.15 + y10 * 0.1 + dxy * 0.1);
  }
}

export function runFullAssetAnalysis(
  symbolOrId: string,
  candles: Candle[],
  macro: MacroOverview | undefined,
  timeframe: Timeframe,
  elliottDegree: ElliottDegree = 'intermediate',
  explicitAssetClass?: AssetClass,
): FullAssetAnalysis {
  const symbol = resolveCanonicalSymbol(symbolOrId);
  const assetId = symbolOrId;
  const assetClass =
    explicitAssetClass ??
    DEFAULT_CATALOG_BY_SYMBOL.get(symbol)?.assetClass ??
    inferAssetClass(symbol);
  const latestPrice = candles[candles.length - 1]?.close ?? 0;
  const isIntraday = timeframe === '15m' || timeframe === '1h' || timeframe === '4h';

  const ema9 = calculateEMA(candles, 9);
  const ema21 = calculateEMA(candles, 21);
  const sma50 = calculateSMA(candles, 50);
  const sma200 = calculateSMA(candles, 200);
  const vwap = calculateVWAP(candles, isIntraday);
  const maCrosses = detectMACrosses(sma50, sma200);

  const supertrend = calculateSupertrend(candles, 10, 3);
  const bollinger = calculateBollingerBands(candles, 20, 2);
  const ichimoku = calculateIchimoku(candles);
  const rsi = calculateRSI(candles, 14);
  const rsiDivergences = detectRSIDivergences(candles, rsi, 4);
  const macd = calculateMACD(candles, 12, 26, 9);
  const adx = calculateADX(candles, 14);

  const fibonacci = computeAutoFibonacci(candles, 120);
  const elliott = analyzeElliottWaves(candles, elliottDegree);

  const lastEma21 = ema21[ema21.length - 1]?.value ?? null;
  const lastSma50 = sma50[sma50.length - 1]?.value ?? null;
  const lastSma200 = sma200[sma200.length - 1]?.value ?? null;
  const lastSt = supertrend[supertrend.length - 1] ?? null;
  const lastRsi = rsi[rsi.length - 1]?.value ?? null;
  const lastMacd = macd[macd.length - 1] ?? null;
  const lastAdx = adx[adx.length - 1] ?? null;
  const lastBb = bollinger[bollinger.length - 1] ?? null;

  // Trend score (-100..100)
  let trendRaw = 0;
  if (lastEma21 !== null) trendRaw += latestPrice > lastEma21 ? 25 : -25;
  if (lastSma50 !== null) trendRaw += latestPrice > lastSma50 ? 25 : -25;
  if (lastSma200 !== null) trendRaw += latestPrice > lastSma200 ? 25 : -25;
  if (lastSt) trendRaw += lastSt.direction === 1 ? 25 : -25;
  if (lastAdx && lastAdx.adx >= 25) {
    trendRaw *= 1.1;
  }
  const trendScore = clampScore(trendRaw);

  // Momentum score (-100..100)
  let momRaw = 0;
  if (lastRsi !== null) {
    if (lastRsi >= 55 && lastRsi <= 72) momRaw += 40;
    else if (lastRsi > 72) momRaw += 15; // strong momentum but overbought risk
    else if (lastRsi <= 45 && lastRsi >= 28) momRaw -= 40;
    else if (lastRsi < 28) momRaw -= 15; // oversold bounce risk
  }
  if (lastMacd) {
    momRaw += lastMacd.macd > lastMacd.signal ? 35 : -35;
    momRaw += lastMacd.histogram > 0 ? 15 : -15;
  }
  const latestDiv = rsiDivergences[rsiDivergences.length - 1];
  if (latestDiv && candles.length > 10 && latestDiv.time >= candles[Math.max(0, candles.length - 15)].time) {
    momRaw += latestDiv.type === 'bullish' ? 20 : -20;
  }
  const momentumScore = clampScore(momRaw);

  // ChartTech score (-100..100)
  let chartRaw = 0;
  if (elliott.primary) {
    const dir = elliott.primary.direction === 'bullish' ? 1 : -1;
    const w = elliott.primary.patternType === 'impulse' ? 50 : 30;
    chartRaw += dir * w;
  }
  if (fibonacci) {
    if (fibonacci.inGoldenPocket) {
      chartRaw += fibonacci.direction === 'uptrend' ? 35 : -35;
    } else {
      chartRaw += fibonacci.direction === 'uptrend' ? 15 : -15;
    }
  }
  const chartTechScore = clampScore(chartRaw);

  const macroRegime = macro ? evaluateMacroRegime(macro) : null;
  const macroScore = computeAssetMacroScore(symbol, assetClass, macro, macroRegime);

  const confluence = clampScore(
    trendScore * 0.35 + momentumScore * 0.2 + chartTechScore * 0.25 + macroScore * 0.2,
  );

  let bias: FullAssetAnalysis['scores']['bias'] = 'Neutral';
  if (confluence >= 45) bias = 'Stark Bullisch';
  else if (confluence >= 15) bias = 'Bullisch';
  else if (confluence <= -45) bias = 'Stark Bärisch';
  else if (confluence <= -15) bias = 'Bärisch';

  // Build Signal Events
  const signals: SignalEvent[] = [];
  const latestTime = candles[candles.length - 1]?.time ?? Math.floor(Date.now() / 1000);

  const recentFlip = supertrend.slice(-5).find((s) => s.flipped);
  if (recentFlip) {
    signals.push({
      id: `${assetId}-st-${recentFlip.time}`,
      assetId,
      time: recentFlip.time,
      title:
        recentFlip.direction === 1 ? 'Trend dreht aufwärts' : 'Trend dreht abwärts',
      detail: `Supertrend wechselt auf ${timeframe} bei ${recentFlip.value.toFixed(2)}`,
      severity: recentFlip.direction === 1 ? 'bullish' : 'bearish',
      source: 'Trend',
    });
  }

  const recentCross = maCrosses[maCrosses.length - 1];
  if (recentCross && candles.length > 25 && recentCross.time >= candles[candles.length - 25].time) {
    signals.push({
      id: `${assetId}-cross-${recentCross.time}`,
      assetId,
      time: recentCross.time,
      title: recentCross.type === 'golden_cross' ? 'Golden Cross (50/200)' : 'Death Cross (50/200)',
      detail: `Langfrist-Trend dreht ${
        recentCross.type === 'golden_cross' ? 'positiv' : 'negativ'
      } (${recentCross.price.toFixed(2)})`,
      severity: recentCross.type === 'golden_cross' ? 'bullish' : 'bearish',
      source: 'Trend',
    });
  }

  if (lastBb?.isSqueeze) {
    signals.push({
      id: `${assetId}-bbsq-${latestTime}`,
      assetId,
      time: latestTime,
      title: 'Volatilitäts-Stau (Squeeze)',
      detail: 'Starke Verengung — größere Ausbruchsbewegung bahnt sich an.',
      severity: 'warning',
      source: 'Trend',
    });
  }

  if (latestDiv && candles.length > 25 && latestDiv.time >= candles[candles.length - 25].time) {
    signals.push({
      id: `${assetId}-div-${latestDiv.time}`,
      assetId,
      time: latestDiv.time,
      title: latestDiv.type === 'bullish' ? 'Bullishe RSI-Divergenz' : 'Bärische RSI-Divergenz',
      detail:
        latestDiv.type === 'bullish'
          ? 'Verkaufsdruck lässt nach — Gegenbewegung möglich.'
          : 'Preistrend verliert an Kraft — Rücksetzer möglich.',
      severity: latestDiv.type === 'bullish' ? 'bullish' : 'bearish',
      source: 'Momentum',
    });
  }

  const recentMacd = macd.slice(-4).find((m) => m.crossover !== null);
  if (recentMacd && recentMacd.crossover) {
    signals.push({
      id: `${assetId}-macd-${recentMacd.time}`,
      assetId,
      time: recentMacd.time,
      title:
        recentMacd.crossover === 'bullish' ? 'Momentum dreht hoch' : 'Momentum dreht runter',
      detail: `Kurzfristige Dynamik (${recentMacd.crossover === 'bullish' ? 'bullish' : 'bärisch'})`,
      severity: recentMacd.crossover === 'bullish' ? 'bullish' : 'bearish',
      source: 'Momentum',
    });
  }

  if (fibonacci?.inGoldenPocket) {
    signals.push({
      id: `${assetId}-gp-${latestTime}`,
      assetId,
      time: latestTime,
      title: 'Golden-Pocket-Entscheidungszone',
      detail: `Kurs testet Schlüsselbereich ${fibonacci.goldenPocket.low.toFixed(
        2,
      )}–${fibonacci.goldenPocket.high.toFixed(2)}`,
      severity: fibonacci.direction === 'uptrend' ? 'bullish' : 'warning',
      source: 'Fibonacci',
    });
  }

  if (elliott.primary) {
    signals.push({
      id: `${assetId}-ew-${latestTime}`,
      assetId,
      time: latestTime,
      title: `Elliott: ${elliott.primary.activeWave}`,
      detail: `${elliott.primary.status} · Kipppunkt ${elliott.primary.invalidationLevel.toFixed(
        2,
      )}`,
      severity: elliott.primary.direction === 'bullish' ? 'bullish' : 'bearish',
      source: 'Elliott',
    });
  }

  return {
    assetId,
    symbol,
    assetClass,
    timeframe,
    latestPrice,
    ema9,
    ema21,
    sma50,
    sma200,
    vwap,
    maCrosses,
    supertrend,
    bollinger,
    ichimoku,
    rsi,
    rsiDivergences,
    macd,
    adx,
    fibonacci,
    elliott,
    latest: {
      ema21: lastEma21,
      sma50: lastSma50,
      sma200: lastSma200,
      supertrendDir: lastSt?.direction ?? null,
      supertrendVal: lastSt?.value ?? null,
      rsi: lastRsi,
      macdHist: lastMacd?.histogram ?? null,
      macdBullish: lastMacd ? lastMacd.macd > lastMacd.signal : false,
      adx: lastAdx?.adx ?? null,
      plusDI: lastAdx?.plusDI ?? null,
      minusDI: lastAdx?.minusDI ?? null,
      bollingerSqueeze: lastBb?.isSqueeze ?? false,
    },
    scores: {
      trend: trendScore,
      momentum: momentumScore,
      chartTech: chartTechScore,
      macro: macroScore,
      confluence,
      bias,
    },
    signals,
  };
}

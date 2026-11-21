import express from 'express';
import cors from 'cors';
import {
  isValidTickerSymbol,
  resolveCanonicalSymbol,
} from '../shared/catalog.ts';
import type {
  MacroOverview,
  MacroPoint,
  QuoteSummary,
  Timeframe,
} from '../shared/types.ts';
import { TtlCache } from './cache.ts';
import type { MacroDataProvider, MarketDataProvider } from './providers/types.ts';
import { YahooFinanceProvider } from './providers/yahooProvider.ts';
import {
  FredProvider,
  computeNetLiquiditySeries,
  computePercentile,
  findValueOnOrBefore,
  offsetIsoDateDays,
} from './providers/fredProvider.ts';

const VALID_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1d', '1w'];

function computeSimpleSma(points: MacroPoint[], period: number): number | null {
  if (points.length < period) return null;
  const slice = points.slice(-period);
  const sum = slice.reduce((acc, p) => acc + p.value, 0);
  return Number((sum / period).toFixed(4));
}

export async function buildMacroOverview(
  yahoo: MarketDataProvider,
  fred: MacroDataProvider,
): Promise<MacroOverview> {
  const [
    dxyQuote,
    dxyHistory,
    us10yQuote,
    m2Raw,
    dgs10Raw,
    t10y2yRaw,
    hyRaw,
    walclRaw,
    tgaRaw,
    rrpRaw,
    sp500History,
    goldHistory,
  ] = await Promise.all([
    yahoo.getQuote('DXY'),
    yahoo.getDailyHistory('DXY', '5y'),
    yahoo.getQuote('US10Y'),
    fred.getSeries('M2SL'),
    fred.getSeries('DGS10'),
    fred.getSeries('T10Y2Y'),
    fred.getSeries('BAMLH0A0HYM2'),
    fred.getSeries('WALCL'),
    fred.getSeries('WTREGEN'),
    fred.getSeries('RRPONTSYD'),
    yahoo.getDailyHistory('SP500', '10y'),
    yahoo.getDailyHistory('GOLD', '10y'),
  ]);

  // 1. DXY
  const sma50 = computeSimpleSma(dxyHistory, 50);
  const sma200 = computeSimpleSma(dxyHistory, 200);
  let dxyTrend: 'bullish' | 'neutral' | 'bearish' = 'neutral';
  if (sma50 !== null && sma200 !== null) {
    if (dxyQuote.price > sma50 && sma50 >= sma200) dxyTrend = 'bullish';
    else if (dxyQuote.price < sma50 && sma50 <= sma200) dxyTrend = 'bearish';
  }

  // 2. M2 Money Supply (Billions USD, Monthly)
  const m2Trimmed = m2Raw.filter((p) => p.date >= '2018-01-01');
  const m2Latest = m2Trimmed[m2Trimmed.length - 1];
  const m2PrevMonth = m2Trimmed[m2Trimmed.length - 2] ?? m2Latest;
  const m2YearAgo = m2Trimmed.length >= 13 ? m2Trimmed[m2Trimmed.length - 13] : m2Trimmed[0];
  const m2ThreeMonthsAgo = m2Trimmed.length >= 4 ? m2Trimmed[m2Trimmed.length - 4] : m2Trimmed[0];

  const yoyPercent =
    m2YearAgo.value !== 0 ? ((m2Latest.value - m2YearAgo.value) / m2YearAgo.value) * 100 : 0;
  const momPercent =
    m2PrevMonth.value !== 0 ? ((m2Latest.value - m2PrevMonth.value) / m2PrevMonth.value) * 100 : 0;
  const threeMonthAnnualizedPercent =
    m2ThreeMonthsAgo.value > 0
      ? (Math.pow(m2Latest.value / m2ThreeMonthsAgo.value, 4) - 1) * 100
      : 0;

  let m2Status: 'expanding' | 'flat' | 'contracting' = 'flat';
  if (yoyPercent >= 2 || threeMonthAnnualizedPercent >= 2.5) m2Status = 'expanding';
  else if (yoyPercent <= -0.5 || threeMonthAnnualizedPercent <= -1) m2Status = 'contracting';

  // 3. 10Y US Treasury Yield + 2s10s Spread
  const dgs10Trimmed = dgs10Raw.filter((p) => p.date >= '2020-01-01');
  const dgs10Latest = dgs10Trimmed[dgs10Trimmed.length - 1];
  const yieldPercent = us10yQuote.price > 0 ? us10yQuote.price : dgs10Latest.value;
  const dgs10WeekAgo = findValueOnOrBefore(dgs10Trimmed, offsetIsoDateDays(dgs10Latest.date, -7));
  const dgs10MonthAgo = findValueOnOrBefore(dgs10Trimmed, offsetIsoDateDays(dgs10Latest.date, -30));

  const change1dBps = Math.round(us10yQuote.change * 100);
  const change1wBps = dgs10WeekAgo ? Math.round((yieldPercent - dgs10WeekAgo.value) * 100) : 0;
  const change1mBps = dgs10MonthAgo ? Math.round((yieldPercent - dgs10MonthAgo.value) * 100) : 0;

  const spreadTrimmed = t10y2yRaw.filter((p) => p.date >= '2020-01-01');
  const latestSpread = spreadTrimmed[spreadTrimmed.length - 1] ?? null;
  const spread2s10sPercent = latestSpread ? latestSpread.value : null;
  const spread2s10sBps = spread2s10sPercent !== null ? Math.round(spread2s10sPercent * 100) : null;

  let curveStatus: 'normal' | 'flat' | 'inverted' = 'normal';
  if (spread2s10sPercent !== null) {
    if (spread2s10sPercent < 0) curveStatus = 'inverted';
    else if (spread2s10sPercent < 0.25) curveStatus = 'flat';
  }

  // 4. Credit Spreads (ICE BofA US High Yield OAS) — FRED provides %, multiply by 100 for bps
  const hyFiveYearsAgo = offsetIsoDateDays(hyRaw[hyRaw.length - 1].date, -365 * 5);
  const hyTrimmedBps = hyRaw
    .filter((p) => p.date >= hyFiveYearsAgo)
    .map((p) => ({ date: p.date, value: Math.round(p.value * 100) }));
  const hyLatest = hyTrimmedBps[hyTrimmedBps.length - 1];
  const hyWeekAgo = findValueOnOrBefore(hyTrimmedBps, offsetIsoDateDays(hyLatest.date, -7));
  const hyMonthAgo = findValueOnOrBefore(hyTrimmedBps, offsetIsoDateDays(hyLatest.date, -30));
  const percentile5y = computePercentile(
    hyTrimmedBps.map((p) => p.value),
    hyLatest.value,
  );

  let creditRegime: 'risk-on' | 'neutral' | 'stress' = 'neutral';
  if (hyLatest.value < 350) creditRegime = 'risk-on';
  else if (hyLatest.value > 500) creditRegime = 'stress';

  // 5. US Net Liquidity = WALCL/1000 - WTREGEN/1000 - RRPONTSYD (in Billions USD)
  const netLiqSeries = computeNetLiquiditySeries(walclRaw, tgaRaw, rrpRaw, '2020-01-01');
  const nlLatest = netLiqSeries[netLiqSeries.length - 1];
  const nlAsMacro: MacroPoint[] = netLiqSeries.map((p) => ({ date: p.date, value: p.netLiquidity }));
  const nl4w = findValueOnOrBefore(nlAsMacro, offsetIsoDateDays(nlLatest.date, -28));
  const nl13w = findValueOnOrBefore(nlAsMacro, offsetIsoDateDays(nlLatest.date, -91));

  const delta4wB = nl4w ? nlLatest.netLiquidity - nl4w.value : 0;
  const delta4wPercent = nl4w && nl4w.value !== 0 ? (delta4wB / nl4w.value) * 100 : 0;
  const delta13wB = nl13w ? nlLatest.netLiquidity - nl13w.value : 0;
  const delta13wPercent = nl13w && nl13w.value !== 0 ? (delta13wB / nl13w.value) * 100 : 0;

  let impulse: 'expanding' | 'neutral' | 'contracting' = 'neutral';
  if (delta4wB >= 40 || delta13wB >= 100) impulse = 'expanding';
  else if (delta4wB <= -40 || delta13wB <= -100) impulse = 'contracting';

  const sampledNetLiq = netLiqSeries.filter(
    (_, idx) => idx % 3 === 0 || idx === netLiqSeries.length - 1,
  );

  return {
    dxy: {
      quote: dxyQuote,
      history: dxyHistory,
      sma50,
      sma200,
      trend: dxyTrend,
    },
    m2: {
      latestB: Number(m2Latest.value.toFixed(1)),
      latestT: Number((m2Latest.value / 1000).toFixed(2)),
      date: m2Latest.date,
      yoyPercent: Number(yoyPercent.toFixed(2)),
      threeMonthAnnualizedPercent: Number(threeMonthAnnualizedPercent.toFixed(2)),
      momPercent: Number(momPercent.toFixed(2)),
      status: m2Status,
      history: m2Trimmed,
    },
    us10y: {
      yieldPercent: Number(yieldPercent.toFixed(3)),
      change1dBps,
      change1wBps,
      change1mBps,
      spread2s10sPercent: spread2s10sPercent !== null ? Number(spread2s10sPercent.toFixed(2)) : null,
      spread2s10sBps,
      curveStatus,
      date: dgs10Latest.date,
      history: dgs10Trimmed,
      spreadHistory: spreadTrimmed,
    },
    creditSpreads: {
      hyOasBps: hyLatest.value,
      hyOasPercent: Number((hyLatest.value / 100).toFixed(2)),
      change1wBps: hyWeekAgo ? hyLatest.value - hyWeekAgo.value : 0,
      change1mBps: hyMonthAgo ? hyLatest.value - hyMonthAgo.value : 0,
      percentile5y,
      regime: creditRegime,
      date: hyLatest.date,
      history: hyTrimmedBps,
    },
    netLiquidity: {
      currentB: Number(nlLatest.netLiquidity.toFixed(1)),
      currentT: Number((nlLatest.netLiquidity / 1000).toFixed(2)),
      fedAssetsB: Number(nlLatest.fedAssets.toFixed(1)),
      tgaB: Number(nlLatest.tga.toFixed(1)),
      rrpB: Number(nlLatest.rrp.toFixed(1)),
      delta4wB: Number(delta4wB.toFixed(1)),
      delta4wPercent: Number(delta4wPercent.toFixed(2)),
      delta13wB: Number(delta13wB.toFixed(1)),
      delta13wPercent: Number(delta13wPercent.toFixed(2)),
      impulse,
      date: nlLatest.date,
      history: sampledNetLiq,
    },
    comparisons: {
      sp500: sp500History,
      gold: goldHistory,
    },
    updatedAt: new Date().toISOString(),
  };
}

export interface CreateAppOptions {
  yahoo?: MarketDataProvider;
  fred?: MacroDataProvider;
  overviewTtlMs?: number;
}

export function createApp(options: CreateAppOptions = {}) {
  const yahoo = options.yahoo ?? new YahooFinanceProvider();
  const fred = options.fred ?? new FredProvider();
  const overviewTtlMs = options.overviewTtlMs ?? 5 * 60_000;
  const overviewCache = new TtlCache();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'dashinvest-api', timestamp: new Date().toISOString() });
  });

  app.get('/api/market/search', async (req, res) => {
    const query = String(req.query.q ?? '').trim();
    if (query.length < 1) {
      res.json({ query, results: [] });
      return;
    }
    try {
      const results = await yahoo.searchSymbols(query);
      res.json({ query, results });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Fehler bei der Wertpapiersuche',
      });
    }
  });

  app.get('/api/market/quotes', async (req, res) => {
    const rawSymbols = typeof req.query.symbols === 'string' ? req.query.symbols.trim() : '';

    if (!rawSymbols) {
      try {
        const ids = ['GOLD', 'SILVER', 'SP500', 'NASDAQ100', 'DXY', 'US10Y'];
        const quotes = await Promise.all(ids.map((id) => yahoo.getQuote(id)));
        res.json({ quotes, failed: [], updatedAt: new Date().toISOString() });
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Fehler beim Abrufen der Marktdaten',
        });
      }
      return;
    }

    const requested = Array.from(
      new Set(
        rawSymbols
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && isValidTickerSymbol(s))
          .map((s) => resolveCanonicalSymbol(s)),
      ),
    ).slice(0, 45);

    if (requested.length === 0) {
      res.status(400).json({ error: 'Keine gültigen Ticker-Symbole angegeben' });
      return;
    }

    const quotes: QuoteSummary[] = [];
    const failed: string[] = [];

    // Fetch in gentle batches of 6 so one bad ticker never fails the batch
    for (let i = 0; i < requested.length; i += 6) {
      const chunk = requested.slice(i, i + 6);
      const settled = await Promise.allSettled(chunk.map((sym) => yahoo.getQuote(sym)));
      settled.forEach((outcome, idx) => {
        if (outcome.status === 'fulfilled') {
          quotes.push(outcome.value);
        } else {
          failed.push(chunk[idx]);
        }
      });
    }

    res.json({ quotes, failed, updatedAt: new Date().toISOString() });
  });

  const handleCandlesRequest = async (
    rawInput: string,
    tfQuery: unknown,
    res: express.Response,
  ) => {
    const tfParam = (typeof tfQuery === 'string' ? tfQuery : undefined)?.toLowerCase() as
      | Timeframe
      | undefined;
    const timeframe: Timeframe = tfParam && VALID_TIMEFRAMES.includes(tfParam) ? tfParam : '1d';

    if (!rawInput || !isValidTickerSymbol(rawInput)) {
      res.status(400).json({ error: `Ungültiges Symbol: ${rawInput}` });
      return;
    }

    const symbol = resolveCanonicalSymbol(rawInput);

    try {
      const [candles, quote] = await Promise.all([
        yahoo.getCandles(symbol, timeframe),
        yahoo.getQuote(symbol),
      ]);
      res.json({ assetId: rawInput, symbol, timeframe, quote, candles });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : `Fehler beim Laden von ${symbol}`,
      });
    }
  };

  app.get('/api/market/candles', async (req, res) => {
    const symbol = String(req.query.symbol ?? '').trim();
    await handleCandlesRequest(symbol, req.query.tf, res);
  });

  app.get('/api/market/candles/:assetId', async (req, res) => {
    await handleCandlesRequest(req.params.assetId, req.query.tf, res);
  });

  app.get('/api/macro/overview', async (_req, res) => {
    try {
      const { data, stale } = await overviewCache.getOrLoad(
        'macro:overview',
        overviewTtlMs,
        () => buildMacroOverview(yahoo, fred),
      );
      res.json({ ...data, stale });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Fehler beim Abrufen der Makrodaten',
      });
    }
  });

  return app;
}

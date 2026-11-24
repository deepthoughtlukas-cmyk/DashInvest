import {
  DEFAULT_CATALOG_BY_SYMBOL,
  inferAssetClass,
  inferDecimals,
  inferUnit,
  isValidTickerSymbol,
  resolveCanonicalSymbol,
} from '../../shared/catalog.ts';
import {
  ASSET_META,
  type AssetFundamentals,
  type Candle,
  type DividendYearPoint,
  type MacroPoint,
  type QuoteSummary,
  type SymbolSearchResult,
  type Timeframe,
} from '../../shared/types.ts';
import type { MarketDataProvider } from './types.ts';
import { TtlCache } from '../cache.ts';

interface SymbolMetaConfig {
  symbol: string;
  name: string;
  shortName: string;
  currency: string;
  unit: string;
  decimals: number;
}

const SPECIAL_MACRO_META: Record<string, SymbolMetaConfig> = {
  'DX-Y.NYB': {
    symbol: 'DX-Y.NYB',
    name: 'US-Dollar-Index (DXY)',
    shortName: 'DXY',
    currency: 'USD',
    unit: 'Pkt.',
    decimals: 2,
  },
  '^TNX': {
    symbol: '^TNX',
    name: '10J US-Anleiherendite',
    shortName: 'US 10Y',
    currency: 'USD',
    unit: '%',
    decimals: 3,
  },
  '^IRX': {
    symbol: '^IRX',
    name: '3M US-Treasury Bill',
    shortName: 'US 3M',
    currency: 'USD',
    unit: '%',
    decimals: 3,
  },
};

function lookupStaticMeta(symbolOrId: string): SymbolMetaConfig {
  const canonical = resolveCanonicalSymbol(symbolOrId);
  const catalogEntry = DEFAULT_CATALOG_BY_SYMBOL.get(canonical);
  if (catalogEntry) {
    return {
      symbol: catalogEntry.symbol,
      name: catalogEntry.name,
      shortName: catalogEntry.shortName,
      currency: catalogEntry.unit === 'EUR' ? 'EUR' : 'USD',
      unit: catalogEntry.unit,
      decimals: catalogEntry.decimals,
    };
  }
  if (SPECIAL_MACRO_META[canonical]) {
    return SPECIAL_MACRO_META[canonical];
  }

  for (const legacy of Object.values(ASSET_META)) {
    if (legacy.symbol === canonical) {
      return { ...legacy, currency: 'USD' };
    }
  }

  const cls = inferAssetClass(canonical);
  return {
    symbol: canonical,
    name: canonical,
    shortName: canonical,
    currency: 'USD',
    unit: inferUnit(cls, 'USD'),
    decimals: inferDecimals(canonical, cls),
  };
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        instrumentType?: string;
        regularMarketPrice?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        currency?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string };
  };
}

interface YahooSearchResponse {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    quoteType?: string;
    exchDisp?: string;
    exchange?: string;
    isYahooFinance?: boolean;
  }>;
}

const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
];

const YAHOO_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface YahooRawVal<T = number> {
  raw?: T;
  fmt?: string;
}

export interface YahooQuoteSummaryResult {
  price?: {
    quoteType?: string;
    currency?: string;
    marketCap?: YahooRawVal | number;
    regularMarketPrice?: YahooRawVal | number;
  };
  summaryDetail?: {
    trailingPE?: YahooRawVal | number;
    forwardPE?: YahooRawVal | number;
    dividendYield?: YahooRawVal | number;
    trailingAnnualDividendYield?: YahooRawVal | number;
    yield?: YahooRawVal | number;
    dividendRate?: YahooRawVal | number;
    trailingAnnualDividendRate?: YahooRawVal | number;
    fiveYearAvgDividendYield?: YahooRawVal | number;
    payoutRatio?: YahooRawVal | number;
    exDividendDate?: YahooRawVal<number> | string;
    priceToSalesTrailing12Months?: YahooRawVal | number;
    beta?: YahooRawVal | number;
    totalAssets?: YahooRawVal | number;
    circulatingSupply?: YahooRawVal | number;
    fiftyTwoWeekHigh?: YahooRawVal | number;
    fiftyTwoWeekLow?: YahooRawVal | number;
  };
  defaultKeyStatistics?: {
    forwardPE?: YahooRawVal | number;
    priceToBook?: YahooRawVal | number;
    pegRatio?: YahooRawVal | number;
    enterpriseToEbitda?: YahooRawVal | number;
    trailingEps?: YahooRawVal | number;
    forwardEps?: YahooRawVal | number;
    earningsQuarterlyGrowth?: YahooRawVal | number;
    beta?: YahooRawVal | number;
    yield?: YahooRawVal | number;
  };
  financialData?: {
    currentPrice?: YahooRawVal | number;
    targetHighPrice?: YahooRawVal | number;
    targetLowPrice?: YahooRawVal | number;
    targetMeanPrice?: YahooRawVal | number;
    recommendationKey?: string;
    recommendationMean?: YahooRawVal | number;
    numberOfAnalystOpinions?: YahooRawVal | number;
    earningsGrowth?: YahooRawVal | number;
    revenueGrowth?: YahooRawVal | number;
    returnOnEquity?: YahooRawVal | number;
    profitMargins?: YahooRawVal | number;
    operatingMargins?: YahooRawVal | number;
    debtToEquity?: YahooRawVal | number;
    freeCashflow?: YahooRawVal | number;
  };
  recommendationTrend?: {
    trend?: Array<{
      period?: string;
      strongBuy?: number;
      buy?: number;
      hold?: number;
      sell?: number;
      strongSell?: number;
    }>;
  };
  assetProfile?: {
    sector?: string;
    industry?: string;
  };
  calendarEvents?: {
    exDividendDate?: YahooRawVal<number> | string;
    earnings?: {
      earningsDate?: Array<YahooRawVal<number> | string>;
    };
  };
  fundProfile?: {
    feesExpensesInvestment?: {
      annualReportExpenseRatio?: YahooRawVal | number;
    };
  };
}

interface YahooQuoteSummaryResponse {
  quoteSummary?: {
    result?: YahooQuoteSummaryResult[] | null;
    error?: { code?: string; description?: string } | null;
  };
}

interface YahooDividendChartResponse {
  chart?: {
    result?: Array<{
      events?: {
        dividends?: Record<string, { amount?: number; date?: number }>;
      };
    }>;
  };
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_buy: 'Starker Kauf',
  buy: 'Kauf',
  hold: 'Halten',
  underperform: 'Untergewichten',
  sell: 'Verkauf',
};

function rawNum(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object' && 'raw' in val) {
    const n = (val as YahooRawVal).raw;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return null;
}

function rawStr(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  if (val && typeof val === 'object') {
    const obj = val as YahooRawVal<number>;
    if (typeof obj.fmt === 'string' && obj.fmt.trim().length > 0) return obj.fmt.trim();
    if (typeof obj.raw === 'number' && Number.isFinite(obj.raw) && obj.raw > 0) {
      return new Date(obj.raw * 1000).toISOString().slice(0, 10);
    }
  }
  return null;
}

function scale100(val: number | null, digits = 2): number | null {
  if (val === null || !Number.isFinite(val)) return null;
  return Number((val * 100).toFixed(digits));
}

function roundTo(val: number | null, digits = 2): number | null {
  if (val === null || !Number.isFinite(val)) return null;
  return Number(val.toFixed(digits));
}

function guardPE(val: number | null): number | null {
  if (val === null || !Number.isFinite(val) || val <= 0 || val >= 1000) return null;
  return Number(val.toFixed(2));
}

export function aggregateAnnualDividends(
  events: Array<{ date: number; amount: number }>,
  nowYear = new Date().getUTCFullYear(),
): {
  annualHistory: DividendYearPoint[];
  cagr5yPercent: number | null;
  consecutiveYears: number;
} {
  const byYear = new Map<number, { amount: number; payments: number }>();

  for (const ev of events) {
    if (!Number.isFinite(ev.date) || !Number.isFinite(ev.amount) || ev.amount <= 0) continue;
    const year = new Date(ev.date * 1000).getUTCFullYear();
    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, { amount: ev.amount, payments: 1 });
    } else {
      existing.amount += ev.amount;
      existing.payments += 1;
    }
  }

  const sorted: DividendYearPoint[] = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, stats]) => ({
      year,
      amount: Number(stats.amount.toFixed(4)),
      payments: stats.payments,
    }));

  if (sorted.length === 0) {
    return { annualHistory: [], cagr5yPercent: null, consecutiveYears: 0 };
  }

  const last = sorted[sorted.length - 1];
  const prior = sorted.slice(0, -1);
  if (last.year === nowYear && prior.length > 0) {
    const expectedPayments = Math.max(...prior.slice(-3).map((y) => y.payments));
    if (last.payments < expectedPayments) {
      last.isPartial = true;
    }
  }

  let consecutiveYears = 0;
  if (last.year >= nowYear - 1) {
    consecutiveYears = 1;
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (sorted[i].year === sorted[i + 1].year - 1) {
        consecutiveYears++;
      } else {
        break;
      }
    }
  }

  const completeYears = sorted.filter((y) => !y.isPartial);
  let cagr5yPercent: number | null = null;
  if (completeYears.length >= 2) {
    const end = completeYears[completeYears.length - 1];
    const targetStartYear = end.year - 5;
    const exactStart = completeYears.find((y) => y.year === targetStartYear);
    const start =
      exactStart ?? completeYears[Math.max(0, completeYears.length - 6)];
    const span = end.year - start.year;
    if (span >= 2 && start.amount > 0 && end.amount > 0) {
      cagr5yPercent = Number(((Math.pow(end.amount / start.amount, 1 / span) - 1) * 100).toFixed(2));
    }
  }

  return { annualHistory: sorted, cagr5yPercent, consecutiveYears };
}

export function parseYahooFundamentals(
  symbol: string,
  rawSummary: YahooQuoteSummaryResult | null,
  rawDivEvents: Array<{ date: number; amount: number }>,
  nowYear = new Date().getUTCFullYear(),
): AssetFundamentals {
  const canonical = resolveCanonicalSymbol(symbol);
  const pr = rawSummary?.price;
  const sd = rawSummary?.summaryDetail;
  const ks = rawSummary?.defaultKeyStatistics;
  const fd = rawSummary?.financialData;
  const ap = rawSummary?.assetProfile;
  const cal = rawSummary?.calendarEvents;
  const fp = rawSummary?.fundProfile;

  const quoteType = pr?.quoteType?.trim() || null;
  const isEtf = quoteType === 'ETF';

  const currentPrice = rawNum(fd?.currentPrice) ?? rawNum(pr?.regularMarketPrice);
  const targetMean = roundTo(rawNum(fd?.targetMeanPrice), 2);
  const upsidePercent =
    currentPrice !== null && currentPrice > 0 && targetMean !== null
      ? Number((((targetMean - currentPrice) / currentPrice) * 100).toFixed(2))
      : null;

  const recKeyRaw = fd?.recommendationKey?.trim().toLowerCase() ?? null;
  const recKey = recKeyRaw && recKeyRaw !== 'none' ? recKeyRaw : null;
  const recLabel = recKey ? RECOMMENDATION_LABELS[recKey] ?? recKey : null;

  const trend0 =
    rawSummary?.recommendationTrend?.trend?.find((t) => t.period === '0m') ??
    rawSummary?.recommendationTrend?.trend?.[0];
  const breakdown =
    trend0 &&
    typeof trend0.strongBuy === 'number' &&
    typeof trend0.buy === 'number' &&
    typeof trend0.hold === 'number' &&
    typeof trend0.sell === 'number' &&
    typeof trend0.strongSell === 'number'
      ? {
          strongBuy: trend0.strongBuy,
          buy: trend0.buy,
          hold: trend0.hold,
          sell: trend0.sell,
          strongSell: trend0.strongSell,
        }
      : null;

  const divStats = aggregateAnnualDividends(rawDivEvents, nowYear);

  return {
    symbol: canonical,
    quoteType,
    currency: pr?.currency?.trim() || null,
    sector: ap?.sector?.trim() || null,
    industry: ap?.industry?.trim() || null,
    marketCap: rawNum(pr?.marketCap),
    totalAssets: rawNum(sd?.totalAssets),
    circulatingSupply: rawNum(sd?.circulatingSupply),
    expenseRatioPercent: scale100(rawNum(fp?.feesExpensesInvestment?.annualReportExpenseRatio), 2),
    beta: roundTo(rawNum(sd?.beta) ?? rawNum(ks?.beta), 2),
    fiftyTwoWeekLow: roundTo(rawNum(sd?.fiftyTwoWeekLow), 4),
    fiftyTwoWeekHigh: roundTo(rawNum(sd?.fiftyTwoWeekHigh), 4),
    nextEarningsDate: rawStr(cal?.earnings?.earningsDate?.[0]),
    valuation: {
      trailingPE: guardPE(rawNum(sd?.trailingPE)),
      forwardPE: isEtf ? null : guardPE(rawNum(sd?.forwardPE) ?? rawNum(ks?.forwardPE)),
      priceToBook: roundTo(rawNum(ks?.priceToBook), 2),
      priceToSales: roundTo(rawNum(sd?.priceToSalesTrailing12Months), 2),
      pegRatio: roundTo(rawNum(ks?.pegRatio), 2),
      evToEbitda: roundTo(rawNum(ks?.enterpriseToEbitda), 2),
      trailingEps: roundTo(rawNum(ks?.trailingEps), 2),
      forwardEps: roundTo(rawNum(ks?.forwardEps), 2),
    },
    growthAndQuality: {
      earningsGrowthPercent: scale100(
        rawNum(fd?.earningsGrowth) ?? rawNum(ks?.earningsQuarterlyGrowth),
        2,
      ),
      revenueGrowthPercent: scale100(rawNum(fd?.revenueGrowth), 2),
      returnOnEquityPercent: scale100(rawNum(fd?.returnOnEquity), 2),
      profitMarginPercent: scale100(rawNum(fd?.profitMargins), 2),
      operatingMarginPercent: scale100(rawNum(fd?.operatingMargins), 2),
      // Yahoo financialData.debtToEquity is already expressed in percent (e.g. 84.286)
      debtToEquityPercent: roundTo(rawNum(fd?.debtToEquity), 1),
      freeCashflow: rawNum(fd?.freeCashflow),
    },
    dividend: {
      yieldPercent: scale100(
        rawNum(sd?.dividendYield) ??
          rawNum(sd?.trailingAnnualDividendYield) ??
          rawNum(sd?.yield) ??
          rawNum(ks?.yield),
        2,
      ),
      annualRate: roundTo(
        rawNum(sd?.dividendRate) ?? rawNum(sd?.trailingAnnualDividendRate),
        4,
      ),
      payoutRatioPercent: scale100(rawNum(sd?.payoutRatio), 1),
      // Yahoo summaryDetail.fiveYearAvgDividendYield is already in percent (e.g. 0.46)
      fiveYearAvgYieldPercent: roundTo(rawNum(sd?.fiveYearAvgDividendYield), 2),
      exDividendDate: rawStr(sd?.exDividendDate) ?? rawStr(cal?.exDividendDate),
      cagr5yPercent: divStats.cagr5yPercent,
      consecutiveYears: divStats.consecutiveYears,
      annualHistory: divStats.annualHistory,
    },
    analyst: {
      recommendationKey: recKey,
      recommendationLabel: recLabel,
      recommendationMean: roundTo(rawNum(fd?.recommendationMean), 2),
      numberOfAnalysts: rawNum(fd?.numberOfAnalystOpinions),
      targetLow: roundTo(rawNum(fd?.targetLowPrice), 2),
      targetMean,
      targetHigh: roundTo(rawNum(fd?.targetHighPrice), 2),
      upsidePercent,
      breakdown,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function fetchYahooRaw(symbol: string, range: string, interval: string): Promise<YahooChartResponse> {
  const encoded = encodeURIComponent(symbol);
  let lastError: unknown;

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encoded}?range=${range}&interval=${interval}&includePrePost=false`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        throw new Error(`Yahoo HTTP ${res.status} for ${symbol}`);
      }
      const json = (await res.json()) as YahooChartResponse;
      if (json.chart?.error) {
        throw new Error(json.chart.error.description ?? `Yahoo API error for ${symbol}`);
      }
      if (!json.chart?.result?.[0]) {
        throw new Error(`Yahoo returned empty result for ${symbol}`);
      }
      return json;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed fetching Yahoo chart for ${symbol}`);
}

async function fetchYahooSearchRaw(query: string): Promise<YahooSearchResponse> {
  const encoded = encodeURIComponent(query);
  let lastError: unknown;

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v1/finance/search?q=${encoded}&quotesCount=12&newsCount=0&enableFuzzyQuery=false`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new Error(`Yahoo search HTTP ${res.status}`);
      }
      return (await res.json()) as YahooSearchResponse;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Yahoo symbol search failed');
}

export function sanitizeCandles(raw: YahooChartResponse): Candle[] {
  const result = raw.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) return [];

  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];

  const byTime = new Map<number, Candle>();

  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i];

    if (
      typeof t !== 'number' ||
      !Number.isFinite(t) ||
      typeof o !== 'number' ||
      !Number.isFinite(o) ||
      typeof h !== 'number' ||
      !Number.isFinite(h) ||
      typeof l !== 'number' ||
      !Number.isFinite(l) ||
      typeof c !== 'number' ||
      !Number.isFinite(c)
    ) {
      continue;
    }

    byTime.set(t, {
      time: t,
      open: o,
      high: Math.max(h, o, c),
      low: Math.min(l, o, c),
      close: c,
      volume: typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0,
    });
  }

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

export function aggregateFourHourCandles(hourly: Candle[]): Candle[] {
  if (hourly.length === 0) return [];
  const buckets = new Map<number, Candle>();

  for (const bar of hourly) {
    const bucketTime = Math.floor(bar.time / 14400) * 14400;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, { ...bar, time: bucketTime });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

function getTimeframeParams(tf: Timeframe): { range: string; interval: string; ttlMs: number } {
  switch (tf) {
    case '15m':
      return { range: '5d', interval: '15m', ttlMs: 30_000 };
    case '1h':
      return { range: '1mo', interval: '60m', ttlMs: 45_000 };
    case '4h':
      return { range: '6mo', interval: '60m', ttlMs: 60_000 };
    case '1d':
      return { range: '2y', interval: '1d', ttlMs: 60_000 };
    case '1w':
      return { range: '5y', interval: '1wk', ttlMs: 120_000 };
  }
}

function unixToYmd(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export class YahooFinanceProvider implements MarketDataProvider {
  readonly name = 'Yahoo Finance';
  private cache = new TtlCache();
  private session: { cookie: string; crumb: string; expiresAt: number } | null = null;
  private sessionPromise: Promise<{ cookie: string; crumb: string }> | null = null;

  private async getYahooSession(forceRefresh = false): Promise<{ cookie: string; crumb: string }> {
    const now = Date.now();
    if (!forceRefresh && this.session && now < this.session.expiresAt) {
      return { cookie: this.session.cookie, crumb: this.session.crumb };
    }
    if (!forceRefresh && this.sessionPromise) {
      return this.sessionPromise;
    }

    const loader = (async () => {
      const cRes = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': YAHOO_USER_AGENT },
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
      const setCookies =
        typeof cRes.headers.getSetCookie === 'function'
          ? cRes.headers.getSetCookie()
          : [cRes.headers.get('set-cookie')].filter((v): v is string => Boolean(v));
      const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
      if (!cookie) {
        throw new Error('Yahoo session cookie unavailable');
      }

      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': YAHOO_USER_AGENT, Cookie: cookie },
        signal: AbortSignal.timeout(8000),
      });
      if (!crumbRes.ok) {
        throw new Error(`Yahoo crumb HTTP ${crumbRes.status}`);
      }
      const crumb = (await crumbRes.text()).trim();
      if (!crumb || crumb.startsWith('<')) {
        throw new Error('Yahoo crumb invalid');
      }

      this.session = { cookie, crumb, expiresAt: Date.now() + 30 * 60_000 };
      return { cookie, crumb };
    })().finally(() => {
      this.sessionPromise = null;
    });

    this.sessionPromise = loader;
    return loader;
  }

  private async fetchYahooQuoteSummary(symbol: string): Promise<YahooQuoteSummaryResult | null> {
    const encoded = encodeURIComponent(symbol);
    const modules =
      'price,summaryDetail,defaultKeyStatistics,financialData,recommendationTrend,assetProfile,calendarEvents,fundProfile';

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = await this.getYahooSession(attempt > 0);
      for (const host of YAHOO_HOSTS) {
        try {
          const url = `${host}/v10/finance/quoteSummary/${encoded}?modules=${modules}&crumb=${encodeURIComponent(session.crumb)}`;
          const res = await fetch(url, {
            headers: {
              'User-Agent': YAHOO_USER_AGENT,
              Cookie: session.cookie,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(12000),
          });

          if (res.status === 401 || res.status === 403) {
            lastError = new Error(`Yahoo auth HTTP ${res.status}`);
            break; // break inner host loop to forceRefresh session once
          }

          if (res.status === 404) {
            return null;
          }

          if (!res.ok) {
            throw new Error(`Yahoo quoteSummary HTTP ${res.status} for ${symbol}`);
          }

          const json = (await res.json()) as YahooQuoteSummaryResponse;
          if (json.quoteSummary?.error) {
            if (json.quoteSummary.error.code === 'Not Found') return null;
            throw new Error(json.quoteSummary.error.description ?? 'Yahoo quoteSummary error');
          }
          return json.quoteSummary?.result?.[0] ?? null;
        } catch (err) {
          lastError = err;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed fetching Yahoo fundamentals for ${symbol}`);
  }

  private async fetchYahooDividendEvents(
    symbol: string,
  ): Promise<Array<{ date: number; amount: number }>> {
    const encoded = encodeURIComponent(symbol);
    for (const host of YAHOO_HOSTS) {
      try {
        const url = `${host}/v8/finance/chart/${encoded}?range=10y&interval=1mo&events=div`;
        const res = await fetch(url, {
          headers: { 'User-Agent': YAHOO_USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as YahooDividendChartResponse;
        const divs = json.chart?.result?.[0]?.events?.dividends;
        if (!divs) return [];
        return Object.values(divs)
          .filter(
            (d): d is { date: number; amount: number } =>
              typeof d.date === 'number' && typeof d.amount === 'number',
          )
          .sort((a, b) => a.date - b.date);
      } catch {
        // try next host
      }
    }
    return [];
  }

  async getFundamentals(symbolOrId: string): Promise<AssetFundamentals> {
    const canonical = resolveCanonicalSymbol(symbolOrId);
    const cacheKey = `yf:fundamentals:${canonical}`;

    const { data, stale } = await this.cache.getOrLoad(cacheKey, 15 * 60_000, async () => {
      const [summaryRes, divsRes] = await Promise.allSettled([
        this.fetchYahooQuoteSummary(canonical),
        this.fetchYahooDividendEvents(canonical),
      ]);

      if (summaryRes.status === 'rejected') {
        throw summaryRes.reason;
      }

      const divs = divsRes.status === 'fulfilled' ? divsRes.value : [];
      return parseYahooFundamentals(canonical, summaryRes.value, divs);
    });

    return { ...data, stale };
  }

  async getCandles(symbolOrId: string, timeframe: Timeframe): Promise<Candle[]> {
    const canonical = resolveCanonicalSymbol(symbolOrId);
    const { range, interval, ttlMs } = getTimeframeParams(timeframe);
    const cacheKey = `yf:candles:${canonical}:${timeframe}`;

    const { data } = await this.cache.getOrLoad(cacheKey, ttlMs, async () => {
      const raw = await fetchYahooRaw(canonical, range, interval);
      const cleaned = sanitizeCandles(raw);
      return timeframe === '4h' ? aggregateFourHourCandles(cleaned) : cleaned;
    });

    return data;
  }

  async getQuote(symbolOrId: string): Promise<QuoteSummary> {
    const cfg = lookupStaticMeta(symbolOrId);
    const cacheKey = `yf:quote:${cfg.symbol}`;

    const { data } = await this.cache.getOrLoad(cacheKey, 45_000, async () => {
      const raw = await fetchYahooRaw(cfg.symbol, '1y', '1d');
      const daily = sanitizeCandles(raw);
      const meta = raw.chart?.result?.[0]?.meta;

      const latestBar = daily[daily.length - 1];
      const prevBar = daily.length >= 2 ? daily[daily.length - 2] : latestBar;

      const price =
        typeof meta?.regularMarketPrice === 'number' && Number.isFinite(meta.regularMarketPrice)
          ? meta.regularMarketPrice
          : latestBar?.close ?? 0;

      const prevClose = prevBar?.close ?? price;
      const change = price - prevClose;
      const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

      const dayHigh =
        typeof meta?.regularMarketDayHigh === 'number' && Number.isFinite(meta.regularMarketDayHigh)
          ? meta.regularMarketDayHigh
          : latestBar?.high ?? price;
      const dayLow =
        typeof meta?.regularMarketDayLow === 'number' && Number.isFinite(meta.regularMarketDayLow)
          ? meta.regularMarketDayLow
          : latestBar?.low ?? price;

      const highs = daily.slice(-252).map((b) => b.high);
      const lows = daily.slice(-252).map((b) => b.low);
      const fiftyTwoWeekHigh =
        typeof meta?.fiftyTwoWeekHigh === 'number' && Number.isFinite(meta.fiftyTwoWeekHigh)
          ? meta.fiftyTwoWeekHigh
          : highs.length > 0
            ? Math.max(...highs)
            : price;
      const fiftyTwoWeekLow =
        typeof meta?.fiftyTwoWeekLow === 'number' && Number.isFinite(meta.fiftyTwoWeekLow)
          ? meta.fiftyTwoWeekLow
          : lows.length > 0
            ? Math.min(...lows)
            : price;

      const weekAgoBar = daily.length >= 6 ? daily[daily.length - 6] : daily[0];
      const weekChangePercent =
        weekAgoBar && weekAgoBar.close !== 0
          ? ((price - weekAgoBar.close) / weekAgoBar.close) * 100
          : 0;

      const currentYear = new Date().getUTCFullYear().toString();
      const firstBarPrevOrCurrentYear =
        daily.find((b) => unixToYmd(b.time).startsWith(currentYear)) ?? daily[0];
      const ytdBaseIdx = daily.indexOf(firstBarPrevOrCurrentYear);
      const ytdRef = ytdBaseIdx > 0 ? daily[ytdBaseIdx - 1] : firstBarPrevOrCurrentYear;
      const ytdChangePercent =
        ytdRef && ytdRef.close !== 0 ? ((price - ytdRef.close) / ytdRef.close) * 100 : 0;

      const resolvedName =
        cfg.name !== cfg.symbol
          ? cfg.name
          : meta?.longName || meta?.shortName || cfg.symbol;
      const resolvedShort =
        cfg.shortName !== cfg.symbol
          ? cfg.shortName
          : (meta?.shortName || cfg.symbol).slice(0, 22);
      const currency = meta?.currency ?? cfg.currency;

      return {
        id: cfg.symbol,
        symbol: cfg.symbol,
        name: resolvedName,
        shortName: resolvedShort,
        price,
        change,
        changePercent,
        prevClose,
        dayHigh,
        dayLow,
        fiftyTwoWeekHigh,
        fiftyTwoWeekLow,
        currency,
        unit: cfg.unit === 'USD' && currency ? currency : cfg.unit,
        decimals: cfg.decimals,
        updatedAt: new Date().toISOString(),
        weekChangePercent,
        ytdChangePercent,
      } satisfies QuoteSummary;
    });

    return data;
  }

  async getDailyHistory(symbolOrId: string, range = '5y'): Promise<MacroPoint[]> {
    const canonical = resolveCanonicalSymbol(symbolOrId);
    const cacheKey = `yf:daily:${canonical}:${range}`;

    const { data } = await this.cache.getOrLoad(cacheKey, 180_000, async () => {
      const raw = await fetchYahooRaw(canonical, range, '1d');
      const candles = sanitizeCandles(raw);
      const map = new Map<string, number>();
      for (const bar of candles) {
        map.set(unixToYmd(bar.time), bar.close);
      }
      return Array.from(map.entries())
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));
    });

    return data;
  }

  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 1) return [];
    const cacheKey = `yf:search:${trimmed.toLowerCase()}`;

    const { data } = await this.cache.getOrLoad(cacheKey, 5 * 60_000, async () => {
      const raw = await fetchYahooSearchRaw(trimmed);
      const allowedTypes = new Set([
        'EQUITY',
        'ETF',
        'INDEX',
        'FUTURE',
        'CRYPTOCURRENCY',
        'CURRENCY',
      ]);

      const results: SymbolSearchResult[] = [];
      const seen = new Set<string>();

      for (const q of raw.quotes ?? []) {
        const symbol = (q.symbol ?? '').trim().toUpperCase();
        if (!symbol || seen.has(symbol) || !isValidTickerSymbol(symbol)) continue;
        const qt = (q.quoteType ?? '').toUpperCase();
        if (qt && !allowedTypes.has(qt)) continue;

        seen.add(symbol);
        const assetClass = inferAssetClass(symbol, qt);
        const decimals = inferDecimals(symbol, assetClass);
        const unit = inferUnit(assetClass, 'USD');
        const fullName = (q.longname || q.shortname || symbol).trim();
        const shortName = (q.shortname || q.longname || symbol).trim().slice(0, 24);

        results.push({
          symbol,
          name: fullName,
          shortName,
          quoteType: qt || 'EQUITY',
          exchange: (q.exchDisp || q.exchange || '').trim(),
          assetClass,
          decimals,
          unit,
        });
      }

      return results;
    });

    return data;
  }
}

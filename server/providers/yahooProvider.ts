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
  type Candle,
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

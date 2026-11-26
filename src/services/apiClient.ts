import {
  DEFAULT_CATALOG_ASSETS,
  isValidTickerSymbol,
  resolveCanonicalSymbol,
} from '../../shared/catalog.ts';
import type {
  AssetCandlesResponse,
  AssetFundamentals,
  MacroOverview,
  QuoteSummary,
  SymbolSearchResult,
  Timeframe,
} from '../../shared/types.ts';

export interface LocalPattyWorkspaceResponse {
  found: boolean;
  filename?: string;
  folderLabel?: string;
  updatedAt?: string;
  encrypted?: boolean;
  sanitized?: boolean;
  content?: string;
}

function createConcurrencyLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  };
}

const limitBookmarkCandleFetch = createConcurrencyLimiter(5);

async function fetchJsonStrict<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) msg = errBody.error;
    } catch {
      // ignore non-json
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export async function fetchQuotesApi(
  symbols?: string[],
): Promise<{ quotes: QuoteSummary[]; failed?: string[]; updatedAt: string }> {
  const normalized = symbols
    ? Array.from(new Set(symbols.map((s) => resolveCanonicalSymbol(s)))).slice(0, 250)
    : [];

  if (symbols) {
    if (normalized.length === 0) {
      return { quotes: [], failed: [], updatedAt: new Date().toISOString() };
    }
    const CHUNK_SIZE = 40;
    const chunks: string[][] = [];
    for (let i = 0; i < normalized.length; i += CHUNK_SIZE) {
      chunks.push(normalized.slice(i, i + CHUNK_SIZE));
    }

    const allQuotes: QuoteSummary[] = [];
    const allFailed: string[] = [];
    let latestUpdatedAt = new Date().toISOString();

    for (let i = 0; i < chunks.length; i += 2) {
      const pair = chunks.slice(i, i + 2);
      const responses = await Promise.all(
        pair.map((chunk) =>
          fetchJsonStrict<{ quotes: QuoteSummary[]; failed?: string[]; updatedAt: string }>(
            `/api/market/quotes?symbols=${encodeURIComponent(chunk.join(','))}`,
          ),
        ),
      );
      for (const r of responses) {
        allQuotes.push(...r.quotes);
        if (r.failed) allFailed.push(...r.failed);
        if (r.updatedAt) latestUpdatedAt = r.updatedAt;
      }
    }

    return { quotes: allQuotes, failed: allFailed, updatedAt: latestUpdatedAt };
  }
  return fetchJsonStrict<{ quotes: QuoteSummary[]; failed?: string[]; updatedAt: string }>(
    '/api/market/quotes',
  );
}

export async function fetchBookmarkDailyCandlesApi(symbol: string): Promise<AssetCandlesResponse> {
  return limitBookmarkCandleFetch(() => fetchAssetCandlesApi(symbol, '1d'));
}

export async function fetchLocalPattyWorkspaceApi(options?: {
  includeCostBasis?: boolean;
}): Promise<LocalPattyWorkspaceResponse> {
  try {
    const query = options?.includeCostBasis ? '?includeCostBasis=1' : '';
    return await fetchJsonStrict<LocalPattyWorkspaceResponse>(
      `/api/patty/local-workspace${query}`,
    );
  } catch {
    return { found: false };
  }
}

export function searchCatalogOffline(query: string): SymbolSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return DEFAULT_CATALOG_ASSETS.filter(
    (a) =>
      a.symbol.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.shortName.toLowerCase().includes(q),
  )
    .slice(0, 12)
    .map((a) => ({
      symbol: a.symbol,
      name: a.name,
      shortName: a.shortName,
      quoteType:
        a.assetClass === 'crypto'
          ? 'CRYPTOCURRENCY'
          : a.assetClass === 'etf'
            ? 'ETF'
            : a.assetClass === 'indices'
              ? 'INDEX'
              : a.assetClass === 'forex'
                ? 'CURRENCY'
                : 'EQUITY',
      exchange: a.exchange ?? '',
      assetClass: a.assetClass,
      decimals: a.decimals,
      unit: a.unit,
    }));
}

export async function fetchSymbolSearchApi(
  query: string,
): Promise<{ query: string; results: SymbolSearchResult[] }> {
  const trimmed = query.trim();
  return fetchJsonStrict<{ query: string; results: SymbolSearchResult[] }>(
    `/api/market/search?q=${encodeURIComponent(trimmed)}`,
  );
}

export async function fetchMacroOverviewApi(): Promise<MacroOverview> {
  return fetchJsonStrict<MacroOverview>('/api/macro/overview');
}

export async function fetchAssetCandlesApi(
  symbolOrId: string,
  timeframe: Timeframe,
): Promise<AssetCandlesResponse> {
  const symbol = resolveCanonicalSymbol(symbolOrId);
  return fetchJsonStrict<AssetCandlesResponse>(
    `/api/market/candles?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`,
  );
}

export async function fetchAssetFundamentalsApi(
  symbolOrId: string,
): Promise<AssetFundamentals> {
  const symbol = resolveCanonicalSymbol(symbolOrId);
  if (!isValidTickerSymbol(symbol)) {
    throw new Error(`Ungültiges Symbol: ${symbol}`);
  }
  return fetchJsonStrict<AssetFundamentals>(
    `/api/market/fundamentals?symbol=${encodeURIComponent(symbol)}`,
  );
}

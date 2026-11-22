import { isValidTickerSymbol, resolveCanonicalSymbol } from '../shared/catalog.ts';
import type { QuoteSummary, Timeframe } from '../shared/types.ts';
import { TtlCache } from '../server/cache.ts';
import { buildMacroOverview } from '../server/macroOverview.ts';
import { FredProvider } from '../server/providers/fredProvider.ts';
import type { MacroDataProvider, MarketDataProvider } from '../server/providers/types.ts';
import { YahooFinanceProvider } from '../server/providers/yahooProvider.ts';

export interface WorkerEnv {
  ALLOWED_ORIGINS?: string;
  FRED_API_KEY?: string;
}

const VALID_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1d', '1w'];

const defaultYahoo = new YahooFinanceProvider();
const defaultOverviewCache = new TtlCache();

function buildCorsHeaders(request: Request, env?: WorkerEnv): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowedRaw = (env?.ALLOWED_ORIGINS ?? '').trim();

  let allowOrigin = '*';
  if (allowedRaw && allowedRaw !== '*') {
    const allowedList = allowedRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (origin && allowedList.includes(origin)) {
      allowOrigin = origin;
    } else if (allowedList.length > 0) {
      allowOrigin = allowedList[0];
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  cacheControl?: string,
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders,
  };
  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export async function handleWorkerRequest(
  request: Request,
  env?: WorkerEnv,
  deps?: {
    yahoo?: MarketDataProvider;
    fred?: MacroDataProvider;
    overviewCache?: TtlCache;
  },
): Promise<Response> {
  const cors = buildCorsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, cors);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  const yahoo = deps?.yahoo ?? defaultYahoo;
  const fred = deps?.fred ?? new FredProvider(env?.FRED_API_KEY);
  const overviewCache = deps?.overviewCache ?? defaultOverviewCache;

  if (path === '/api/health') {
    return jsonResponse(
      { ok: true, service: 'dashinvest-worker', timestamp: new Date().toISOString() },
      200,
      cors,
    );
  }

  if (path === '/api/market/search') {
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query.length < 1) {
      return jsonResponse({ query, results: [] }, 200, cors);
    }
    try {
      const results = await yahoo.searchSymbols(query);
      return jsonResponse(
        { query, results },
        200,
        cors,
        'public, max-age=180, s-maxage=300',
      );
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Fehler bei der Wertpapiersuche' },
        502,
        cors,
      );
    }
  }

  if (path === '/api/market/quotes') {
    const rawSymbols = (url.searchParams.get('symbols') ?? '').trim();
    if (!rawSymbols) {
      try {
        const ids = ['GOLD', 'SILVER', 'SP500', 'NASDAQ100', 'DXY', 'US10Y'];
        const quotes = await Promise.all(ids.map((id) => yahoo.getQuote(id)));
        return jsonResponse(
          { quotes, failed: [], updatedAt: new Date().toISOString() },
          200,
          cors,
          'public, max-age=30, s-maxage=45',
        );
      } catch (err) {
        return jsonResponse(
          { error: err instanceof Error ? err.message : 'Fehler beim Abrufen der Marktdaten' },
          502,
          cors,
        );
      }
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
      return jsonResponse({ error: 'Keine gültigen Ticker-Symbole angegeben' }, 400, cors);
    }

    const quotes: QuoteSummary[] = [];
    const failed: string[] = [];

    for (let i = 0; i < requested.length; i += 6) {
      const chunk = requested.slice(i, i + 6);
      const settled = await Promise.allSettled(chunk.map((sym) => yahoo.getQuote(sym)));
      settled.forEach((outcome, idx) => {
        if (outcome.status === 'fulfilled') quotes.push(outcome.value);
        else failed.push(chunk[idx]);
      });
    }

    return jsonResponse(
      { quotes, failed, updatedAt: new Date().toISOString() },
      200,
      cors,
      'public, max-age=30, s-maxage=45',
    );
  }

  if (path === '/api/market/candles' || path.startsWith('/api/market/candles/')) {
    const rawInput =
      path === '/api/market/candles'
        ? (url.searchParams.get('symbol') ?? '').trim()
        : decodeURIComponent(path.slice('/api/market/candles/'.length)).trim();

    if (!rawInput || !isValidTickerSymbol(rawInput)) {
      return jsonResponse({ error: `Ungültiges Symbol: ${rawInput}` }, 400, cors);
    }

    const tfRaw = (url.searchParams.get('tf') ?? '').toLowerCase() as Timeframe;
    const timeframe: Timeframe = VALID_TIMEFRAMES.includes(tfRaw) ? tfRaw : '1d';
    const symbol = resolveCanonicalSymbol(rawInput);

    try {
      const [candles, quote] = await Promise.all([
        yahoo.getCandles(symbol, timeframe),
        yahoo.getQuote(symbol),
      ]);
      return jsonResponse(
        { assetId: rawInput, symbol, timeframe, quote, candles },
        200,
        cors,
        'public, max-age=30, s-maxage=60',
      );
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : `Fehler beim Laden von ${symbol}` },
        502,
        cors,
      );
    }
  }

  if (path === '/api/market/fundamentals') {
    const rawSymbol = (url.searchParams.get('symbol') ?? '').trim();
    if (!rawSymbol || !isValidTickerSymbol(rawSymbol)) {
      return jsonResponse({ error: `Ungültiges Symbol: ${rawSymbol}` }, 400, cors);
    }
    const symbol = resolveCanonicalSymbol(rawSymbol);
    try {
      const fundamentals = await yahoo.getFundamentals(symbol);
      return jsonResponse(
        fundamentals,
        200,
        cors,
        'public, max-age=300, s-maxage=900',
      );
    } catch (err) {
      return jsonResponse(
        {
          error:
            err instanceof Error
              ? err.message
              : `Fehler beim Laden der Fundamentaldaten für ${symbol}`,
        },
        502,
        cors,
      );
    }
  }

  if (path === '/api/macro/overview') {
    try {
      const { data, stale } = await overviewCache.getOrLoad(
        'macro:overview',
        5 * 60_000,
        () => buildMacroOverview(yahoo, fred),
      );
      return jsonResponse(
        { ...data, stale },
        200,
        cors,
        'public, max-age=120, s-maxage=300',
      );
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Fehler beim Abrufen der Makrodaten' },
        502,
        cors,
      );
    }
  }

  return jsonResponse({ error: 'Not found' }, 404, cors);
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleWorkerRequest(request, env);
  },
};

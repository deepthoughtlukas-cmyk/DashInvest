import { describe, expect, it } from 'vitest';
import type {
  AssetFundamentals,
  Candle,
  MacroPoint,
  QuoteSummary,
  SymbolSearchResult,
  Timeframe,
} from '../shared/types.ts';
import { TtlCache } from '../server/cache.ts';
import type { MacroDataProvider, MarketDataProvider } from '../server/providers/types.ts';
import { handleWorkerRequest } from '../worker/index.ts';

function mockQuote(symbol: string, price: number): QuoteSummary {
  return {
    id: symbol,
    symbol,
    name: `Mock ${symbol}`,
    shortName: symbol,
    price,
    change: 1,
    changePercent: 0.5,
    prevClose: price - 1,
    dayHigh: price + 2,
    dayLow: price - 2,
    fiftyTwoWeekHigh: price + 30,
    fiftyTwoWeekLow: price - 30,
    currency: 'USD',
    unit: 'USD',
    decimals: 2,
    updatedAt: '2026-11-22T15:00:00Z',
  };
}

function buildDailySeries(startVal: number, step: number, count = 230): MacroPoint[] {
  const start = new Date('2025-11-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(start);
    dt.setUTCDate(dt.getUTCDate() + i);
    return {
      date: dt.toISOString().slice(0, 10),
      value: Number((startVal + i * step).toFixed(3)),
    };
  });
}

describe('Cloudflare Worker API Proxy (handleWorkerRequest)', () => {
  const mockYahoo: MarketDataProvider = {
    name: 'MockYahoo',
    async getQuote(symbolOrId: string) {
      if (symbolOrId === 'FAIL-SYM') throw new Error('Not found');
      return mockQuote(symbolOrId, symbolOrId === 'US10Y' || symbolOrId === '^TNX' ? 4.35 : 150);
    },
    async getCandles(): Promise<Candle[]> {
      return [
        { time: 1_700_000_000, open: 100, high: 105, low: 98, close: 103, volume: 1200 },
        { time: 1_700_086_400, open: 103, high: 108, low: 101, close: 107, volume: 1400 },
      ];
    },
    async getDailyHistory(sym: string) {
      return buildDailySeries(sym === 'DXY' || sym === 'DX-Y.NYB' ? 104 : 6000, 1, 220);
    },
    async searchSymbols(q: string): Promise<SymbolSearchResult[]> {
      return [
        {
          symbol: q.toUpperCase(),
          name: `${q} Corp`,
          shortName: q.toUpperCase(),
          quoteType: 'EQUITY',
          exchange: 'NASDAQ',
          assetClass: 'equities',
          decimals: 2,
          unit: 'USD',
        },
      ];
    },
    async getFundamentals(symbolOrId: string): Promise<AssetFundamentals> {
      return {
        symbol: symbolOrId,
        quoteType: 'EQUITY',
        currency: 'USD',
        sector: 'Technology',
        industry: 'Software',
        marketCap: 2e12,
        totalAssets: null,
        circulatingSupply: null,
        expenseRatioPercent: null,
        beta: 1.1,
        fiftyTwoWeekLow: 100,
        fiftyTwoWeekHigh: 200,
        nextEarningsDate: '2027-01-20',
        valuation: {
          trailingPE: 25,
          forwardPE: 21,
          priceToBook: 8,
          priceToSales: 10,
          pegRatio: 1.5,
          evToEbitda: 18,
          trailingEps: 6,
          forwardEps: 7.2,
        },
        growthAndQuality: {
          earningsGrowthPercent: 18,
          revenueGrowthPercent: 14,
          returnOnEquityPercent: 40,
          profitMarginPercent: 30,
          operatingMarginPercent: 34,
          debtToEquityPercent: 35,
          freeCashflow: 8e10,
        },
        dividend: {
          yieldPercent: 0.75,
          annualRate: 1.5,
          payoutRatioPercent: 20,
          fiveYearAvgYieldPercent: 0.8,
          exDividendDate: '2026-11-15',
          cagr5yPercent: 9.5,
          consecutiveYears: 5,
          annualHistory: [{ year: 2025, amount: 1.5, payments: 4 }],
        },
        analyst: {
          recommendationKey: 'buy',
          recommendationLabel: 'Kauf',
          recommendationMean: 1.8,
          numberOfAnalysts: 30,
          targetLow: 140,
          targetMean: 180,
          targetHigh: 210,
          upsidePercent: 20,
          breakdown: { strongBuy: 10, buy: 15, hold: 4, sell: 1, strongSell: 0 },
        },
        updatedAt: '2026-11-22T15:00:00Z',
      };
    },
  };

  const mockFred: MacroDataProvider = {
    name: 'MockFred',
    async getSeries(id: string) {
      if (id === 'M2SL') {
        return Array.from({ length: 16 }, (_, i) => ({
          date: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`,
          value: 22000 + i * 80,
        }));
      }
      if (id === 'DGS3MO') return buildDailySeries(4.15, 0.002, 120);
      if (id === 'T10Y3M') return buildDailySeries(0.5, 0.001, 120);
      if (id === 'BAMLH0A0HYM2') return buildDailySeries(3.5, -0.002, 120);
      if (id === 'WALCL') return buildDailySeries(6_800_000, 1000, 60);
      if (id === 'WTREGEN') return buildDailySeries(800_000, -500, 60);
      if (id === 'RRPONTSYD') return buildDailySeries(40, -0.3, 60);
      return buildDailySeries(4.3, -0.001, 120);
    },
  };

  const env = {
    ALLOWED_ORIGINS: 'https://deepthoughtlukas-cmyk.github.io,http://localhost:5173',
  };

  it('handles CORS preflight and serves /api/health', async () => {
    const preflight = await handleWorkerRequest(
      new Request('https://worker.example/api/health', {
        method: 'OPTIONS',
        headers: { Origin: 'https://deepthoughtlukas-cmyk.github.io' },
      }),
      env,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://deepthoughtlukas-cmyk.github.io',
    );

    const health = await handleWorkerRequest(
      new Request('https://worker.example/api/health', {
        headers: { Origin: 'https://deepthoughtlukas-cmyk.github.io' },
      }),
      env,
    );
    expect(health.status).toBe(200);
    const body = (await health.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('dashinvest-worker');
  });

  it('serves quotes, candles, search, fundamentals and macro overview with caching & validation', async () => {
    const deps = { yahoo: mockYahoo, fred: mockFred, overviewCache: new TtlCache() };

    const qRes = await handleWorkerRequest(
      new Request('https://worker.example/api/market/quotes?symbols=AAPL,FAIL-SYM'),
      env,
      deps,
    );
    expect(qRes.status).toBe(200);
    const qJson = (await qRes.json()) as { quotes: QuoteSummary[]; failed: string[] };
    expect(qJson.quotes.map((q) => q.symbol)).toEqual(['AAPL']);
    expect(qJson.failed).toEqual(['FAIL-SYM']);

    const cRes = await handleWorkerRequest(
      new Request('https://worker.example/api/market/candles?symbol=AAPL&tf=1d'),
      env,
      deps,
    );
    expect(cRes.status).toBe(200);
    const cJson = (await cRes.json()) as { symbol: string; candles: Candle[]; timeframe: Timeframe };
    expect(cJson.symbol).toBe('AAPL');
    expect(cJson.candles).toHaveLength(2);

    const sRes = await handleWorkerRequest(
      new Request('https://worker.example/api/market/search?q=NVDA'),
      env,
      deps,
    );
    expect(sRes.status).toBe(200);

    const fRes = await handleWorkerRequest(
      new Request('https://worker.example/api/market/fundamentals?symbol=AAPL'),
      env,
      deps,
    );
    expect(fRes.status).toBe(200);
    const fJson = (await fRes.json()) as AssetFundamentals;
    expect(fJson.valuation.trailingPE).toBe(25);

    const mRes = await handleWorkerRequest(
      new Request('https://worker.example/api/macro/overview'),
      env,
      deps,
    );
    expect(mRes.status).toBe(200);
    const mJson = (await mRes.json()) as {
      us3m?: { yieldPercent: number; momentum: { status: string } };
    };
    expect(mJson.us3m?.yieldPercent).toBeGreaterThan(4.0);
    expect(mJson.us3m?.momentum.status).toBeTruthy();

    const badRes = await handleWorkerRequest(
      new Request('https://worker.example/api/market/candles?symbol=BAD%20SYM!'),
      env,
      deps,
    );
    expect(badRes.status).toBe(400);

    const notFound = await handleWorkerRequest(
      new Request('https://worker.example/api/unknown'),
      env,
      deps,
    );
    expect(notFound.status).toBe(404);
  });
});

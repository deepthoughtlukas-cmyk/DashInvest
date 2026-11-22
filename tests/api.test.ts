import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AssetFundamentals,
  Candle,
  MacroPoint,
  QuoteSummary,
  SymbolSearchResult,
  Timeframe,
} from '../shared/types.ts';
import type { MacroDataProvider, MarketDataProvider } from '../server/providers/types.ts';
import { createApp } from '../server/app.ts';

function buildMockQuote(id: string, price: number): QuoteSummary {
  return {
    id,
    symbol: id,
    name: `Mock ${id}`,
    shortName: id,
    price,
    change: 1.5,
    changePercent: 1.2,
    prevClose: price - 1.5,
    dayHigh: price + 2,
    dayLow: price - 2,
    fiftyTwoWeekHigh: price + 50,
    fiftyTwoWeekLow: price - 50,
    currency: 'USD',
    unit: 'USD',
    decimals: 2,
    updatedAt: '2026-11-21T20:00:00Z',
  };
}

function buildMockCandles(count = 40): Candle[] {
  return Array.from({ length: count }, (_, idx) => ({
    time: 1_700_000_000 + idx * 86400,
    open: 3400 + idx,
    high: 3415 + idx,
    low: 3390 + idx,
    close: 3405 + idx,
    volume: 1000 + idx,
  }));
}

function buildDailySeries(startValue: number, step: number, count = 260): MacroPoint[] {
  const start = new Date('2025-11-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(start);
    dt.setUTCDate(dt.getUTCDate() + i);
    return {
      date: dt.toISOString().slice(0, 10),
      value: Number((startValue + i * step).toFixed(3)),
    };
  });
}

describe('Express API Integration (/api/*)', () => {
  let server: http.Server;
  let baseUrl = '';
  let shouldFailMacro = false;

  const mockYahoo: MarketDataProvider = {
    name: 'MockYahoo',
    async getQuote(symbolOrId: string) {
      if (symbolOrId === 'FAIL-SYM') {
        throw new Error('Upstream symbol not found');
      }
      if (symbolOrId === 'US10Y' || symbolOrId === '^TNX') return buildMockQuote(symbolOrId, 4.45);
      if (symbolOrId === 'DXY' || symbolOrId === 'DX-Y.NYB') {
        return buildMockQuote(symbolOrId, 103.2);
      }
      if (symbolOrId === 'NVDA') return buildMockQuote('NVDA', 125.5);
      return buildMockQuote(symbolOrId, 3500);
    },
    async getCandles(_symbolOrId: string, _tf: Timeframe) {
      return buildMockCandles(50);
    },
    async getDailyHistory(symbolOrId: string) {
      if (symbolOrId === 'DXY' || symbolOrId === 'DX-Y.NYB') {
        return buildDailySeries(105, -0.01, 220);
      }
      if (symbolOrId === 'SP500' || symbolOrId === '^GSPC') {
        return buildDailySeries(6200, 3, 220);
      }
      return buildDailySeries(3100, 2, 220);
    },
    async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
      if (query.toLowerCase().includes('nvidia')) {
        return [
          {
            symbol: 'NVDA',
            name: 'NVIDIA Corporation',
            shortName: 'NVIDIA',
            quoteType: 'EQUITY',
            exchange: 'NASDAQ',
            assetClass: 'equities',
            decimals: 2,
            unit: 'USD',
          },
        ];
      }
      return [];
    },
    async getFundamentals(symbolOrId: string): Promise<AssetFundamentals> {
      return {
        symbol: symbolOrId,
        quoteType: 'EQUITY',
        currency: 'USD',
        sector: 'Technology',
        industry: 'Semiconductors',
        marketCap: 3_000_000_000_000,
        totalAssets: null,
        circulatingSupply: null,
        expenseRatioPercent: null,
        beta: 1.65,
        fiftyTwoWeekLow: 90,
        fiftyTwoWeekHigh: 160,
        nextEarningsDate: '2026-12-01',
        valuation: {
          trailingPE: 35.2,
          forwardPE: 28.4,
          priceToBook: 18.5,
          priceToSales: 15.1,
          pegRatio: 1.4,
          evToEbitda: 25.0,
          trailingEps: 3.56,
          forwardEps: 4.42,
        },
        growthAndQuality: {
          earningsGrowthPercent: 62.5,
          revenueGrowthPercent: 58.1,
          returnOnEquityPercent: 85.0,
          profitMarginPercent: 48.2,
          operatingMarginPercent: 54.0,
          debtToEquityPercent: 18.5,
          freeCashflow: 60_000_000_000,
        },
        dividend: {
          yieldPercent: 0.45,
          annualRate: 0.56,
          payoutRatioPercent: 5.2,
          fiveYearAvgYieldPercent: 0.4,
          exDividendDate: '2026-11-10',
          cagr5yPercent: 12.4,
          consecutiveYears: 5,
          annualHistory: [
            { year: 2024, amount: 0.48, payments: 4 },
            { year: 2025, amount: 0.56, payments: 4 },
          ],
        },
        analyst: {
          recommendationKey: 'buy',
          recommendationLabel: 'Kauf',
          recommendationMean: 1.75,
          numberOfAnalysts: 48,
          targetLow: 110,
          targetMean: 165,
          targetHigh: 210,
          upsidePercent: 31.5,
          breakdown: { strongBuy: 12, buy: 28, hold: 7, sell: 1, strongSell: 0 },
        },
        updatedAt: '2026-11-22T14:00:00Z',
      };
    },
  };

  const mockFred: MacroDataProvider = {
    name: 'MockFred',
    async getSeries(seriesId: string) {
      if (shouldFailMacro) {
        throw new Error(`FRED failure for ${seriesId}`);
      }
      switch (seriesId) {
        case 'M2SL':
          return Array.from({ length: 18 }, (_, idx) => {
            const yr = 2025 + Math.floor(idx / 12);
            const mo = (idx % 12) + 1;
            return {
              date: `${yr}-${String(mo).padStart(2, '0')}-01`,
              value: 22000 + idx * 90,
            };
          });
        case 'DGS10':
          return buildDailySeries(4.7, -0.001, 120);
        case 'T10Y2Y':
          return buildDailySeries(0.1, 0.002, 120);
        case 'BAMLH0A0HYM2':
          return buildDailySeries(3.8, -0.003, 120);
        case 'WALCL':
          return buildDailySeries(6_750_000, 1_500, 60);
        case 'WTREGEN':
          return buildDailySeries(900_000, -1_000, 60);
        case 'RRPONTSYD':
          return buildDailySeries(50, -0.4, 60);
        default:
          return [];
      }
    },
  };

  beforeAll(async () => {
    const app = createApp({ yahoo: mockYahoo, fred: mockFred, overviewTtlMs: 25 });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('serves /api/health, /api/market/search, batch quotes with partial failures, and multi-asset candles', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);

    // Search endpoint
    const searchRes = await fetch(`${baseUrl}/api/market/search?q=Nvidia`);
    expect(searchRes.status).toBe(200);
    const searchJson = (await searchRes.json()) as { results: SymbolSearchResult[] };
    expect(searchJson.results[0].symbol).toBe('NVDA');

    // Batch quotes with partial failure tolerance
    const batchRes = await fetch(
      `${baseUrl}/api/market/quotes?symbols=${encodeURIComponent('GC=F,NVDA,FAIL-SYM')}`,
    );
    expect(batchRes.status).toBe(200);
    const batchJson = (await batchRes.json()) as { quotes: QuoteSummary[]; failed: string[] };
    expect(batchJson.quotes.map((q) => q.symbol)).toEqual(['GC=F', 'NVDA']);
    expect(batchJson.failed).toEqual(['FAIL-SYM']);

    // Default quotes (no symbols param)
    const defaultQuotesRes = await fetch(`${baseUrl}/api/market/quotes`);
    expect(defaultQuotesRes.status).toBe(200);
    const defaultQuotesJson = (await defaultQuotesRes.json()) as { quotes: QuoteSummary[] };
    expect(defaultQuotesJson.quotes).toHaveLength(6);

    // Candles via query param (arbitrary symbol NVDA) & legacy path param
    const nvdaRes = await fetch(`${baseUrl}/api/market/candles?symbol=NVDA&tf=1d`);
    expect(nvdaRes.status).toBe(200);
    const nvdaJson = (await nvdaRes.json()) as { symbol: string; candles: Candle[] };
    expect(nvdaJson.symbol).toBe('NVDA');
    expect(nvdaJson.candles).toHaveLength(50);

    const ndxRes = await fetch(`${baseUrl}/api/market/candles/NASDAQ100?tf=4h`);
    expect(ndxRes.status).toBe(200);
    const ndxJson = (await ndxRes.json()) as { symbol: string; timeframe: string };
    expect(ndxJson.symbol).toBe('^NDX');
    expect(ndxJson.timeframe).toBe('4h');

    // Invalid ticker syntax rejected with 400
    const badRes = await fetch(`${baseUrl}/api/market/candles?symbol=${encodeURIComponent('BAD SYMBOL!')}`);
    expect(badRes.status).toBe(400);

    // Fundamentals endpoint
    const fundRes = await fetch(`${baseUrl}/api/market/fundamentals?symbol=NVDA`);
    expect(fundRes.status).toBe(200);
    const fundJson = (await fundRes.json()) as AssetFundamentals;
    expect(fundJson.symbol).toBe('NVDA');
    expect(fundJson.valuation.trailingPE).toBe(35.2);
    expect(fundJson.valuation.priceToBook).toBe(18.5);
    expect(fundJson.analyst.recommendationLabel).toBe('Kauf');

    const badFundRes = await fetch(`${baseUrl}/api/market/fundamentals?symbol=BAD%20SYM`);
    expect(badFundRes.status).toBe(400);
  });

  it('serves unit-normalized /api/macro/overview and falls back to stale cache when upstream fails', async () => {
    const res1 = await fetch(`${baseUrl}/api/macro/overview`);
    expect(res1.status).toBe(200);
    const overview = (await res1.json()) as {
      stale: boolean;
      netLiquidity: { currentB: number; fedAssetsB: number; tgaB: number; rrpB: number };
      creditSpreads: { hyOasBps: number };
      m2: { latestB: number; yoyPercent: number };
      us10y: { yieldPercent: number; spread2s10sBps: number };
      dxy: { trend: string };
      comparisons: { sp500: MacroPoint[]; gold: MacroPoint[] };
    };

    expect(overview.stale).toBe(false);
    expect(overview.netLiquidity.fedAssetsB).toBeGreaterThan(6000);
    expect(overview.netLiquidity.currentB).toBeGreaterThan(5000);
    expect(overview.creditSpreads.hyOasBps).toBeGreaterThan(200);
    expect(overview.m2.yoyPercent).toBeGreaterThan(0);
    expect(overview.us10y.yieldPercent).toBe(4.45);
    expect(overview.comparisons.sp500.length).toBeGreaterThan(100);

    await new Promise((r) => setTimeout(r, 40));
    shouldFailMacro = true;
    const res2 = await fetch(`${baseUrl}/api/macro/overview`);
    expect(res2.status).toBe(200);
    const staleJson = (await res2.json()) as { stale: boolean; netLiquidity: { currentB: number } };
    expect(staleJson.stale).toBe(true);
    expect(staleJson.netLiquidity.currentB).toBe(overview.netLiquidity.currentB);
  });

  it('returns 502 on cold upstream failure', async () => {
    const coldApp = createApp({
      yahoo: mockYahoo,
      fred: {
        name: 'FailingFred',
        async getSeries() {
          throw new Error('FRED unreachable');
        },
      },
    });
    const coldServer = http.createServer(coldApp);
    await new Promise<void>((resolve) => coldServer.listen(0, '127.0.0.1', () => resolve()));
    try {
      const port = (coldServer.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/api/macro/overview`);
      expect(res.status).toBe(502);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('FRED unreachable');
    } finally {
      await new Promise<void>((resolve) => coldServer.close(() => resolve()));
    }
  });
});

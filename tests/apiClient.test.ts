import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLocalPattyWorkspaceApi,
  fetchQuotesApi,
  searchCatalogOffline,
} from '../src/services/apiClient.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiClient Local API Helpers', () => {
  it('searches default catalog offline by name or symbol', () => {
    const matches = searchCatalogOffline('nvidia');
    expect(matches.some((m) => m.symbol === 'NVDA')).toBe(true);
    expect(searchCatalogOffline('   ')).toEqual([]);
  });

  it('calls local /api/patty/local-workspace with optional includeCostBasis query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ found: true, filename: 'patty-workspace.json', sanitized: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const resDefault = await fetchLocalPattyWorkspaceApi();
    expect(resDefault.found).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/patty/local-workspace', undefined);

    await fetchLocalPattyWorkspaceApi({ includeCostBasis: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/patty/local-workspace?includeCostBasis=1',
      undefined,
    );
  });

  it('chunks large quote requests into 40-symbol batches on /api/market/quotes', async () => {
    const symbols = Array.from({ length: 45 }, (_, i) => `SYM${i}`);
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const qs = new URL(url, 'http://127.0.0.1:3001').searchParams.get('symbols') ?? '';
      const syms = qs.split(',').filter(Boolean);
      return new Response(
        JSON.stringify({
          quotes: syms.map((s) => ({
            id: s,
            symbol: s,
            name: s,
            shortName: s,
            price: 100,
            change: 0,
            changePercent: 0,
            prevClose: 100,
            dayHigh: 100,
            dayLow: 100,
            fiftyTwoWeekHigh: 110,
            fiftyTwoWeekLow: 90,
            currency: 'USD',
            unit: 'USD',
            decimals: 2,
            updatedAt: '2026-11-26T20:00:00Z',
          })),
          failed: [],
          updatedAt: '2026-11-26T20:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchQuotesApi(symbols);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.quotes).toHaveLength(45);
  });
});

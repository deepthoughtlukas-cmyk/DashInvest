import { describe, expect, it } from 'vitest';
import {
  aggregateAnnualDividends,
  parseYahooFundamentals,
  type YahooQuoteSummaryResult,
} from '../server/providers/yahooProvider.ts';

function unixUtc(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 1000);
}

describe('Yahoo Fundamentals & Dividend History Engine', () => {
  it('aggregates annual dividends, detects partial current year, streak & 5Y CAGR accurately', () => {
    const events = [
      // 2021: 4 x 0.20 = 0.80
      { date: unixUtc(2021, 2, 10), amount: 0.2 },
      { date: unixUtc(2021, 5, 10), amount: 0.2 },
      { date: unixUtc(2021, 8, 10), amount: 0.2 },
      { date: unixUtc(2021, 11, 10), amount: 0.2 },
      // 2022: 4 x 0.22 = 0.88
      { date: unixUtc(2022, 2, 10), amount: 0.22 },
      { date: unixUtc(2022, 5, 10), amount: 0.22 },
      { date: unixUtc(2022, 8, 10), amount: 0.22 },
      { date: unixUtc(2022, 11, 10), amount: 0.22 },
      // 2023: 4 x 0.24 = 0.96
      { date: unixUtc(2023, 2, 10), amount: 0.24 },
      { date: unixUtc(2023, 5, 10), amount: 0.24 },
      { date: unixUtc(2023, 8, 10), amount: 0.24 },
      { date: unixUtc(2023, 11, 10), amount: 0.24 },
      // 2024: 4 x 0.25 = 1.00
      { date: unixUtc(2024, 2, 10), amount: 0.25 },
      { date: unixUtc(2024, 5, 10), amount: 0.25 },
      { date: unixUtc(2024, 8, 10), amount: 0.25 },
      { date: unixUtc(2024, 11, 10), amount: 0.25 },
      // 2025: 4 x 0.26 = 1.04
      { date: unixUtc(2025, 2, 10), amount: 0.26 },
      { date: unixUtc(2025, 5, 10), amount: 0.26 },
      { date: unixUtc(2025, 8, 10), amount: 0.26 },
      { date: unixUtc(2025, 11, 10), amount: 0.26 },
      // 2026: only 2 payouts so far -> marked partial
      { date: unixUtc(2026, 2, 10), amount: 0.27 },
      { date: unixUtc(2026, 5, 10), amount: 0.27 },
    ];

    const res = aggregateAnnualDividends(events, 2026);
    expect(res.annualHistory).toHaveLength(6);
    expect(res.annualHistory[0]).toEqual({ year: 2021, amount: 0.8, payments: 4 });
    expect(res.annualHistory[4]).toEqual({ year: 2025, amount: 1.04, payments: 4 });
    expect(res.annualHistory[5]).toEqual({
      year: 2026,
      amount: 0.54,
      payments: 2,
      isPartial: true,
    });
    expect(res.consecutiveYears).toBe(6);
    // CAGR from complete 2021 (0.80) -> complete 2025 (1.04): (1.04 / 0.80)^(1/4) - 1 = ~6.78%
    expect(res.cagr5yPercent).toBeCloseTo(6.78, 1);

    const empty = aggregateAnnualDividends([], 2026);
    expect(empty).toEqual({ annualHistory: [], cagr5yPercent: null, consecutiveYears: 0 });
  });

  it('normalizes Yahoo stock metrics with exact units, German analyst label & upside calculation', () => {
    const raw: YahooQuoteSummaryResult = {
      price: {
        quoteType: 'EQUITY',
        currency: 'USD',
        marketCap: { raw: 4_978_000_000_000 },
        regularMarketPrice: { raw: 340 },
      },
      assetProfile: {
        sector: 'Technology',
        industry: 'Consumer Electronics',
      },
      summaryDetail: {
        trailingPE: { raw: 38.15 },
        forwardPE: { raw: 32.4 },
        dividendYield: { raw: 0.0032 }, // fraction -> 0.32%
        dividendRate: { raw: 1.08 },
        fiveYearAvgDividendYield: { raw: 0.46 }, // ALREADY percent -> 0.46%
        payoutRatio: { raw: 0.118 }, // fraction -> 11.8%
        exDividendDate: { fmt: '2026-11-12' },
        priceToSalesTrailing12Months: { raw: 10.4 },
        beta: { raw: 1.09 },
        fiftyTwoWeekLow: { raw: 243.42 },
        fiftyTwoWeekHigh: { raw: 360.83 },
      },
      defaultKeyStatistics: {
        priceToBook: { raw: 44.41 },
        pegRatio: { raw: 2.77 },
        enterpriseToEbitda: { raw: 29.25 },
        trailingEps: { raw: 8.98 },
        forwardEps: { raw: 10.57 },
      },
      financialData: {
        currentPrice: { raw: 300 },
        targetLowPrice: { raw: 250 },
        targetMeanPrice: { raw: 360 }, // +20% upside from 300
        targetHighPrice: { raw: 425 },
        recommendationKey: 'buy',
        recommendationMean: { raw: 2.18 },
        numberOfAnalystOpinions: { raw: 39 },
        earningsGrowth: { raw: 0.141 }, // fraction -> 14.1%
        revenueGrowth: { raw: 0.117 }, // fraction -> 11.7%
        returnOnEquity: { raw: 1.42257 }, // fraction -> 142.26%
        profitMargins: { raw: 0.27604 }, // fraction -> 27.60%
        operatingMargins: { raw: 0.3301 }, // fraction -> 33.01%
        debtToEquity: { raw: 84.286 }, // ALREADY percent -> 84.3%
        freeCashflow: { raw: 105_658_000_000 },
      },
      recommendationTrend: {
        trend: [{ period: '0m', strongBuy: 6, buy: 20, hold: 13, sell: 3, strongSell: 3 }],
      },
      calendarEvents: {
        earnings: { earningsDate: [{ fmt: '2027-01-28' }] },
      },
    };

    const parsed = parseYahooFundamentals('AAPL', raw, [], 2026);
    expect(parsed.symbol).toBe('AAPL');
    expect(parsed.valuation.trailingPE).toBe(38.15);
    expect(parsed.valuation.forwardPE).toBe(32.4);
    expect(parsed.valuation.priceToBook).toBe(44.41);
    expect(parsed.growthAndQuality.earningsGrowthPercent).toBe(14.1);
    expect(parsed.growthAndQuality.revenueGrowthPercent).toBe(11.7);
    expect(parsed.growthAndQuality.returnOnEquityPercent).toBe(142.26);
    expect(parsed.growthAndQuality.debtToEquityPercent).toBe(84.3);
    expect(parsed.dividend.yieldPercent).toBe(0.32);
    expect(parsed.dividend.fiveYearAvgYieldPercent).toBe(0.46);
    expect(parsed.dividend.payoutRatioPercent).toBe(11.8);
    expect(parsed.analyst.recommendationLabel).toBe('Kauf');
    expect(parsed.analyst.upsidePercent).toBe(20);
    expect(parsed.analyst.breakdown).toEqual({
      strongBuy: 6,
      buy: 20,
      hold: 13,
      sell: 3,
      strongSell: 3,
    });
    expect(parsed.nextEarningsDate).toBe('2027-01-28');
  });

  it('strips negative ETF forwardPE and handles non-equity crypto/commodity payloads gracefully', () => {
    const etfRaw: YahooQuoteSummaryResult = {
      price: { quoteType: 'ETF', currency: 'USD' },
      summaryDetail: {
        forwardPE: { raw: -4072.5 },
        yield: { raw: 0.0476 },
        totalAssets: { raw: 47_518_568_448 },
      },
      fundProfile: {
        feesExpensesInvestment: { annualReportExpenseRatio: { raw: 0.0015 } },
      },
    };

    const parsedEtf = parseYahooFundamentals('TLT', etfRaw, [], 2026);
    expect(parsedEtf.quoteType).toBe('ETF');
    expect(parsedEtf.valuation.forwardPE).toBeNull();
    expect(parsedEtf.dividend.yieldPercent).toBe(4.76);
    expect(parsedEtf.expenseRatioPercent).toBe(0.15);
    expect(parsedEtf.totalAssets).toBe(47_518_568_448);

    const cryptoRaw: YahooQuoteSummaryResult = {
      price: { quoteType: 'CRYPTOCURRENCY', currency: 'USD', marketCap: { raw: 1.2e12 } },
      summaryDetail: {
        circulatingSupply: { raw: 20_115_784 },
        fiftyTwoWeekLow: { raw: 55149.5 },
        fiftyTwoWeekHigh: { raw: 97860.6 },
      },
    };

    const parsedBtc = parseYahooFundamentals('BTC-USD', cryptoRaw, [], 2026);
    expect(parsedBtc.marketCap).toBe(1.2e12);
    expect(parsedBtc.circulatingSupply).toBe(20_115_784);
    expect(parsedBtc.valuation.trailingPE).toBeNull();
    expect(parsedBtc.analyst.recommendationLabel).toBeNull();
  });
});

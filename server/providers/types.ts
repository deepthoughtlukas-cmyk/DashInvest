import type { AssetId, Candle, MacroPoint, QuoteId, QuoteSummary, Timeframe } from '../../shared/types.ts';

export interface MarketDataProvider {
  name: string;
  getCandles(id: QuoteId, timeframe: Timeframe): Promise<Candle[]>;
  getQuote(id: QuoteId): Promise<QuoteSummary>;
  getDailyHistory(id: AssetId | 'DXY' | 'US10Y', range?: string): Promise<MacroPoint[]>;
}

export interface MacroDataProvider {
  name: string;
  getSeries(seriesId: string): Promise<MacroPoint[]>;
}

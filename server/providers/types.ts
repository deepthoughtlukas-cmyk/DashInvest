import type {
  Candle,
  MacroPoint,
  QuoteSummary,
  SymbolSearchResult,
  Timeframe,
} from '../../shared/types.ts';

export interface MarketDataProvider {
  name: string;
  getCandles(symbolOrId: string, timeframe: Timeframe): Promise<Candle[]>;
  getQuote(symbolOrId: string): Promise<QuoteSummary>;
  getDailyHistory(symbolOrId: string, range?: string): Promise<MacroPoint[]>;
  searchSymbols(query: string): Promise<SymbolSearchResult[]>;
}

export interface MacroDataProvider {
  name: string;
  getSeries(seriesId: string): Promise<MacroPoint[]>;
}

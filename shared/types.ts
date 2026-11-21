export type AssetId = 'GOLD' | 'SILVER' | 'SP500' | 'NASDAQ100';
export type QuoteId = AssetId | 'DXY' | 'US10Y';
export type Timeframe = '15m' | '1h' | '4h' | '1d' | '1w';
export type ChartStyle = 'candles' | 'heikin_ashi' | 'line';
export type ElliottDegree = 'minor' | 'intermediate' | 'primary';

export interface Candle {
  time: number; // Unix seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuoteSummary {
  id: QuoteId;
  symbol: string;
  name: string;
  shortName: string;
  price: number;
  change: number;
  changePercent: number;
  prevClose: number;
  dayHigh: number;
  dayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  currency: string;
  unit: string;
  decimals: number;
  updatedAt: string;
  weekChangePercent?: number;
  ytdChangePercent?: number;
}

export interface AssetCandlesResponse {
  assetId: AssetId;
  timeframe: Timeframe;
  quote: QuoteSummary;
  candles: Candle[];
  stale?: boolean;
}

export interface MacroPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface NetLiquidityPoint {
  date: string; // YYYY-MM-DD
  netLiquidity: number; // Billions USD
  fedAssets: number;    // Billions USD
  tga: number;          // Billions USD
  rrp: number;          // Billions USD
}

export interface MacroOverview {
  dxy: {
    quote: QuoteSummary;
    history: MacroPoint[];
    sma50: number | null;
    sma200: number | null;
    trend: 'bullish' | 'neutral' | 'bearish';
  };
  m2: {
    latestB: number;
    latestT: number;
    date: string;
    yoyPercent: number;
    threeMonthAnnualizedPercent: number;
    momPercent: number;
    status: 'expanding' | 'flat' | 'contracting';
    history: MacroPoint[];
  };
  us10y: {
    yieldPercent: number;
    change1dBps: number;
    change1wBps: number;
    change1mBps: number;
    spread2s10sPercent: number | null;
    spread2s10sBps: number | null;
    curveStatus: 'normal' | 'flat' | 'inverted';
    date: string;
    history: MacroPoint[];
    spreadHistory: MacroPoint[];
  };
  creditSpreads: {
    hyOasBps: number;
    hyOasPercent: number;
    change1wBps: number;
    change1mBps: number;
    percentile5y: number;
    regime: 'risk-on' | 'neutral' | 'stress';
    date: string;
    history: MacroPoint[]; // stored in bps
  };
  netLiquidity: {
    currentB: number;
    currentT: number;
    fedAssetsB: number;
    tgaB: number;
    rrpB: number;
    delta4wB: number;
    delta4wPercent: number;
    delta13wB: number;
    delta13wPercent: number;
    impulse: 'expanding' | 'neutral' | 'contracting';
    date: string;
    history: NetLiquidityPoint[];
  };
  comparisons: {
    sp500: MacroPoint[];
    gold: MacroPoint[];
  };
  updatedAt: string;
  stale?: boolean;
}

export const ASSET_META: Record<
  AssetId,
  { symbol: string; name: string; shortName: string; unit: string; decimals: number }
> = {
  GOLD: {
    symbol: 'GC=F',
    name: 'Gold (COMEX Futures)',
    shortName: 'Gold',
    unit: 'USD/oz',
    decimals: 2,
  },
  SILVER: {
    symbol: 'SI=F',
    name: 'Silber (COMEX Futures)',
    shortName: 'Silber',
    unit: 'USD/oz',
    decimals: 2,
  },
  SP500: {
    symbol: '^GSPC',
    name: 'S&P 500 Index',
    shortName: 'S&P 500',
    unit: 'Pkt.',
    decimals: 2,
  },
  NASDAQ100: {
    symbol: '^NDX',
    name: 'Nasdaq 100 Index',
    shortName: 'Nasdaq 100',
    unit: 'Pkt.',
    decimals: 2,
  },
};

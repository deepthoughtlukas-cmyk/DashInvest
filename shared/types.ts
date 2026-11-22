export type AssetId = 'GOLD' | 'SILVER' | 'SP500' | 'NASDAQ100';
export type QuoteId = AssetId | 'DXY' | 'US10Y' | string;
export type Timeframe = '15m' | '1h' | '4h' | '1d' | '1w';
export type ChartStyle = 'candles' | 'heikin_ashi' | 'line';
export type ElliottDegree = 'minor' | 'intermediate' | 'primary';

export type AssetClass =
  | 'precious_metals'
  | 'commodities'
  | 'indices'
  | 'equities'
  | 'crypto'
  | 'forex'
  | 'bonds'
  | 'etf';

export interface UserProfileSummary {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedWorkspaceState {
  activeSymbol: string;
  activeTimeframe: Timeframe;
  activePreset: 'analyse-fokus' | 'multi-chart' | 'makro-cockpit';
  activeWidgets: string[];
  layouts: Record<string, unknown>;
  layoutLocked: boolean;
  proseTab: 'macro' | 'asset';
  proseDepth: 'compact' | 'detailed';
  showFundamentalsSidebar: boolean;
  chartSettings: Record<string, unknown>;
  manualFibs: Record<string, unknown>;
  folders: AssetFolder[];
  catalogAssets: CatalogAsset[];
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: UserProfileSummary | null;
  workspace: PersistedWorkspaceState | null;
}

export interface CatalogAsset {
  symbol: string;
  name: string;
  shortName: string;
  assetClass: AssetClass;
  unit: string;
  decimals: number;
  exchange?: string;
  folderId: string;
  bookmarked: boolean;
}

export interface AssetFolder {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
  collapsed?: boolean;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  shortName: string;
  quoteType: string;
  exchange: string;
  assetClass: AssetClass;
  decimals: number;
  unit: string;
}

export interface Candle {
  time: number; // Unix seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuoteSummary {
  id: string;
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
  assetId: string;
  symbol: string;
  timeframe: Timeframe;
  quote: QuoteSummary;
  candles: Candle[];
  stale?: boolean;
}

export interface MacroPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface DividendYearPoint {
  year: number;
  amount: number;
  payments: number;
  isPartial?: boolean;
}

export interface AnalystConsensus {
  recommendationKey: string | null;
  recommendationLabel: string | null;
  recommendationMean: number | null;
  numberOfAnalysts: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetHigh: number | null;
  upsidePercent: number | null;
  breakdown: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;
}

export interface AssetFundamentals {
  symbol: string;
  quoteType: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  totalAssets: number | null;
  circulatingSupply: number | null;
  expenseRatioPercent: number | null;
  beta: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  nextEarningsDate: string | null;
  valuation: {
    trailingPE: number | null;
    forwardPE: number | null;
    priceToBook: number | null;
    priceToSales: number | null;
    pegRatio: number | null;
    evToEbitda: number | null;
    trailingEps: number | null;
    forwardEps: number | null;
  };
  growthAndQuality: {
    earningsGrowthPercent: number | null;
    revenueGrowthPercent: number | null;
    returnOnEquityPercent: number | null;
    profitMarginPercent: number | null;
    operatingMarginPercent: number | null;
    debtToEquityPercent: number | null;
    freeCashflow: number | null;
  };
  dividend: {
    yieldPercent: number | null;
    annualRate: number | null;
    payoutRatioPercent: number | null;
    fiveYearAvgYieldPercent: number | null;
    exDividendDate: string | null;
    cagr5yPercent: number | null;
    consecutiveYears: number;
    annualHistory: DividendYearPoint[];
  };
  analyst: AnalystConsensus;
  updatedAt: string;
  stale?: boolean;
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

import type { AssetClass, AssetFolder, CatalogAsset } from './types.ts';

export const LEGACY_TO_SYMBOL: Record<string, string> = {
  GOLD: 'GC=F',
  SILVER: 'SI=F',
  SP500: '^GSPC',
  NASDAQ100: '^NDX',
  DXY: 'DX-Y.NYB',
  US10Y: '^TNX',
};

export function resolveCanonicalSymbol(input: string): string {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  return LEGACY_TO_SYMBOL[upper] ?? upper;
}

export function isValidTickerSymbol(symbol: string): boolean {
  const canonical = resolveCanonicalSymbol(symbol);
  return /^[A-Z0-9^.=_-]{1,20}$/.test(canonical);
}

export function inferAssetClass(symbol: string, quoteType?: string): AssetClass {
  const s = symbol.toUpperCase();
  const qt = (quoteType ?? '').toUpperCase();

  if (s === 'GC=F' || s === 'SI=F' || s === 'PL=F' || s === 'PA=F') {
    return 'precious_metals';
  }
  if (s.endsWith('=F') || qt === 'FUTURE') return 'commodities';
  if (qt === 'CRYPTOCURRENCY' || s.endsWith('-USD') || s.endsWith('-EUR')) return 'crypto';
  if (qt === 'CURRENCY' || s.endsWith('=X') || s === 'DX-Y.NYB') return 'forex';
  if (s === '^TNX' || s === '^TYX' || s === '^IRX' || s === 'TLT' || s === 'IEF' || s === 'HYG') {
    return 'bonds';
  }
  if (qt === 'INDEX' || s.startsWith('^')) return 'indices';
  if (qt === 'ETF') return 'etf';
  return 'equities';
}

export function inferDecimals(symbol: string, assetClass: AssetClass): number {
  const s = symbol.toUpperCase();
  if (assetClass === 'forex' && !s.includes('JPY')) return 4;
  if (s === '^TNX' || s === '^TYX') return 3;
  return 2;
}

export function inferUnit(assetClass: AssetClass, currency?: string): string {
  if (assetClass === 'indices') return 'Pkt.';
  if (assetClass === 'forex') return 'Kurs';
  return currency || 'USD';
}

export const DEFAULT_FOLDERS: AssetFolder[] = [
  { id: 'folder-commodities', name: 'Rohstoffe & Edelmetalle', parentId: null, color: '#f59e0b', collapsed: false },
  { id: 'folder-metals', name: 'Edelmetalle', parentId: 'folder-commodities', color: '#facc15', collapsed: false },
  { id: 'folder-energy', name: 'Energie & Industriemetalle', parentId: 'folder-commodities', color: '#fb923c', collapsed: true },
  { id: 'folder-indices', name: 'Aktienindizes', parentId: null, color: '#38bdf8', collapsed: false },
  { id: 'folder-indices-us', name: 'USA', parentId: 'folder-indices', color: '#60a5fa', collapsed: false },
  { id: 'folder-indices-global', name: 'Europa & Global', parentId: 'folder-indices', color: '#22d3ee', collapsed: false },
  { id: 'folder-equities', name: 'Einzelaktien & Tech', parentId: null, color: '#a78bfa', collapsed: false },
  { id: 'folder-equities-us', name: 'US Mega-Cap & AI', parentId: 'folder-equities', color: '#c084fc', collapsed: false },
  { id: 'folder-equities-eu', name: 'Europa & DAX', parentId: 'folder-equities', color: '#818cf8', collapsed: true },
  { id: 'folder-crypto', name: 'Krypto', parentId: null, color: '#10b981', collapsed: false },
  { id: 'folder-fx-bonds', name: 'Devisen & Anleihen', parentId: null, color: '#94a3b8', collapsed: true },
];

export const DEFAULT_CATALOG_ASSETS: CatalogAsset[] = [
  // Edelmetalle
  { symbol: 'GC=F', name: 'Gold (COMEX Futures)', shortName: 'Gold', assetClass: 'precious_metals', unit: 'USD/oz', decimals: 2, exchange: 'COMEX', folderId: 'folder-metals', bookmarked: true },
  { symbol: 'SI=F', name: 'Silber (COMEX Futures)', shortName: 'Silber', assetClass: 'precious_metals', unit: 'USD/oz', decimals: 2, exchange: 'COMEX', folderId: 'folder-metals', bookmarked: true },
  { symbol: 'PL=F', name: 'Platin Futures', shortName: 'Platin', assetClass: 'precious_metals', unit: 'USD/oz', decimals: 2, exchange: 'NYMEX', folderId: 'folder-metals', bookmarked: false },
  { symbol: 'PA=F', name: 'Palladium Futures', shortName: 'Palladium', assetClass: 'precious_metals', unit: 'USD/oz', decimals: 2, exchange: 'NYMEX', folderId: 'folder-metals', bookmarked: false },
  { symbol: 'GDX', name: 'VanEck Gold Miners ETF', shortName: 'GDX Miners', assetClass: 'etf', unit: 'USD', decimals: 2, exchange: 'NYSE', folderId: 'folder-metals', bookmarked: false },

  // Energie & Industriemetalle
  { symbol: 'CL=F', name: 'WTI Rohöl Futures', shortName: 'WTI Öl', assetClass: 'commodities', unit: 'USD/bbl', decimals: 2, exchange: 'NYMEX', folderId: 'folder-energy', bookmarked: false },
  { symbol: 'BZ=F', name: 'Brent Rohöl Futures', shortName: 'Brent Öl', assetClass: 'commodities', unit: 'USD/bbl', decimals: 2, exchange: 'ICE', folderId: 'folder-energy', bookmarked: false },
  { symbol: 'NG=F', name: 'US Erdgas (Henry Hub)', shortName: 'Erdgas', assetClass: 'commodities', unit: 'USD', decimals: 3, exchange: 'NYMEX', folderId: 'folder-energy', bookmarked: false },
  { symbol: 'HG=F', name: 'Kupfer Futures', shortName: 'Kupfer', assetClass: 'commodities', unit: 'USD/lb', decimals: 3, exchange: 'COMEX', folderId: 'folder-energy', bookmarked: false },

  // Aktienindizes USA
  { symbol: '^GSPC', name: 'S&P 500 Index', shortName: 'S&P 500', assetClass: 'indices', unit: 'Pkt.', decimals: 2, exchange: 'SNP', folderId: 'folder-indices-us', bookmarked: true },
  { symbol: '^NDX', name: 'Nasdaq 100 Index', shortName: 'Nasdaq 100', assetClass: 'indices', unit: 'Pkt.', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-indices-us', bookmarked: true },
  { symbol: '^DJI', name: 'Dow Jones Industrial Average', shortName: 'Dow Jones', assetClass: 'indices', unit: 'Pkt.', decimals: 2, exchange: 'DJI', folderId: 'folder-indices-us', bookmarked: false },
  { symbol: '^RUT', name: 'Russell 2000 Small Caps', shortName: 'Russell 2000', assetClass: 'indices', unit: 'Pkt.', decimals: 2, exchange: 'RUSSELL', folderId: 'folder-indices-us', bookmarked: false },

  // Aktienindizes Europa & Global
  { symbol: '^GDAXI', name: 'DAX 40 Performance Index', shortName: 'DAX 40', assetClass: 'indices', unit: 'Pkt.', decimals: 2, exchange: 'XETRA', folderId: 'folder-indices-global', bookmarked: true },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50', shortName: 'EuroStoxx 50', assetClass: 'indices', unit: 'Pkt.', decimals: 2, exchange: 'EUREX', folderId: 'folder-indices-global', bookmarked: false },
  { symbol: '^FTSE', name: 'FTSE 100 London', shortName: 'FTSE 100', assetClass: 'indices', unit: 'Pkt.', decimals: 2, exchange: 'LSE', folderId: 'folder-indices-global', bookmarked: false },
  { symbol: '^N225', name: 'Nikkei 225 Japan', shortName: 'Nikkei 225', assetClass: 'indices', unit: 'Pkt.', decimals: 2, exchange: 'TSE', folderId: 'folder-indices-global', bookmarked: false },

  // US Mega-Cap & AI
  { symbol: 'NVDA', name: 'NVIDIA Corporation', shortName: 'NVIDIA', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-us', bookmarked: true },
  { symbol: 'AAPL', name: 'Apple Inc.', shortName: 'Apple', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-us', bookmarked: false },
  { symbol: 'MSFT', name: 'Microsoft Corporation', shortName: 'Microsoft', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-us', bookmarked: false },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', shortName: 'Amazon', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-us', bookmarked: false },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)', shortName: 'Alphabet', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-us', bookmarked: false },
  { symbol: 'META', name: 'Meta Platforms Inc.', shortName: 'Meta', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-us', bookmarked: false },
  { symbol: 'TSLA', name: 'Tesla Inc.', shortName: 'Tesla', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-us', bookmarked: false },
  { symbol: 'AVGO', name: 'Broadcom Inc.', shortName: 'Broadcom', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-us', bookmarked: false },

  // Europa & DAX Aktien
  { symbol: 'SAP.DE', name: 'SAP SE', shortName: 'SAP', assetClass: 'equities', unit: 'EUR', decimals: 2, exchange: 'XETRA', folderId: 'folder-equities-eu', bookmarked: false },
  { symbol: 'SIE.DE', name: 'Siemens AG', shortName: 'Siemens', assetClass: 'equities', unit: 'EUR', decimals: 2, exchange: 'XETRA', folderId: 'folder-equities-eu', bookmarked: false },
  { symbol: 'ALV.DE', name: 'Allianz SE', shortName: 'Allianz', assetClass: 'equities', unit: 'EUR', decimals: 2, exchange: 'XETRA', folderId: 'folder-equities-eu', bookmarked: false },
  { symbol: 'ASML', name: 'ASML Holding N.V.', shortName: 'ASML', assetClass: 'equities', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-equities-eu', bookmarked: false },

  // Krypto
  { symbol: 'BTC-USD', name: 'Bitcoin USD', shortName: 'Bitcoin', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC', folderId: 'folder-crypto', bookmarked: true },
  { symbol: 'ETH-USD', name: 'Ethereum USD', shortName: 'Ethereum', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC', folderId: 'folder-crypto', bookmarked: false },
  { symbol: 'SOL-USD', name: 'Solana USD', shortName: 'Solana', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC', folderId: 'folder-crypto', bookmarked: false },

  // Devisen & Anleihen
  { symbol: 'EURUSD=X', name: 'EUR / USD Wechselkurs', shortName: 'EUR/USD', assetClass: 'forex', unit: 'Kurs', decimals: 4, exchange: 'FX', folderId: 'folder-fx-bonds', bookmarked: false },
  { symbol: 'USDJPY=X', name: 'USD / JPY Wechselkurs', shortName: 'USD/JPY', assetClass: 'forex', unit: 'Kurs', decimals: 2, exchange: 'FX', folderId: 'folder-fx-bonds', bookmarked: false },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', shortName: 'TLT (20Y+ Bonds)', assetClass: 'bonds', unit: 'USD', decimals: 2, exchange: 'NASDAQ', folderId: 'folder-fx-bonds', bookmarked: false },
  { symbol: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF', shortName: 'HYG (High Yield)', assetClass: 'bonds', unit: 'USD', decimals: 2, exchange: 'NYSE', folderId: 'folder-fx-bonds', bookmarked: false },
];

export const DEFAULT_CATALOG_BY_SYMBOL = new Map<string, CatalogAsset>(
  DEFAULT_CATALOG_ASSETS.map((a) => [a.symbol, a]),
);

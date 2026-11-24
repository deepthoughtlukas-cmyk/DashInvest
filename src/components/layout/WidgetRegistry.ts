import type { WidgetId } from '../../store/dashboardStore.ts';

export interface WidgetDefinition {
  id: WidgetId;
  title: string;
  subtitle: string;
  category: 'Charts' | 'Analyse & Signale' | 'Makro & Liquidität';
  badge?: string;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  'catalog-explorer': {
    id: 'catalog-explorer',
    title: 'Wertpapier-Katalog & Bookmarks',
    subtitle: 'Ordnerstruktur, Favoriten & globale Tickersuche (Aktien, ETFs, Krypto, Rohstoffe)',
    category: 'Charts',
    badge: 'Katalog',
  },
  'master-chart': {
    id: 'master-chart',
    title: 'Master Chart Terminal',
    subtitle: 'Alle Katalog- & Bookmark-Werte inkl. Fib, Elliott & Indikatoren',
    category: 'Charts',
    badge: 'Interaktiv',
  },
  'chart-gold': {
    id: 'chart-gold',
    title: 'Gold (GC=F)',
    subtitle: 'Eigenständiger Chart für Gold Futures',
    category: 'Charts',
  },
  'chart-silver': {
    id: 'chart-silver',
    title: 'Silber (SI=F)',
    subtitle: 'Eigenständiger Chart für Silber Futures',
    category: 'Charts',
  },
  'chart-sp500': {
    id: 'chart-sp500',
    title: 'S&P 500 (^GSPC)',
    subtitle: 'Eigenständiger Chart für den S&P 500',
    category: 'Charts',
  },
  'chart-nasdaq': {
    id: 'chart-nasdaq',
    title: 'Nasdaq 100 (^NDX)',
    subtitle: 'Eigenständiger Chart für den Nasdaq 100',
    category: 'Charts',
  },
  'prose-briefing': {
    id: 'prose-briefing',
    title: 'Markt- & Makro-Briefing (Prosa)',
    subtitle: 'Verständliche Gesamtanalyse & wichtigste Schlussfolgerungen',
    category: 'Analyse & Signale',
    badge: 'Prosa',
  },
  'signal-matrix': {
    id: 'signal-matrix',
    title: 'Confluence-Matrix & Signale',
    subtitle: 'Score-Übersicht deiner Bookmarks & Live-Signal-Feed',
    category: 'Analyse & Signale',
  },
  'bookmark-signals-7d': {
    id: 'bookmark-signals-7d',
    title: 'Bookmark-Signale (7 Tage)',
    subtitle: 'Alle ausgelösten Signale der letzten 7 Tage für alle als Bookmark markierten Assets',
    category: 'Analyse & Signale',
    badge: '7 Tage',
  },
  'macro-liquidity': {
    id: 'macro-liquidity',
    title: 'US-Marktliquidität (Fed Net Liquidity)',
    subtitle: 'WALCL − TGA − ON RRP in Bio. USD inkl. S&P/Gold-Overlay',
    category: 'Makro & Liquidität',
    badge: 'FRED',
  },
  'macro-credit': {
    id: 'macro-credit',
    title: 'Credit Spreads (US High Yield OAS)',
    subtitle: 'Kreditrisiko-Indikator in bps inkl. 5J-Perzentil & Stress-Ampel',
    category: 'Makro & Liquidität',
    badge: 'FRED',
  },
  'macro-dxy': {
    id: 'macro-dxy',
    title: 'US-Dollar-Index (DXY)',
    subtitle: 'Live-Dollarstärke inkl. SMA 50/200 Trendstatus',
    category: 'Makro & Liquidität',
    badge: 'Live',
  },
  'macro-m2': {
    id: 'macro-m2',
    title: 'US-Geldmenge M2',
    subtitle: 'M2SL Geldmengenwachstum (YoY & 3M annualisiert)',
    category: 'Makro & Liquidität',
    badge: 'FRED',
  },
  'macro-us10y': {
    id: 'macro-us10y',
    title: '10J US-Anleiherenditen',
    subtitle: '10-Year Treasury Yield inkl. 2s10s Zinskurven-Spread',
    category: 'Makro & Liquidität',
    badge: 'Live/FRED',
  },
  'macro-us3m': {
    id: 'macro-us3m',
    title: '3M US-Treasury & Momentum-Dreh',
    subtitle: '3-Monats-Rendite (DGS3MO / ^IRX), 10J–3M Spread & Vorlauf-Indikator für 10J-Zinsen',
    category: 'Makro & Liquidität',
    badge: 'Vorlauf',
  },
};

export const ALL_WIDGET_IDS = Object.keys(WIDGET_REGISTRY) as WidgetId[];

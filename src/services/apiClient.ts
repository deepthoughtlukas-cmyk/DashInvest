import {
  DEFAULT_CATALOG_ASSETS,
  isValidTickerSymbol,
  resolveCanonicalSymbol,
} from '../../shared/catalog.ts';
import type {
  AssetCandlesResponse,
  AssetFundamentals,
  Candle,
  MacroOverview,
  PersistedWorkspaceState,
  QuoteSummary,
  SymbolSearchResult,
  Timeframe,
  UserProfileSummary,
} from '../../shared/types.ts';

export type ApiMode = 'live-remote' | 'live-local' | 'static-snapshot';

export function getApiBaseUrl(): string {
  const raw =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
  return String(raw).trim().replace(/\/+$/, '');
}

export function isStaticFallbackEnabled(): boolean {
  const raw =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STATIC_FALLBACK) || '';
  return String(raw).trim().toLowerCase() === 'true';
}

export function getViteBasePath(): string {
  const raw = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function getApiMode(): ApiMode {
  if (getApiBaseUrl().length > 0) return 'live-remote';
  if (isStaticFallbackEnabled()) return 'static-snapshot';
  return 'live-local';
}

export function resolveApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}

export function sanitizeSymbolFileKey(symbolOrId: string): string {
  return resolveCanonicalSymbol(symbolOrId).replace(/[^A-Za-z0-9.-]/g, '_');
}

async function fetchJsonStrict<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) msg = errBody.error;
    } catch {
      // ignore non-json
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function aggregateDailyToWeekly(daily: Candle[]): Candle[] {
  if (daily.length === 0) return [];
  const buckets = new Map<number, Candle>();

  for (const bar of daily) {
    const dt = new Date(bar.time * 1000);
    const utcDay = dt.getUTCDay(); // 0=Sun..6=Sat
    const daysSinceMon = (utcDay + 6) % 7;
    const mondayUtc = Date.UTC(
      dt.getUTCFullYear(),
      dt.getUTCMonth(),
      dt.getUTCDate() - daysSinceMon,
    );
    const weekSec = Math.floor(mondayUtc / 1000);
    const existing = buckets.get(weekSec);
    if (!existing) {
      buckets.set(weekSec, { ...bar, time: weekSec });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

export async function fetchQuotesApi(
  symbols?: string[],
): Promise<{ quotes: QuoteSummary[]; failed?: string[]; updatedAt: string }> {
  const normalized = symbols
    ? Array.from(new Set(symbols.map((s) => resolveCanonicalSymbol(s)))).slice(0, 45)
    : [];

  if (getApiMode() === 'static-snapshot') {
    const url = `${getViteBasePath()}static-api/quotes.json`;
    const snap = await fetchJsonStrict<{ quotes: QuoteSummary[]; updatedAt: string }>(url);
    if (normalized.length === 0) return { ...snap, failed: [] };
    const want = new Set(normalized);
    const matched = snap.quotes.filter((q) => want.has(q.symbol) || want.has(q.id));
    const foundKeys = new Set(matched.flatMap((q) => [q.symbol, q.id]));
    const failed = normalized.filter((s) => !foundKeys.has(s));
    return { quotes: matched, failed, updatedAt: snap.updatedAt };
  }

  if (symbols) {
    return fetchJsonStrict<{ quotes: QuoteSummary[]; failed?: string[]; updatedAt: string }>(
      resolveApiUrl(`/api/market/quotes?symbols=${encodeURIComponent(normalized.join(','))}`),
    );
  }
  return fetchJsonStrict<{ quotes: QuoteSummary[]; failed?: string[]; updatedAt: string }>(
    resolveApiUrl('/api/market/quotes'),
  );
}

export function searchCatalogOffline(query: string): SymbolSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return DEFAULT_CATALOG_ASSETS.filter(
    (a) =>
      a.symbol.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.shortName.toLowerCase().includes(q),
  )
    .slice(0, 12)
    .map((a) => ({
      symbol: a.symbol,
      name: a.name,
      shortName: a.shortName,
      quoteType:
        a.assetClass === 'crypto'
          ? 'CRYPTOCURRENCY'
          : a.assetClass === 'etf'
            ? 'ETF'
            : a.assetClass === 'indices'
              ? 'INDEX'
              : a.assetClass === 'forex'
                ? 'CURRENCY'
                : 'EQUITY',
      exchange: a.exchange ?? '',
      assetClass: a.assetClass,
      decimals: a.decimals,
      unit: a.unit,
    }));
}

export async function fetchSymbolSearchApi(
  query: string,
): Promise<{ query: string; results: SymbolSearchResult[] }> {
  const trimmed = query.trim();
  if (getApiMode() === 'static-snapshot') {
    return { query: trimmed, results: searchCatalogOffline(trimmed) };
  }
  return fetchJsonStrict<{ query: string; results: SymbolSearchResult[] }>(
    resolveApiUrl(`/api/market/search?q=${encodeURIComponent(trimmed)}`),
  );
}

export async function fetchMacroOverviewApi(): Promise<MacroOverview> {
  if (getApiMode() === 'static-snapshot') {
    return fetchJsonStrict<MacroOverview>(`${getViteBasePath()}static-api/macro-overview.json`);
  }
  return fetchJsonStrict<MacroOverview>(resolveApiUrl('/api/macro/overview'));
}

export async function fetchAssetCandlesApi(
  symbolOrId: string,
  timeframe: Timeframe,
): Promise<AssetCandlesResponse> {
  const symbol = resolveCanonicalSymbol(symbolOrId);
  if (getApiMode() === 'static-snapshot') {
    const key = sanitizeSymbolFileKey(symbol);
    const exactUrl = `${getViteBasePath()}static-api/candles/${key}_${timeframe}.json`;
    try {
      return await fetchJsonStrict<AssetCandlesResponse>(exactUrl);
    } catch {
      if (timeframe !== '1d') {
        const dailyUrl = `${getViteBasePath()}static-api/candles/${key}_1d.json`;
        const daily = await fetchJsonStrict<AssetCandlesResponse>(dailyUrl).catch(() => null);
        if (daily) {
          return {
            ...daily,
            timeframe,
            candles: timeframe === '1w' ? aggregateDailyToWeekly(daily.candles) : daily.candles,
            stale: true,
          };
        }
      }
      throw new Error(
        `Für ${symbol} (${timeframe}) liegt kein statischer Snapshot vor — bitte Cloudflare Worker API verbinden.`,
      );
    }
  }

  return fetchJsonStrict<AssetCandlesResponse>(
    resolveApiUrl(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`),
  );
}

export async function fetchAssetFundamentalsApi(
  symbolOrId: string,
): Promise<AssetFundamentals> {
  const symbol = resolveCanonicalSymbol(symbolOrId);
  if (!isValidTickerSymbol(symbol)) {
    throw new Error(`Ungültiges Symbol: ${symbol}`);
  }

  if (getApiMode() === 'static-snapshot') {
    const key = sanitizeSymbolFileKey(symbol);
    const url = `${getViteBasePath()}static-api/fundamentals/${key}.json`;
    try {
      return await fetchJsonStrict<AssetFundamentals>(url);
    } catch {
      return {
        symbol,
        quoteType: null,
        currency: null,
        sector: null,
        industry: null,
        marketCap: null,
        totalAssets: null,
        circulatingSupply: null,
        expenseRatioPercent: null,
        beta: null,
        fiftyTwoWeekLow: null,
        fiftyTwoWeekHigh: null,
        nextEarningsDate: null,
        valuation: {
          trailingPE: null,
          forwardPE: null,
          priceToBook: null,
          priceToSales: null,
          pegRatio: null,
          evToEbitda: null,
          trailingEps: null,
          forwardEps: null,
        },
        growthAndQuality: {
          earningsGrowthPercent: null,
          revenueGrowthPercent: null,
          returnOnEquityPercent: null,
          profitMarginPercent: null,
          operatingMarginPercent: null,
          debtToEquityPercent: null,
          freeCashflow: null,
        },
        dividend: {
          yieldPercent: null,
          annualRate: null,
          payoutRatioPercent: null,
          fiveYearAvgYieldPercent: null,
          exDividendDate: null,
          cagr5yPercent: null,
          consecutiveYears: 0,
          annualHistory: [],
        },
        analyst: {
          recommendationKey: null,
          recommendationLabel: null,
          recommendationMean: null,
          numberOfAnalysts: null,
          targetLow: null,
          targetMean: null,
          targetHigh: null,
          upsidePercent: null,
          breakdown: null,
        },
        updatedAt: new Date().toISOString(),
        stale: true,
      };
    }
  }

  return fetchJsonStrict<AssetFundamentals>(
    resolveApiUrl(`/api/market/fundamentals?symbol=${encodeURIComponent(symbol)}`),
  );
}

// --- Browser-only multi-profile fallback (used on static GitHub Pages before Firebase is configured) ---

const BROWSER_STORE_KEY = 'dashinvest-browser-profiles-v1';
const memoryFallbackStorage = new Map<string, string>();

interface BrowserUserEntry {
  profile: UserProfileSummary;
  passwordDigest: string;
  workspace: PersistedWorkspaceState | null;
}

interface BrowserProfileDb {
  activeUserId: string | null;
  users: BrowserUserEntry[];
}

function getStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (k) => memoryFallbackStorage.get(k) ?? null,
    setItem: (k, v) => {
      memoryFallbackStorage.set(k, v);
    },
  };
}

function digestLocalSecret(secret: string): string {
  // Simple deterministic salted digest for browser-local profile switching convenience
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const input = `dashinvest:${secret}`;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}-${h2.toString(16)}`;
}

function loadBrowserDb(): BrowserProfileDb {
  try {
    const raw = getStorage().getItem(BROWSER_STORE_KEY);
    if (!raw) return { activeUserId: null, users: [] };
    const parsed = JSON.parse(raw) as BrowserProfileDb;
    if (!Array.isArray(parsed.users)) return { activeUserId: null, users: [] };
    return parsed;
  } catch {
    return { activeUserId: null, users: [] };
  }
}

function saveBrowserDb(db: BrowserProfileDb): void {
  getStorage().setItem(BROWSER_STORE_KEY, JSON.stringify(db));
}

export const browserProfileStore = {
  listProfiles(): UserProfileSummary[] {
    return loadBrowserDb()
      .users.map((u) => u.profile)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  getActiveSession(): {
    user: UserProfileSummary;
    workspace: PersistedWorkspaceState | null;
  } | null {
    const db = loadBrowserDb();
    if (!db.activeUserId) return null;
    const found = db.users.find((u) => u.profile.id === db.activeUserId);
    if (!found) return null;
    return { user: found.profile, workspace: found.workspace };
  },

  register(input: {
    username: string;
    displayName?: string;
    password: string;
    avatarColor?: string;
    initialWorkspace?: PersistedWorkspaceState | null;
  }): { user: UserProfileSummary; workspace: PersistedWorkspaceState | null } {
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,32}$/.test(username)) {
      throw new Error('Benutzername muss 2–32 Zeichen lang sein (a–z, 0–9, ., _, -).');
    }
    if (!input.password || input.password.length < 4) {
      throw new Error('Passwort muss mindestens 4 Zeichen lang sein.');
    }
    const db = loadBrowserDb();
    if (db.users.some((u) => u.profile.username === username)) {
      throw new Error(`Profil „${username}“ existiert bereits.`);
    }

    const now = new Date().toISOString();
    const profile: UserProfileSummary = {
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      username,
      displayName: (input.displayName ?? '').trim().slice(0, 40) || username,
      avatarColor: input.avatarColor || '#38bdf8',
      provider: 'browser',
      createdAt: now,
      updatedAt: now,
    };
    const workspace = input.initialWorkspace ?? null;
    db.users.push({
      profile,
      passwordDigest: digestLocalSecret(input.password),
      workspace,
    });
    db.activeUserId = profile.id;
    saveBrowserDb(db);
    return { user: profile, workspace };
  },

  login(
    rawUsername: string,
    password: string,
  ): { user: UserProfileSummary; workspace: PersistedWorkspaceState | null } {
    const username = rawUsername.trim().toLowerCase();
    const db = loadBrowserDb();
    const found = db.users.find((u) => u.profile.username === username);
    if (!found || found.passwordDigest !== digestLocalSecret(password)) {
      throw new Error('Benutzername oder Passwort ungültig.');
    }
    db.activeUserId = found.profile.id;
    saveBrowserDb(db);
    return { user: found.profile, workspace: found.workspace };
  },

  logout(): void {
    const db = loadBrowserDb();
    db.activeUserId = null;
    saveBrowserDb(db);
  },

  saveWorkspace(userId: string, workspace: PersistedWorkspaceState): { savedAt: string } {
    const db = loadBrowserDb();
    const idx = db.users.findIndex((u) => u.profile.id === userId);
    if (idx < 0) throw new Error('Benutzerprofil nicht gefunden.');
    const savedAt = new Date().toISOString();
    db.users[idx].workspace = workspace;
    db.users[idx].profile = { ...db.users[idx].profile, updatedAt: savedAt };
    saveBrowserDb(db);
    return { savedAt };
  },

  updateProfile(
    userId: string,
    patch: { displayName?: string; avatarColor?: string },
  ): UserProfileSummary {
    const db = loadBrowserDb();
    const idx = db.users.findIndex((u) => u.profile.id === userId);
    if (idx < 0) throw new Error('Benutzerprofil nicht gefunden.');
    const cur = db.users[idx].profile;
    const next: UserProfileSummary = {
      ...cur,
      displayName:
        typeof patch.displayName === 'string' && patch.displayName.trim()
          ? patch.displayName.trim().slice(0, 40)
          : cur.displayName,
      avatarColor: patch.avatarColor ?? cur.avatarColor,
      updatedAt: new Date().toISOString(),
    };
    db.users[idx].profile = next;
    saveBrowserDb(db);
    return next;
  },

  deleteProfile(userId: string, password: string): void {
    const db = loadBrowserDb();
    const target = db.users.find((u) => u.profile.id === userId);
    if (!target || target.passwordDigest !== digestLocalSecret(password)) {
      throw new Error('Passwort zur Bestätigung ist falsch.');
    }
    db.users = db.users.filter((u) => u.profile.id !== userId);
    if (db.activeUserId === userId) db.activeUserId = null;
    saveBrowserDb(db);
  },
};

import express from 'express';
import cors from 'cors';
import {
  isValidTickerSymbol,
  resolveCanonicalSymbol,
} from '../shared/catalog.ts';
import type {
  PersistedWorkspaceState,
  QuoteSummary,
  Timeframe,
} from '../shared/types.ts';
import { TtlCache } from './cache.ts';
import { buildMacroOverview } from './macroOverview.ts';
import { ProfileStore, ProfileStoreError } from './profileStore.ts';
import type { MacroDataProvider, MarketDataProvider } from './providers/types.ts';
import { YahooFinanceProvider } from './providers/yahooProvider.ts';
import { FredProvider } from './providers/fredProvider.ts';

export { buildMacroOverview };

const VALID_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1d', '1w'];

export interface CreateAppOptions {
  yahoo?: MarketDataProvider;
  fred?: MacroDataProvider;
  overviewTtlMs?: number;
  profileStore?: ProfileStore;
  dataDir?: string;
}

const SESSION_COOKIE = 'dashinvest_session';
const SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const rawVal = part.slice(eq + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

function sendProfileError(res: express.Response, err: unknown): void {
  if (err instanceof ProfileStoreError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  res.status(500).json({
    error: err instanceof Error ? err.message : 'Interner Profilfehler',
  });
}

export function createApp(options: CreateAppOptions = {}) {
  const yahoo = options.yahoo ?? new YahooFinanceProvider();
  const fred = options.fred ?? new FredProvider();
  const overviewTtlMs = options.overviewTtlMs ?? 5 * 60_000;
  const overviewCache = new TtlCache();
  const profileStore = options.profileStore ?? new ProfileStore(options.dataDir);

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  const readSessionToken = (req: express.Request): string | undefined => {
    const cookies = parseCookies(req.headers.cookie);
    return cookies[SESSION_COOKIE];
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'dashinvest-api', timestamp: new Date().toISOString() });
  });

  // --- User Profile, Auth & Continuous Workspace Persistence ---
  app.get('/api/auth/profiles', (_req, res) => {
    res.json({ profiles: profileStore.listPublicProfiles() });
  });

  app.get('/api/auth/me', (req, res) => {
    const token = readSessionToken(req);
    const session = profileStore.getSession(token);
    if (!session) {
      res.json({ authenticated: false, user: null, workspace: null });
      return;
    }
    res.json({
      authenticated: true,
      user: session.user,
      workspace: session.workspace,
    });
  });

  app.post('/api/auth/register', (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        username?: string;
        displayName?: string;
        password?: string;
        avatarColor?: string;
        initialWorkspace?: PersistedWorkspaceState | null;
      };
      const result = profileStore.register({
        username: String(body.username ?? ''),
        displayName: body.displayName,
        password: String(body.password ?? ''),
        avatarColor: body.avatarColor,
        initialWorkspace: body.initialWorkspace ?? null,
      });
      res.cookie(SESSION_COOKIE, result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE_MS,
      });
      res.status(201).json({
        authenticated: true,
        user: result.user,
        workspace: result.workspace,
      });
    } catch (err) {
      sendProfileError(res, err);
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const body = (req.body ?? {}) as { username?: string; password?: string };
      const result = profileStore.login(
        String(body.username ?? ''),
        String(body.password ?? ''),
      );
      res.cookie(SESSION_COOKIE, result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE_MS,
      });
      res.json({
        authenticated: true,
        user: result.user,
        workspace: result.workspace,
      });
    } catch (err) {
      sendProfileError(res, err);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = readSessionToken(req);
    profileStore.logout(token);
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    res.json({ ok: true });
  });

  app.put('/api/profile/workspace', (req, res) => {
    const session = profileStore.getSession(readSessionToken(req));
    if (!session) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }
    try {
      const result = profileStore.saveWorkspace(
        session.user.id,
        req.body as PersistedWorkspaceState,
      );
      res.json(result);
    } catch (err) {
      sendProfileError(res, err);
    }
  });

  app.patch('/api/profile', (req, res) => {
    const session = profileStore.getSession(readSessionToken(req));
    if (!session) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }
    try {
      const body = (req.body ?? {}) as { displayName?: string; avatarColor?: string };
      const user = profileStore.updateProfile(session.user.id, body);
      res.json({ user });
    } catch (err) {
      sendProfileError(res, err);
    }
  });

  app.delete('/api/profile', (req, res) => {
    const session = profileStore.getSession(readSessionToken(req));
    if (!session) {
      res.status(401).json({ error: 'Nicht angemeldet.' });
      return;
    }
    try {
      const body = (req.body ?? {}) as { password?: string };
      profileStore.deleteProfile(session.user.id, String(body.password ?? ''));
      res.clearCookie(SESSION_COOKIE, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      res.json({ ok: true });
    } catch (err) {
      sendProfileError(res, err);
    }
  });

  app.get('/api/market/search', async (req, res) => {
    const query = String(req.query.q ?? '').trim();
    if (query.length < 1) {
      res.json({ query, results: [] });
      return;
    }
    try {
      const results = await yahoo.searchSymbols(query);
      res.json({ query, results });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Fehler bei der Wertpapiersuche',
      });
    }
  });

  app.get('/api/market/quotes', async (req, res) => {
    const rawSymbols = typeof req.query.symbols === 'string' ? req.query.symbols.trim() : '';

    if (!rawSymbols) {
      try {
        const ids = ['GOLD', 'SILVER', 'SP500', 'NASDAQ100', 'DXY', 'US10Y'];
        const quotes = await Promise.all(ids.map((id) => yahoo.getQuote(id)));
        res.json({ quotes, failed: [], updatedAt: new Date().toISOString() });
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Fehler beim Abrufen der Marktdaten',
        });
      }
      return;
    }

    const requested = Array.from(
      new Set(
        rawSymbols
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && isValidTickerSymbol(s))
          .map((s) => resolveCanonicalSymbol(s)),
      ),
    ).slice(0, 45);

    if (requested.length === 0) {
      res.status(400).json({ error: 'Keine gültigen Ticker-Symbole angegeben' });
      return;
    }

    const quotes: QuoteSummary[] = [];
    const failed: string[] = [];

    // Fetch in gentle batches of 6 so one bad ticker never fails the batch
    for (let i = 0; i < requested.length; i += 6) {
      const chunk = requested.slice(i, i + 6);
      const settled = await Promise.allSettled(chunk.map((sym) => yahoo.getQuote(sym)));
      settled.forEach((outcome, idx) => {
        if (outcome.status === 'fulfilled') {
          quotes.push(outcome.value);
        } else {
          failed.push(chunk[idx]);
        }
      });
    }

    res.json({ quotes, failed, updatedAt: new Date().toISOString() });
  });

  const handleCandlesRequest = async (
    rawInput: string,
    tfQuery: unknown,
    res: express.Response,
  ) => {
    const tfParam = (typeof tfQuery === 'string' ? tfQuery : undefined)?.toLowerCase() as
      | Timeframe
      | undefined;
    const timeframe: Timeframe = tfParam && VALID_TIMEFRAMES.includes(tfParam) ? tfParam : '1d';

    if (!rawInput || !isValidTickerSymbol(rawInput)) {
      res.status(400).json({ error: `Ungültiges Symbol: ${rawInput}` });
      return;
    }

    const symbol = resolveCanonicalSymbol(rawInput);

    try {
      const [candles, quote] = await Promise.all([
        yahoo.getCandles(symbol, timeframe),
        yahoo.getQuote(symbol),
      ]);
      res.json({ assetId: rawInput, symbol, timeframe, quote, candles });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : `Fehler beim Laden von ${symbol}`,
      });
    }
  };

  app.get('/api/market/candles', async (req, res) => {
    const symbol = String(req.query.symbol ?? '').trim();
    await handleCandlesRequest(symbol, req.query.tf, res);
  });

  app.get('/api/market/candles/:assetId', async (req, res) => {
    await handleCandlesRequest(req.params.assetId, req.query.tf, res);
  });

  app.get('/api/market/fundamentals', async (req, res) => {
    const rawSymbol = String(req.query.symbol ?? '').trim();
    if (!rawSymbol || !isValidTickerSymbol(rawSymbol)) {
      res.status(400).json({ error: `Ungültiges Symbol: ${rawSymbol}` });
      return;
    }

    const symbol = resolveCanonicalSymbol(rawSymbol);
    try {
      const fundamentals = await yahoo.getFundamentals(symbol);
      res.json(fundamentals);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : `Fehler beim Laden der Fundamentaldaten für ${symbol}`,
      });
    }
  });

  app.get('/api/macro/overview', async (_req, res) => {
    try {
      const { data, stale } = await overviewCache.getOrLoad(
        'macro:overview',
        overviewTtlMs,
        () => buildMacroOverview(yahoo, fred),
      );
      res.json({ ...data, stale });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Fehler beim Abrufen der Makrodaten',
      });
    }
  });

  return app;
}

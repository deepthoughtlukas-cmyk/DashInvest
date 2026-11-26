import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import {
  isValidTickerSymbol,
  resolveCanonicalSymbol,
} from '../shared/catalog.ts';
import type {
  QuoteSummary,
  Timeframe,
} from '../shared/types.ts';
import { TtlCache } from './cache.ts';
import { buildMacroOverview } from './macroOverview.ts';
import type { MacroDataProvider, MarketDataProvider } from './providers/types.ts';
import { YahooFinanceProvider } from './providers/yahooProvider.ts';
import { FredProvider } from './providers/fredProvider.ts';

export { buildMacroOverview };

const VALID_TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1d', '1w'];

export interface CreateAppOptions {
  yahoo?: MarketDataProvider;
  fred?: MacroDataProvider;
  overviewTtlMs?: number;
  pattyDir?: string;
  pattyDirs?: string[];
  allowedOrigins?: string[];
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

function buildAllowedOriginSet(customOrigins?: string[]): Set<string> {
  const envOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins, ...(customOrigins ?? [])]);
}

export function sanitizePattyWorkspaceJson(
  rawContent: string,
  options?: { includeCostBasis?: boolean },
): string {
  const includeCostBasis = Boolean(options?.includeCostBasis);
  const parsed = JSON.parse(rawContent) as {
    version?: unknown;
    timestamp?: unknown;
    investments?: unknown;
    rules?: unknown;
  };
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.investments)
  ) {
    throw new Error('Invalid Patty workspace format');
  }

  const sanitizedInvestments = parsed.investments
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((inv) => {
      const currentVal = Number(inv.currentValue) || 0;
      const qty = Number(inv.quantity) || 0;
      const isActive = currentVal >= 0.05 && (qty > 0 || currentVal >= 1);
      const rawPurchasePrice = Number(inv.purchasePrice);
      const validPurchasePrice =
        includeCostBasis && Number.isFinite(rawPurchasePrice) && rawPurchasePrice > 0
          ? rawPurchasePrice
          : undefined;
      const customName =
        typeof inv.customName === 'string' && inv.customName.trim() ? inv.customName.trim() : undefined;
      const originalName =
        typeof inv._originalName === 'string' && inv._originalName.trim()
          ? inv._originalName.trim()
          : undefined;
      return {
        name: typeof inv.name === 'string' ? inv.name : '',
        ...(customName ? { customName } : {}),
        ...(originalName ? { _originalName: originalName } : {}),
        isin: typeof inv.isin === 'string' ? inv.isin : '',
        type: typeof inv.type === 'string' ? inv.type : 'Aktien',
        quantity: isActive ? 1 : 0,
        ...(validPurchasePrice !== undefined ? { purchasePrice: validPurchasePrice } : {}),
        currentValue: isActive ? 1 : 0,
        currency: typeof inv.currency === 'string' ? inv.currency : 'EUR',
        category: typeof inv.category === 'string' ? inv.category : 'Stocks',
        subcategory: typeof inv.subcategory === 'string' ? inv.subcategory : 'General',
      };
    });

  const sanitizedRules = Array.isArray(parsed.rules)
    ? parsed.rules
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((rule) => {
          const customName =
            typeof rule.customName === 'string' && rule.customName.trim()
              ? rule.customName.trim()
              : undefined;
          const subcategory =
            typeof rule.subcategory === 'string' && rule.subcategory.trim()
              ? rule.subcategory.trim()
              : undefined;
          return {
            isin: typeof rule.isin === 'string' ? rule.isin : '',
            name: typeof rule.name === 'string' ? rule.name : '',
            ...(customName ? { customName } : {}),
            category: typeof rule.category === 'string' ? rule.category : 'Stocks',
            ...(subcategory ? { subcategory } : {}),
          };
        })
    : [];

  return JSON.stringify({
    version: 1,
    timestamp:
      typeof parsed.timestamp === 'string' ? parsed.timestamp : new Date().toISOString(),
    investments: sanitizedInvestments,
    rules: sanitizedRules,
  });
}

export function createApp(options: CreateAppOptions = {}) {
  const yahoo = options.yahoo ?? new YahooFinanceProvider();
  const fred = options.fred ?? new FredProvider();
  const overviewTtlMs = options.overviewTtlMs ?? 5 * 60_000;
  const overviewCache = new TtlCache();
  const pattySearchDirs = (() => {
    if (options.pattyDirs && options.pattyDirs.length > 0) {
      return options.pattyDirs;
    }
    if (options.pattyDir) {
      return [options.pattyDir];
    }
    const envDir = process.env.PATTY_DIR?.trim();
    if (envDir) {
      return envDir
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [
      path.join(os.homedir(), 'Downloads'),
      path.resolve(process.cwd(), '../Stockpicker'),
    ];
  })();
  const allowedOriginSet = buildAllowedOriginSet(options.allowedOrigins);

  const app = express();
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOriginSet.has(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'dashinvest-api', timestamp: new Date().toISOString() });
  });

  app.get('/api/patty/local-workspace', (req, res) => {
    try {
      const includeCostBasis =
        req.query.includeCostBasis === '1' || req.query.includeCostBasis === 'true';

      const candidates: Array<{
        name: string;
        dir: string;
        fullPath: string;
        stat: fs.Stats;
      }> = [];

      for (const dir of pattySearchDirs) {
        if (!dir || !fs.existsSync(dir)) continue;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of entries) {
          if (!e.isFile() || !/^patty-workspace.*\.json$/i.test(e.name)) continue;
          const fullPath = path.join(dir, e.name);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 0 && stat.size <= 10 * 1024 * 1024) {
              candidates.push({ name: e.name, dir, fullPath, stat });
            }
          } catch {
            // ignore unreadable file
          }
        }
      }

      candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

      if (candidates.length === 0) {
        res.json({ found: false });
        return;
      }

      const newest = candidates[0];
      const content = fs.readFileSync(newest.fullPath, 'utf-8');
      const encrypted = !content.trim().startsWith('{');
      const responseContent = encrypted
        ? content
        : sanitizePattyWorkspaceJson(content, { includeCostBasis });
      res.json({
        found: true,
        filename: newest.name,
        folderLabel: path.basename(newest.dir),
        updatedAt: new Date(newest.stat.mtimeMs).toISOString(),
        encrypted,
        sanitized: !encrypted,
        content: responseContent,
      });
    } catch {
      res.json({ found: false });
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

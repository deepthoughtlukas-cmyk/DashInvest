import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CATALOG_ASSETS } from '../shared/catalog.ts';
import type { QuoteSummary } from '../shared/types.ts';
import { buildMacroOverview } from '../server/macroOverview.ts';
import { FredProvider } from '../server/providers/fredProvider.ts';
import { YahooFinanceProvider } from '../server/providers/yahooProvider.ts';

function sanitizeKey(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Za-z0-9.-]/g, '_');
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

async function run() {
  const outDir = path.resolve(process.cwd(), 'public', 'static-api');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const yahoo = new YahooFinanceProvider();
  const fred = new FredProvider();

  console.log('[snapshot] Building /static-api/macro-overview.json …');
  try {
    const overview = await buildMacroOverview(yahoo, fred);
    writeJson(path.join(outDir, 'macro-overview.json'), { ...overview, stale: false });
    console.log('[snapshot] Saved macro-overview.json');
  } catch (err) {
    console.warn('[snapshot] Macro overview failed:', err);
  }

  console.log(`[snapshot] Fetching quotes for ${DEFAULT_CATALOG_ASSETS.length} catalog assets …`);
  const quotes: QuoteSummary[] = [];
  for (let i = 0; i < DEFAULT_CATALOG_ASSETS.length; i += 6) {
    const chunk = DEFAULT_CATALOG_ASSETS.slice(i, i + 6);
    const settled = await Promise.allSettled(chunk.map((a) => yahoo.getQuote(a.symbol)));
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') quotes.push(outcome.value);
    }
  }
  const quoteBySymbol = new Map(quotes.map((q) => [q.symbol, q]));
  writeJson(path.join(outDir, 'quotes.json'), {
    quotes,
    updatedAt: new Date().toISOString(),
  });
  console.log(`[snapshot] Saved ${quotes.length} quotes`);

  console.log('[snapshot] Fetching 1D candles & fundamentals for starter catalog …');
  let candleCount = 0;
  let fundCount = 0;

  for (let i = 0; i < DEFAULT_CATALOG_ASSETS.length; i += 4) {
    const chunk = DEFAULT_CATALOG_ASSETS.slice(i, i + 4);
    await Promise.allSettled(
      chunk.map(async (asset) => {
        const key = sanitizeKey(asset.symbol);
        const [dailyRes, fundRes] = await Promise.allSettled([
          yahoo.getCandles(asset.symbol, '1d'),
          yahoo.getFundamentals(asset.symbol),
        ]);

        const quote = quoteBySymbol.get(asset.symbol);
        if (dailyRes.status === 'fulfilled' && quote) {
          writeJson(path.join(outDir, 'candles', `${key}_1d.json`), {
            assetId: asset.symbol,
            symbol: asset.symbol,
            timeframe: '1d',
            quote,
            candles: dailyRes.value,
          });
          candleCount++;
        }

        if (fundRes.status === 'fulfilled') {
          writeJson(path.join(outDir, 'fundamentals', `${key}.json`), fundRes.value);
          fundCount++;
        }
      }),
    );
  }

  // Also fetch 1W candles for default bookmarked assets
  const bookmarked = DEFAULT_CATALOG_ASSETS.filter((a) => a.bookmarked);
  await Promise.allSettled(
    bookmarked.map(async (asset) => {
      const candles = await yahoo.getCandles(asset.symbol, '1w');
      const quote = quoteBySymbol.get(asset.symbol);
      if (quote) {
        const key = sanitizeKey(asset.symbol);
        writeJson(path.join(outDir, 'candles', `${key}_1w.json`), {
          assetId: asset.symbol,
          symbol: asset.symbol,
          timeframe: '1w',
          quote,
          candles,
        });
      }
    }),
  );

  writeJson(path.join(outDir, 'meta.json'), {
    generatedAt: new Date().toISOString(),
    quotes: quotes.length,
    candles1d: candleCount,
    fundamentals: fundCount,
  });

  console.log(
    `[snapshot] Done: ${quotes.length} quotes, ${candleCount} daily charts, ${fundCount} fundamentals`,
  );
}

run().catch((err) => {
  console.error('[snapshot] Fatal error:', err);
  process.exit(1);
});

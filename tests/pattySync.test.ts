import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.ts';
import type { SymbolSearchResult } from '../shared/types.ts';
import { fetchQuotesApi } from '../src/services/apiClient.ts';
import {
  PattyPinRequiredError,
  buildPattySyncMeta,
  isEncryptedPattyPayload,
  isPattyInvestmentActive,
  md5Bytes,
  normalizePattyInvestments,
  parsePattyWorkspaceText,
  resolvePattyInvestments,
  type PattyInvestment,
} from '../src/services/pattySync.ts';
import { useDashboardStore } from '../src/store/dashboardStore.ts';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function encryptOpenSslAes256Cbc(plaintext: string, passphrase: string): string {
  const salt = crypto.randomBytes(8);
  const passBuf = Buffer.from(passphrase, 'utf8');
  const d1 = crypto.createHash('md5').update(Buffer.concat([passBuf, salt])).digest();
  const d2 = crypto.createHash('md5').update(Buffer.concat([d1, passBuf, salt])).digest();
  const d3 = crypto.createHash('md5').update(Buffer.concat([d2, passBuf, salt])).digest();
  const key = Buffer.concat([d1, d2]);
  const iv = d3;

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from('Salted__', 'ascii'), salt, encrypted]).toString('base64');
}

describe('Patty Sync Service, Encryption, Store & Endpoint', () => {
  beforeEach(() => {
    useDashboardStore.getState().resetWorkspaceToDefaults();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('computes RFC-1321 MD5 correctly and decrypts CryptoJS/OpenSSL PIN-encrypted Patty backups', async () => {
    expect(toHex(md5Bytes(new TextEncoder().encode('')))).toBe(
      'd41d8cd98f00b204e9800998ecf8427e',
    );
    expect(toHex(md5Bytes(new TextEncoder().encode('abc')))).toBe(
      '900150983cd24fb0d6963f7d28e17f72',
    );

    const payload = JSON.stringify({
      version: 1,
      timestamp: '2026-11-25T10:00:00.000Z',
      investments: [
        {
          name: 'NVIDIA CORP.',
          isin: 'US67066G1040',
          type: 'Aktien',
          quantity: 5,
          currentValue: 650,
          currency: 'EUR',
          category: 'Stocks',
          subcategory: 'AI',
        },
      ],
      rules: [],
    });

    const plainParsed = await parsePattyWorkspaceText(payload);
    expect(plainParsed.investments).toHaveLength(1);
    expect(isEncryptedPattyPayload(payload)).toBe(false);

    const encrypted = encryptOpenSslAes256Cbc(payload, '123456');
    expect(isEncryptedPattyPayload(encrypted)).toBe(true);

    await expect(parsePattyWorkspaceText(encrypted)).rejects.toBeInstanceOf(PattyPinRequiredError);
    await expect(parsePattyWorkspaceText(encrypted, '999999')).rejects.toThrow(/Falscher PIN/);

    const decrypted = await parsePattyWorkspaceText(encrypted, '123456');
    expect(decrypted.version).toBe(1);
    expect(decrypted.investments?.[0]?.isin).toBe('US67066G1040');
  });

  it('applies Patty user rules and filters zero-quantity/zero-value positions unless enabled', () => {
    const raw: PattyInvestment[] = [
      {
        name: 'APPLE INC.',
        _originalName: 'APPLE INC.',
        isin: 'US0378331005',
        type: 'Aktien',
        quantity: 10,
        currentValue: 2200,
        currency: 'EUR',
        category: 'Stocks',
        subcategory: 'General',
      },
      {
        name: 'SOLD STOCK',
        isin: 'US0000000001',
        type: 'Aktien',
        quantity: 0,
        currentValue: 0,
        currency: 'EUR',
        category: 'Stocks',
        subcategory: 'Basic',
      },
    ];

    const rules = [
      {
        isin: 'US0378331005',
        name: 'APPLE INC.',
        customName: 'Apple Custom',
        category: 'Stocks',
        subcategory: 'AI',
      },
    ];

    const activeOnly = normalizePattyInvestments(raw, rules, false);
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0].displayName).toBe('Apple Custom');
    expect(activeOnly[0].subcategory).toBe('AI');

    const withSold = normalizePattyInvestments(raw, rules, true);
    expect(withSold).toHaveLength(2);
  });

  it('resolves ISINs with exchange ranking, static maps, deduplication, skips certificates, and builds folder hierarchy', async () => {
    const investments = normalizePattyInvestments(
      [
        {
          name: 'SIEMENS AG',
          isin: 'DE0007236101',
          type: 'Aktien',
          quantity: 3,
          currentValue: 550,
          currency: 'EUR',
          category: 'Stocks',
          subcategory: 'Basic',
        },
        {
          name: 'DT.BOERSE COM. XETRA-GOLD',
          isin: 'DE000A0S9GB0',
          type: 'Edelmetalle',
          quantity: 10,
          currentValue: 1200,
          currency: 'EUR',
          category: 'Safe-Haven Gold',
          subcategory: 'ETF',
        },
        {
          name: 'Ethereum',
          isin: 'BPNDA5X00000',
          type: 'Fremdwährungen',
          quantity: 1,
          currentValue: 2000,
          currency: 'EUR',
          category: 'Altcoins',
          subcategory: 'Ethereum',
        },
        {
          name: 'Ethereum',
          isin: 'N/A',
          type: 'Fremdwährungen',
          quantity: 0.2,
          currentValue: 400,
          currency: 'EUR',
          category: 'Altcoins',
          subcategory: 'General',
        },
        {
          name: 'MS CO.I. MINIL',
          isin: 'DE000MG197A3',
          type: 'Aktien',
          quantity: 40,
          currentValue: 700,
          currency: 'EUR',
          category: 'Performance Gold',
          subcategory: 'Silberminen',
        },
        {
          name: 'CUSTOM OVERRIDE CORP',
          isin: 'XX000CUSTOM1',
          type: 'Aktien',
          quantity: 2,
          currentValue: 300,
          currency: 'EUR',
          category: 'Stocks',
          subcategory: 'Defence',
        },
      ],
      [],
      false,
    );

    const searchFn = vi.fn(async (query: string): Promise<SymbolSearchResult[]> => {
      if (query === 'DE0007236101') {
        return [
          {
            symbol: 'DE0007236101.SG',
            name: 'Siemens AG Stuttgart',
            shortName: 'Siemens',
            quoteType: 'EQUITY',
            exchange: 'Stuttgart',
            assetClass: 'equities',
            decimals: 2,
            unit: 'EUR',
          },
          {
            symbol: 'SIE.DE',
            name: 'Siemens AG',
            shortName: 'Siemens',
            quoteType: 'EQUITY',
            exchange: 'XETRA',
            assetClass: 'equities',
            decimals: 2,
            unit: 'EUR',
          },
        ];
      }
      return [];
    });

    const result = await resolvePattyInvestments({
      investments,
      overrides: { XX000CUSTOM1: 'RHM.DE' },
      searchFn,
    });

    // Override XX000CUSTOM1 should not trigger searchFn
    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledWith('DE0007236101');

    // Deduplicated: SIE.DE, 4GLD.DE, ETH-USD (once!), RHM.DE
    expect(result.assets.map((a) => a.symbol).sort()).toEqual([
      '4GLD.DE',
      'ETH-USD',
      'RHM.DE',
      'SIE.DE',
    ]);
    expect(result.assets.every((a) => a.bookmarked && a.source === 'patty')).toBe(true);

    // Certificate MS CO.I. MINIL is skipped cleanly as unresolved
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].pattyKey).toBe('DE000MG197A3');

    // Check folder hierarchy: Patty -> Stocks -> Basic / Defence, Safe-Haven Gold -> ETF, Altcoins -> Ethereum
    const folderNames = result.folders.map((f) => f.name);
    expect(folderNames).toContain('Patty');
    expect(folderNames).toContain('Stocks');
    expect(folderNames).toContain('Basic');
    expect(folderNames).toContain('Defence');
    expect(folderNames).toContain('Safe-Haven Gold');
    expect(folderNames).toContain('Altcoins');
    expect(folderNames).toContain('Ethereum');

    const ethAsset = result.assets.find((a) => a.symbol === 'ETH-USD');
    expect(ethAsset?.folderId).toBe('patty-sub-altcoins-ethereum');
  });

  it('syncs into dashboardStore non-destructively, prunes on re-sync, and restores defaults on clearPattySync', () => {
    const store = useDashboardStore.getState();
    const customFolderId = store.createFolder('Mein Eigener Ordner', null, '#38bdf8');
    store.addAssetToCatalog({
      symbol: 'AMD',
      name: 'AMD Inc.',
      shortName: 'AMD',
      assetClass: 'equities',
      unit: 'USD',
      decimals: 2,
      folderId: customFolderId,
      bookmarked: true,
    });

    const folders1 = [
      { id: 'patty-root', name: 'Patty', parentId: null, color: '#f59e0b', collapsed: false, source: 'patty' as const },
      { id: 'patty-cat-stocks', name: 'Stocks', parentId: 'patty-root', color: '#60a5fa', collapsed: false, source: 'patty' as const },
      { id: 'patty-sub-stocks-ai', name: 'AI', parentId: 'patty-cat-stocks', color: '#93c5fd', collapsed: false, source: 'patty' as const },
    ];
    const assets1 = [
      {
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        shortName: 'NVIDIA',
        assetClass: 'equities' as const,
        unit: 'USD',
        decimals: 2,
        folderId: 'patty-sub-stocks-ai',
        bookmarked: true,
        isin: 'US67066G1040',
        source: 'patty' as const,
      },
      {
        symbol: 'RHM.DE',
        name: 'Rheinmetall AG',
        shortName: 'Rheinmetall',
        assetClass: 'equities' as const,
        unit: 'EUR',
        decimals: 2,
        folderId: 'patty-sub-stocks-ai',
        bookmarked: true,
        isin: 'DE0007030009',
        source: 'patty' as const,
      },
    ];

    const meta1 = buildPattySyncMeta(
      'upload',
      'test.json',
      { folders: folders1, assets: assets1, unresolved: [], overrides: { DE0007030009: 'RHM.DE' }, costBasis: {}, totalNormalized: 2 },
      false,
    );

    useDashboardStore.getState().syncPattyPortfolio({
      folders: folders1,
      assets: assets1,
      overrides: { DE0007030009: 'RHM.DE' },
      meta: meta1,
    });

    let next = useDashboardStore.getState();
    expect(next.folders.some((f) => f.id === customFolderId)).toBe(true);
    expect(next.catalogAssets.some((a) => a.symbol === 'AMD' && a.folderId === customFolderId)).toBe(true);
    expect(next.catalogAssets.find((a) => a.symbol === 'RHM.DE')?.bookmarked).toBe(true);
    expect(next.catalogAssets.find((a) => a.symbol === 'NVDA')?.folderId).toBe('patty-sub-stocks-ai');
    expect(next.pattyLastSync?.syncedCount).toBe(2);

    // Re-sync without RHM.DE -> RHM.DE removed, NVDA still present
    const meta2 = buildPattySyncMeta(
      'upload',
      'test2.json',
      { folders: folders1, assets: [assets1[0]], unresolved: [], overrides: {}, costBasis: {}, totalNormalized: 1 },
      false,
    );
    useDashboardStore.getState().syncPattyPortfolio({
      folders: folders1,
      assets: [assets1[0]],
      overrides: {},
      meta: meta2,
    });

    next = useDashboardStore.getState();
    expect(next.catalogAssets.some((a) => a.symbol === 'RHM.DE')).toBe(false);
    expect(next.catalogAssets.some((a) => a.symbol === 'NVDA')).toBe(true);

    // Clear Patty sync -> removes Patty folders, restores default NVDA back to folder-equities-us
    useDashboardStore.getState().clearPattySync();
    next = useDashboardStore.getState();
    expect(next.pattyLastSync).toBeNull();
    expect(next.folders.some((f) => f.id === 'patty-root')).toBe(false);
    expect(next.folders.some((f) => f.id === customFolderId)).toBe(true);
    expect(next.catalogAssets.find((a) => a.symbol === 'NVDA')?.folderId).toBe('folder-equities-us');
  });

  it('serves newest patty-workspace*.json via GET /api/patty/local-workspace', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashinvest-patty-'));
    const emptyDir = path.join(tmpDir, 'missing');
    const appMissing = createApp({ pattyDir: emptyDir });
    const srvMissing = http.createServer(appMissing);
    await new Promise<void>((r) => srvMissing.listen(0, '127.0.0.1', r));
    const urlMissing = `http://127.0.0.1:${(srvMissing.address() as AddressInfo).port}`;
    const resMissing = await fetch(`${urlMissing}/api/patty/local-workspace`);
    expect(await resMissing.json()).toEqual({ found: false });
    await new Promise<void>((r) => srvMissing.close(() => r()));

    const wsDir = path.join(tmpDir, 'stockpicker');
    fs.mkdirSync(wsDir, { recursive: true });
    const olderFile = path.join(wsDir, 'patty-workspace-2026-01-01.json');
    const newerFile = path.join(wsDir, 'patty-workspace-2026-05-16.json');
    fs.writeFileSync(olderFile, '{"version":1,"investments":[]}', 'utf-8');
    fs.writeFileSync(newerFile, 'U2FsdGVkX1+mockencryptedpayload', 'utf-8');
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(olderFile, past, past);

    const appFound = createApp({ pattyDir: wsDir });
    const srvFound = http.createServer(appFound);
    await new Promise<void>((r) => srvFound.listen(0, '127.0.0.1', r));
    const urlFound = `http://127.0.0.1:${(srvFound.address() as AddressInfo).port}`;
    const resFound = await fetch(`${urlFound}/api/patty/local-workspace`);
    const body = (await resFound.json()) as {
      found: boolean;
      filename?: string;
      encrypted?: boolean;
      sanitized?: boolean;
      content?: string;
    };
    expect(body.found).toBe(true);
    expect(body.filename).toBe('patty-workspace-2026-05-16.json');
    expect(body.encrypted).toBe(true);
    expect(body.sanitized).toBe(false);
    expect(body.content).toBe('U2FsdGVkX1+mockencryptedpayload');

    await new Promise<void>((r) => srvFound.close(() => r()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('strips sensitive financial amounts & private metadata on unencrypted /api/patty/local-workspace and enforces strict localhost CORS allowlist', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashinvest-patty-sec-'));
    const wsDir = path.join(tmpDir, 'stockpicker');
    fs.mkdirSync(wsDir, { recursive: true });

    const unencryptedFile = path.join(wsDir, 'patty-workspace-2026-05-16.json');
    fs.writeFileSync(
      unencryptedFile,
      JSON.stringify({
        version: 1,
        timestamp: '2026-05-16T11:02:18.675Z',
        investments: [
          {
            name: 'NVIDIA CORP.',
            isin: 'US67066G1040',
            wkn: '918422',
            type: 'Aktien',
            quantity: 42.5,
            purchasePrice: 88.12,
            currentPrice: 135.4,
            currentValue: 5754.5,
            currency: 'EUR',
            exchangeRate: 0.92,
            region: 'USA',
            sector: 'Semiconductors',
            category: 'Stocks',
            subcategory: 'AI',
          },
          {
            name: 'SOLD CORP.',
            isin: 'US0000000002',
            type: 'Aktien',
            quantity: 0,
            purchasePrice: 50,
            currentPrice: 60,
            currentValue: 0,
            currency: 'EUR',
            category: 'Stocks',
            subcategory: 'Basic',
          },
        ],
        rules: [
          {
            isin: 'US67066G1040',
            name: 'NVIDIA CORP.',
            customName: 'Nvidia',
            category: 'Stocks',
            subcategory: 'AI',
          },
        ],
        depositories: { US67066G1040: 'Trade Republic' },
        profiles: [{ id: 'secret-profile', name: 'Privat' }],
        splits: [{ assetKey: 'US67066G1040', parts: [] }],
      }),
      'utf-8',
    );

    const app = createApp({ pattyDir: wsDir });
    const srv = http.createServer(app);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

    // 1. Allowed localhost origin receives CORS header; untrusted origin does not
    const allowedRes = await fetch(`${url}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const blockedRes = await fetch(`${url}/api/patty/local-workspace`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(blockedRes.headers.get('access-control-allow-origin')).toBeNull();

    // 2. Unencrypted Patty workspace is sanitized server-side
    const body = (await blockedRes.json()) as {
      found: boolean;
      encrypted: boolean;
      sanitized: boolean;
      content: string;
    };
    expect(body.found).toBe(true);
    expect(body.encrypted).toBe(false);
    expect(body.sanitized).toBe(true);

    const parsed = JSON.parse(body.content) as Record<string, unknown>;
    expect(parsed.depositories).toBeUndefined();
    expect(parsed.profiles).toBeUndefined();
    expect(parsed.splits).toBeUndefined();

    const invs = parsed.investments as Array<Record<string, unknown>>;
    expect(invs).toHaveLength(2);
    expect(invs[0]).toEqual({
      name: 'NVIDIA CORP.',
      isin: 'US67066G1040',
      type: 'Aktien',
      quantity: 1,
      currentValue: 1,
      currency: 'EUR',
      category: 'Stocks',
      subcategory: 'AI',
    });
    expect(invs[0].purchasePrice).toBeUndefined();
    expect(invs[0].currentPrice).toBeUndefined();
    expect(invs[0].wkn).toBeUndefined();
    expect(invs[1].quantity).toBe(0);
    expect(invs[1].currentValue).toBe(0);

    const normalized = normalizePattyInvestments(
      invs as unknown as PattyInvestment[],
      parsed.rules as Array<{ isin: string; name: string; customName?: string; category: string; subcategory?: string }>,
      false,
    );
    expect(normalized).toHaveLength(1);
    expect(normalized[0].displayName).toBe('Nvidia');

    // 3. Opt-in includeCostBasis=1 exposes only positive purchasePrice while keeping quantity/currentValue/depositories stripped
    const cbRes = await fetch(`${url}/api/patty/local-workspace?includeCostBasis=1`);
    const cbBody = (await cbRes.json()) as {
      found: boolean;
      sanitized: boolean;
      content: string;
    };
    expect(cbBody.found).toBe(true);
    expect(cbBody.sanitized).toBe(true);
    const cbParsed = JSON.parse(cbBody.content) as Record<string, unknown>;
    expect(cbParsed.depositories).toBeUndefined();
    expect(cbParsed.profiles).toBeUndefined();
    const cbInvs = cbParsed.investments as Array<Record<string, unknown>>;
    expect(cbInvs[0].purchasePrice).toBe(88.12);
    expect(cbInvs[0].quantity).toBe(1);
    expect(cbInvs[0].currentValue).toBe(1);
    expect(cbInvs[0].currentPrice).toBeUndefined();

    // 4. Patty costBasis merges cleanly without overwriting manual cost basis, and clearPattySync preserves manual entries
    useDashboardStore.getState().setPersonalCostBasis('AAPL', {
      price: 150,
      currency: 'USD',
      source: 'manual',
    });
    const pattyNorm = normalizePattyInvestments(cbInvs as unknown as PattyInvestment[], [], false);
    const resolved = await resolvePattyInvestments({
      investments: pattyNorm,
      overrides: { US67066G1040: 'NVDA' },
    });
    expect(resolved.costBasis.NVDA?.price).toBe(88.12);

    useDashboardStore.getState().syncPattyPortfolio({
      folders: resolved.folders,
      assets: resolved.assets,
      overrides: resolved.overrides,
      meta: buildPattySyncMeta('local-file', 'patty.json', resolved, false),
      costBasis: resolved.costBasis,
    });
    expect(useDashboardStore.getState().personalCostBasis.NVDA?.source).toBe('patty');
    expect(useDashboardStore.getState().personalCostBasis.AAPL?.price).toBe(150);

    useDashboardStore.getState().clearPattySync();
    expect(useDashboardStore.getState().personalCostBasis.NVDA).toBeUndefined();
    expect(useDashboardStore.getState().personalCostBasis.AAPL?.price).toBe(150);

    await new Promise<void>((r) => srv.close(() => r()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('chunks fetchQuotesApi requests beyond 40 symbols so 90+ Patty assets load cleanly', async () => {
    const requestedBatches: string[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        const symbols = (url.searchParams.get('symbols') ?? '').split(',').filter(Boolean);
        requestedBatches.push(symbols);
        const quotes = symbols.map((s) => ({
          id: s,
          symbol: s,
          name: s,
          shortName: s,
          price: 100,
          change: 1,
          changePercent: 1,
          prevClose: 99,
          dayHigh: 101,
          dayLow: 98,
          fiftyTwoWeekHigh: 120,
          fiftyTwoWeekLow: 80,
          currency: 'USD',
          unit: 'USD',
          decimals: 2,
          updatedAt: '2026-11-25T20:00:00Z',
        }));
        return new Response(
          JSON.stringify({ quotes, failed: [], updatedAt: '2026-11-25T20:00:00Z' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const ninetyFive = Array.from({ length: 95 }, (_, i) => `SYM${i + 1}`);
    const result = await fetchQuotesApi(ninetyFive);

    expect(requestedBatches.map((b) => b.length)).toEqual([40, 40, 15]);
    expect(result.quotes).toHaveLength(95);
    expect(result.failed).toEqual([]);
  });

  it('excludes sold positions (0€) and sub-cent dust leftovers while keeping active & manual positions', () => {
    const raw: PattyInvestment[] = [
      {
        name: 'ACTIVE STOCK',
        isin: 'US0378331005',
        type: 'Aktien',
        quantity: 10,
        currentValue: 2200,
        currency: 'EUR',
        category: 'Stocks',
        subcategory: 'Core',
      },
      {
        name: 'MANUAL GOLD',
        isin: 'XC0009655157',
        type: 'Manual',
        quantity: 0,
        currentValue: 500,
        currency: 'EUR',
        category: 'Safe-Haven Gold',
        subcategory: 'Münzen',
      },
      {
        name: 'STALE SOLD STOCK',
        isin: 'AT00000FACC2',
        type: 'Aktien',
        quantity: 22,
        currentValue: 0,
        currency: 'EUR',
        category: 'Stocks',
        subcategory: 'Basic',
      },
      {
        name: 'BITPANDA DUST',
        isin: 'BPNDA31X0000',
        type: 'Fremdwährungen',
        quantity: 0.013,
        currentValue: 0.004,
        currency: 'EUR',
        category: 'Altcoins',
        subcategory: 'General',
      },
      {
        name: 'ZERO QTY TINY VALUE',
        isin: 'XX0000000009',
        type: 'Aktien',
        quantity: 0,
        currentValue: 0.5,
        currency: 'EUR',
        category: 'Stocks',
        subcategory: 'Basic',
      },
    ];

    expect(isPattyInvestmentActive(raw[0])).toBe(true);
    expect(isPattyInvestmentActive(raw[1])).toBe(true);
    expect(isPattyInvestmentActive(raw[2])).toBe(false);
    expect(isPattyInvestmentActive(raw[3])).toBe(false);
    expect(isPattyInvestmentActive(raw[4])).toBe(false);

    const active = normalizePattyInvestments(raw, [], false);
    expect(active.map((a) => a.originalName)).toEqual(['ACTIVE STOCK', 'MANUAL GOLD']);
  });

  it('picks newest patty-workspace*.json across multiple directories and reports folderLabel', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashinvest-patty-multi-'));
    const stockpickerDir = path.join(tmpDir, 'Stockpicker');
    const downloadsDir = path.join(tmpDir, 'Downloads');
    fs.mkdirSync(stockpickerDir, { recursive: true });
    fs.mkdirSync(downloadsDir, { recursive: true });

    const oldFile = path.join(stockpickerDir, 'patty-workspace-2026-05-16.json');
    const newFile = path.join(downloadsDir, 'patty-workspace-2026-11-26.json');
    fs.writeFileSync(oldFile, '{"version":1,"investments":[]}', 'utf-8');
    fs.writeFileSync(newFile, 'U2FsdGVkX1+newerdownloadsbackup', 'utf-8');
    const past = new Date(Date.now() - 3_600_000);
    fs.utimesSync(oldFile, past, past);

    const app = createApp({
      pattyDirs: [downloadsDir, stockpickerDir],
    });
    const srv = http.createServer(app);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;

    const res = await fetch(`${url}/api/patty/local-workspace`);
    const body = (await res.json()) as {
      found: boolean;
      filename?: string;
      folderLabel?: string;
      encrypted?: boolean;
    };
    expect(body.found).toBe(true);
    expect(body.filename).toBe('patty-workspace-2026-11-26.json');
    expect(body.folderLabel).toBe('Downloads');
    expect(body.encrypted).toBe(true);

    await new Promise<void>((r) => srv.close(() => r()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

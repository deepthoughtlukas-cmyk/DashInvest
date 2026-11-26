import {
  inferAssetClass,
  inferDecimals,
  inferUnit,
  isValidTickerSymbol,
  resolveCanonicalSymbol,
} from '../../shared/catalog.ts';
import type {
  AssetClass,
  AssetFolder,
  CatalogAsset,
  PattySyncMeta,
  PersonalCostBasis,
  SymbolSearchResult,
} from '../../shared/types.ts';
import { fetchSymbolSearchApi } from './apiClient.ts';

export const PATTY_BROWSER_STORAGE_KEY = 'patty-investments';
export const PATTY_BROWSER_RULES_KEY = 'patty-user-rules';
export const PATTY_AUTO_SYNC_STORAGE_KEY = 'dashinvest-patty-autosync';

export const PATTY_CATEGORY_ORDER = [
  'Stocks',
  'Bonds',
  'Safe-Haven Gold',
  'Performance Gold',
  'Commodities',
  'Bitcoin',
  'Altcoins',
] as const;

export const PATTY_CATEGORY_COLORS: Record<string, string> = {
  Stocks: '#60a5fa',
  Bonds: '#818cf8',
  'Safe-Haven Gold': '#fcd34d',
  'Performance Gold': '#f59e0b',
  Commodities: '#34d399',
  Bitcoin: '#fb923c',
  Altcoins: '#c084fc',
};

export const PATTY_SUBCATEGORY_COLORS: Record<string, string> = {
  Core: '#60a5fa',
  AI: '#93c5fd',
  Defence: '#3b82f6',
  'Real Estate': '#2563eb',
  Goldminen: '#fbbf24',
  Silber: '#d4a853',
  Silberminen: '#b8860b',
  Metals: '#6ee7b7',
  Energy: '#10b981',
  Agribusiness: '#059669',
  Livestock: '#047857',
  General: '#8b90a0',
  Ethereum: '#a78bfa',
  Solana: '#818cf8',
};

export interface PattyInvestment {
  name: string;
  customName?: string;
  _originalName?: string;
  isin: string;
  wkn?: string;
  type: string;
  quantity: number;
  purchasePrice?: number;
  currentPrice?: number;
  currentValue: number;
  currency: string;
  exchangeRate?: number;
  region?: string;
  sector?: string;
  category: string;
  subcategory?: string;
}

export interface PattyUserRule {
  isin: string;
  name: string;
  customName?: string;
  category: string;
  subcategory?: string;
}

export interface PattyWorkspaceFile {
  version: number;
  timestamp?: string;
  investments: PattyInvestment[] | null;
  rules?: PattyUserRule[];
}

export interface PattyNormalizedAsset {
  pattyKey: string;
  isin: string;
  originalName: string;
  displayName: string;
  type: string;
  category: string;
  subcategory: string;
  purchasePrice: number;
  currentValue: number;
  quantity: number;
  currency: string;
  region: string;
  sector: string;
}

export interface PattyUnresolvedItem {
  pattyKey: string;
  displayName: string;
  isin: string;
  type: string;
  category: string;
  subcategory: string;
  reason: string;
}

export interface PattySyncBuildResult {
  folders: AssetFolder[];
  assets: CatalogAsset[];
  unresolved: PattyUnresolvedItem[];
  overrides: Record<string, string>;
  costBasis: Record<string, PersonalCostBasis>;
  totalNormalized: number;
}

export class PattyPinRequiredError extends Error {
  constructor(
    message = 'Diese Patty-Backup-Datei ist mit einem 6-stelligen PIN verschlüsselt.',
  ) {
    super(message);
    this.name = 'PattyPinRequiredError';
  }
}

// ── RFC-1321 MD5 & OpenSSL EVP_BytesToKey AES-256-CBC Decryption ─────────────

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
);

function rotLeft(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

export function md5Bytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const origLen = data.length;
  const bitLenLo = (origLen * 8) >>> 0;
  const bitLenHi = Math.floor((origLen * 8) / 0x100000000) >>> 0;

  // Pad to 56 mod 64, then append 8-byte little-endian bit length
  const mod = (origLen + 1) % 64;
  const padZeroBytes = mod <= 56 ? 56 - mod : 64 - mod + 56;
  const padded = new Uint8Array(origLen + 1 + padZeroBytes + 8);
  padded.set(data, 0);
  padded[origLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLenLo, true);
  view.setUint32(padded.length - 4, bitLenHi, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      const sum = (A + (F >>> 0) + MD5_K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotLeft(sum, MD5_SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(new ArrayBuffer(16));
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function decodeBase64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.trim().replace(/\s+/g, '');
  if (!clean) throw new Error('Leere Backup-Datei.');
  const bin = atob(clean);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function isEncryptedPattyPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
  return trimmed.startsWith('U2FsdGVkX1');
}

export async function decryptPattyPayload(
  ciphertextBase64: string,
  passphrase: string,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'WebCrypto AES-Entschlüsselung ist in diesem Browser-Kontext nicht verfügbar (HTTPS/localhost erforderlich).',
    );
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeBase64ToBytes(ciphertextBase64);
  } catch {
    throw new Error('Ungültige verschlüsselte Patty-Backup-Datei.');
  }

  // OpenSSL Salted__ header (8 bytes) + 8-byte salt + >= 16 bytes ciphertext
  const saltedMagic = [0x53, 0x61, 0x6c, 0x74, 0x65, 0x64, 0x5f, 0x5f];
  if (
    bytes.length < 32 ||
    saltedMagic.some((b, idx) => bytes[idx] !== b)
  ) {
    throw new Error('Ungültiges CryptoJS/OpenSSL-Verschlüsselungsformat.');
  }

  const salt = bytes.slice(8, 16);
  const ciphertext = bytes.slice(16);
  const passBytes = new TextEncoder().encode(passphrase);

  const d1 = md5Bytes(concatBytes(passBytes, salt));
  const d2 = md5Bytes(concatBytes(d1, passBytes, salt));
  const d3 = md5Bytes(concatBytes(d2, passBytes, salt));

  const keyBytes = concatBytes(d1, d2);
  const ivBytes = d3;

  try {
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-CBC' },
      false,
      ['decrypt'],
    );
    const plainBuf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: ivBytes },
      cryptoKey,
      ciphertext,
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plainBuf);
  } catch {
    throw new Error('Falscher PIN oder ungültige/beschädigte Datei.');
  }
}

function validateWorkspaceObject(data: unknown): PattyWorkspaceFile {
  if (
    !data ||
    typeof data !== 'object' ||
    (data as PattyWorkspaceFile).version !== 1 ||
    !Array.isArray((data as PattyWorkspaceFile).investments)
  ) {
    throw new Error('Ungültiges Patty-Workspace-Format (erwartet version: 1 & investments).');
  }
  return data as PattyWorkspaceFile;
}

export async function parsePattyWorkspaceText(
  text: string,
  pin?: string,
): Promise<PattyWorkspaceFile> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Die Patty-Datei ist leer.');
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return validateWorkspaceObject(parsed);
  } catch (err) {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      throw err instanceof Error ? err : new Error('Ungültige JSON-Datei.');
    }
    const cleanPin = pin?.trim() ?? '';
    if (cleanPin.length !== 6) {
      throw new PattyPinRequiredError();
    }
    const decrypted = await decryptPattyPayload(trimmed, cleanPin);
    const parsed = JSON.parse(decrypted) as unknown;
    return validateWorkspaceObject(parsed);
  }
}

// ── Same-Origin Browser Reader ───────────────────────────────────────────────

export function readBrowserPattyWorkspace(): PattyWorkspaceFile | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const rawInvestments = window.localStorage.getItem(PATTY_BROWSER_STORAGE_KEY);
    if (!rawInvestments) return null;
    const investments = JSON.parse(rawInvestments) as unknown;
    if (!Array.isArray(investments) || investments.length === 0) return null;

    let rules: PattyUserRule[] = [];
    const rawRules = window.localStorage.getItem(PATTY_BROWSER_RULES_KEY);
    if (rawRules) {
      const parsedRules = JSON.parse(rawRules) as unknown;
      if (Array.isArray(parsedRules)) {
        rules = parsedRules as PattyUserRule[];
      }
    }

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      investments: investments as PattyInvestment[],
      rules,
    };
  } catch {
    return null;
  }
}

// ── Patty Rule Normalization & Filtering ─────────────────────────────────────

export function validIsin(isin: string | undefined | null): string {
  if (!isin) return '';
  const trimmed = isin.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return '';
  return trimmed;
}

export function computePattyKey(inv: {
  isin?: string;
  name: string;
  _originalName?: string;
}): string {
  return validIsin(inv.isin) || (inv._originalName || inv.name || '').trim();
}

export function isPattyInvestmentActive(inv: {
  currentValue?: unknown;
  quantity?: unknown;
}): boolean {
  const currentValue = Number(inv.currentValue) || 0;
  const quantity = Number(inv.quantity) || 0;
  if (currentValue < 0.05) return false;
  if (quantity <= 0 && currentValue < 1) return false;
  return true;
}

export function normalizePattyInvestments(
  investments: PattyInvestment[],
  rules: PattyUserRule[] = [],
  includeZeroQuantity = false,
): PattyNormalizedAsset[] {
  const byIsin = new Map<string, PattyUserRule>();
  const byName = new Map<string, PattyUserRule>();

  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    const vi = validIsin(r.isin);
    if (vi) byIsin.set(vi, r);
    else if (r.name) byName.set(r.name, r);
  }

  const out: PattyNormalizedAsset[] = [];

  for (const inv of investments) {
    if (!inv || typeof inv !== 'object' || !inv.name) continue;
    const originalName = (inv._originalName || inv.name).trim();
    const isin = validIsin(inv.isin);

    const rule =
      (isin ? byIsin.get(isin) : undefined) ??
      byName.get(originalName) ??
      byName.get(inv.name);

    const currentValue = Number(inv.currentValue) || 0;
    const quantity = Number(inv.quantity) || 0;
    if (!includeZeroQuantity && !isPattyInvestmentActive({ currentValue, quantity })) {
      continue;
    }

    const category = (rule?.category || inv.category || 'Stocks').trim() || 'Stocks';
    const subcategory = (rule?.subcategory || inv.subcategory || 'General').trim() || 'General';
    const ruleCustom = rule?.customName?.trim();
    const invCustom = inv.customName?.trim();
    const displayName =
      (ruleCustom && ruleCustom !== originalName ? ruleCustom : '') ||
      (invCustom && invCustom !== originalName ? invCustom : '') ||
      inv.name.trim();

    const purchasePriceRaw = Number(inv.purchasePrice);
    const purchasePrice =
      Number.isFinite(purchasePriceRaw) && purchasePriceRaw > 0 ? purchasePriceRaw : 0;

    out.push({
      pattyKey: isin || originalName,
      isin,
      originalName,
      displayName,
      type: (inv.type || 'Aktien').trim(),
      category,
      subcategory,
      purchasePrice,
      currentValue,
      quantity,
      currency: (inv.currency || 'EUR').trim(),
      region: (inv.region || '').trim(),
      sector: (inv.sector || '').trim(),
    });
  }

  return out;
}

// ── Curated Static Mappings & Smart Yahoo Ticker Resolution ──────────────────

interface StaticMappingEntry {
  symbol: string;
  assetClass: AssetClass;
  unit: string;
  decimals: number;
  exchange?: string;
}

export const KNOWN_PATTY_ISIN_MAP: Record<string, StaticMappingEntry> = {
  XC0009655157: {
    symbol: 'GC=F',
    assetClass: 'precious_metals',
    unit: 'USD/oz',
    decimals: 2,
    exchange: 'COMEX',
  },
  XC0009653103: {
    symbol: 'SI=F',
    assetClass: 'precious_metals',
    unit: 'USD/oz',
    decimals: 2,
    exchange: 'COMEX',
  },
  DE000A0S9GB0: {
    symbol: '4GLD.DE',
    assetClass: 'etf',
    unit: 'EUR',
    decimals: 2,
    exchange: 'XETRA',
  },
  DE000A2T0VS9: {
    symbol: 'XAD6.DE',
    assetClass: 'etf',
    unit: 'EUR',
    decimals: 2,
    exchange: 'XETRA',
  },
  XC000A2YY6Q6: {
    symbol: 'BTC-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 2,
    exchange: 'CCC',
  },
  BPNDA5X00000: {
    symbol: 'ETH-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 2,
    exchange: 'CCC',
  },
  BPNDA135X000: {
    symbol: 'SOL-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 2,
    exchange: 'CCC',
  },
  BPNDA8X00000: {
    symbol: 'XRP-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 4,
    exchange: 'CCC',
  },
  BPNDA25X0000: {
    symbol: 'LINK-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 2,
    exchange: 'CCC',
  },
  BPNDA31X0000: {
    symbol: 'TRX-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 4,
    exchange: 'CCC',
  },
  BPNDA51X0000: {
    symbol: 'DOT-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 2,
    exchange: 'CCC',
  },
  BPNDA27X0000: {
    symbol: 'USDT-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 4,
    exchange: 'CCC',
  },
  BPNDA134X000: {
    symbol: 'POL-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 4,
    exchange: 'CCC',
  },
};

export const KNOWN_CRYPTO_METAL_NAME_MAP: Record<string, StaticMappingEntry> = {
  bitcoin: { symbol: 'BTC-USD', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC' },
  ethereum: { symbol: 'ETH-USD', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC' },
  solana: { symbol: 'SOL-USD', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC' },
  ripple: { symbol: 'XRP-USD', assetClass: 'crypto', unit: 'USD', decimals: 4, exchange: 'CCC' },
  xrp: { symbol: 'XRP-USD', assetClass: 'crypto', unit: 'USD', decimals: 4, exchange: 'CCC' },
  chainlink: { symbol: 'LINK-USD', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC' },
  tron: { symbol: 'TRX-USD', assetClass: 'crypto', unit: 'USD', decimals: 4, exchange: 'CCC' },
  polkadot: { symbol: 'DOT-USD', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC' },
  sui: { symbol: 'SUI20947-USD', assetClass: 'crypto', unit: 'USD', decimals: 4, exchange: 'CCC' },
  'near protocol': {
    symbol: 'NEAR-USD',
    assetClass: 'crypto',
    unit: 'USD',
    decimals: 2,
    exchange: 'CCC',
  },
  near: { symbol: 'NEAR-USD', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC' },
  tether: { symbol: 'USDT-USD', assetClass: 'crypto', unit: 'USD', decimals: 4, exchange: 'CCC' },
  polygon: { symbol: 'POL-USD', assetClass: 'crypto', unit: 'USD', decimals: 4, exchange: 'CCC' },
  cardano: { symbol: 'ADA-USD', assetClass: 'crypto', unit: 'USD', decimals: 4, exchange: 'CCC' },
  avalanche: { symbol: 'AVAX-USD', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC' },
  litecoin: { symbol: 'LTC-USD', assetClass: 'crypto', unit: 'USD', decimals: 2, exchange: 'CCC' },
  dogecoin: { symbol: 'DOGE-USD', assetClass: 'crypto', unit: 'USD', decimals: 4, exchange: 'CCC' },
};

const STRUCTURED_OR_WALLET_RE =
  /\b(MINIL|TURBOC|TURBOP|FAKT[LS]|CALL\d+|PUT\d+|WALLET|COINVERTIBLE|OPTIONS?SCH)\b/i;

export function isNonYahooStructuredProduct(inv: PattyNormalizedAsset): boolean {
  if (inv.type === 'Zertifikate/OS') return true;
  if (STRUCTURED_OR_WALLET_RE.test(inv.displayName)) return true;
  if (STRUCTURED_OR_WALLET_RE.test(inv.originalName)) return true;
  if (inv.isin.toUpperCase().startsWith('BPNDA')) return true;
  return false;
}

const STANDARD_ISIN_RE = /^[A-Z]{2}[A-Z0-9]{10}$/;
const ISIN_STUTTGART_RE = /^[A-Z]{2}[A-Z0-9]{10}\.SG$/i;

const ISIN_COUNTRY_PREFERRED_SUFFIXES: Record<string, string[]> = {
  DE: ['.DE', '.F'],
  AT: ['.VI', '.DE'],
  CH: ['.SW'],
  FR: ['.PA'],
  IT: ['.MI'],
  NL: ['.AS'],
  GB: ['.L'],
  CA: ['.TO', '.V'],
  JP: ['.T'],
  NO: ['.OL'],
  SE: ['.ST'],
  FI: ['.HE'],
  ES: ['.MC'],
  HK: ['.HK'],
  AU: ['.AX'],
  CZ: ['.PR'],
  IE: ['.DE', '.L', '.AS', '.MI'],
  LU: ['.DE', '.L', '.AS', '.MI'],
  NG: ['.L'],
  BM: [''],
  KY: ['.HK', ''],
};

export function pickBestYahooCandidate(
  results: SymbolSearchResult[],
  inv: Pick<PattyNormalizedAsset, 'isin' | 'type' | 'displayName'>,
): SymbolSearchResult | null {
  const valid = results.filter((r) => r.symbol && isValidTickerSymbol(r.symbol));
  if (valid.length === 0) return null;

  const isinUpper = inv.isin.toUpperCase();
  const country = STANDARD_ISIN_RE.test(isinUpper) ? isinUpper.slice(0, 2) : '';
  const typeLower = inv.type.toLowerCase();

  let best = valid[0];
  let bestScore = -Infinity;

  for (let i = 0; i < valid.length; i++) {
    const r = valid[i];
    let score = 0;
    const sym = r.symbol.toUpperCase();
    const qt = (r.quoteType || '').toUpperCase();

    if (ISIN_STUTTGART_RE.test(sym)) {
      score -= 50;
    }

    if (typeLower === 'etf') {
      if (qt === 'ETF') score += 30;
      else if (qt === 'MUTUALFUND') score += 10;
      else if (qt === 'EQUITY') score -= 5;
    } else if (typeLower === 'aktien') {
      if (qt === 'EQUITY') score += 30;
      else if (qt === 'ETF') score -= 10;
    } else if (typeLower === 'edelmetalle') {
      if (qt === 'FUTURE') score += 20;
      else if (qt === 'ETF') score += 15;
    } else if (typeLower === 'fremdwährungen') {
      if (qt === 'CRYPTOCURRENCY') score += 30;
    }

    if (country === 'US') {
      if (!sym.includes('.')) score += 25;
    } else if (country && ISIN_COUNTRY_PREFERRED_SUFFIXES[country]) {
      const prefs = ISIN_COUNTRY_PREFERRED_SUFFIXES[country];
      for (let p = 0; p < prefs.length; p++) {
        const suffix = prefs[p];
        if (suffix === '' ? !sym.includes('.') : sym.endsWith(suffix)) {
          score += 25 - p * 3;
          break;
        }
      }
    }

    // Small tie-breaker favoring earlier Yahoo relevance ranking
    score -= i * 0.05;

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  return best;
}

const NOISE_WORDS = new Set([
  'ag',
  'se',
  'plc',
  'inc',
  'corp',
  'ltd',
  'spa',
  'nv',
  'gmbh',
  'kgaa',
  'co',
  'the',
  'hldgs',
  'holding',
  'holdings',
  'acc',
  'dist',
  'adr',
  'asa',
  'ab',
  'sa',
  'etf',
  'ucits',
  'ishares',
  'xtrackers',
  'spdr',
  'vaneck',
  'namens',
  'aktien',
  'inhaber',
  'reg',
  'shares',
]);

function cleanSearchName(raw: string): string {
  const tokens = raw
    .replace(/[().,/&+]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !NOISE_WORDS.has(t.toLowerCase()));
  return tokens.join(' ').trim();
}

function hasMeaningfulWordOverlap(cleanedQuery: string, candidate: SymbolSearchResult): boolean {
  const words = cleanedQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  const target = `${candidate.symbol} ${candidate.shortName} ${candidate.name}`.toLowerCase();
  return words.some((w) => target.includes(w));
}

function makeShortName(displayName: string, fallbackSymbol: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return fallbackSymbol;
  if (trimmed.length <= 24) return trimmed;
  return `${trimmed.slice(0, 23).trimEnd()}…`;
}

export function slugifyPattyId(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'general';
}

export function getPattyCategoryColor(category: string): string {
  return PATTY_CATEGORY_COLORS[category] ?? '#94a3b8';
}

export function getPattySubcategoryColor(subcategory: string, parentCategory: string): string {
  return PATTY_SUBCATEGORY_COLORS[subcategory] ?? getPattyCategoryColor(parentCategory);
}

export function buildPattyFolders(
  items: Array<{ category: string; subcategory: string }>,
): AssetFolder[] {
  if (items.length === 0) return [];

  const rootFolder: AssetFolder = {
    id: 'patty-root',
    name: 'Patty',
    parentId: null,
    color: '#f59e0b',
    collapsed: false,
    source: 'patty',
  };

  const subsByCategory = new Map<string, Set<string>>();
  for (const item of items) {
    const cat = item.category || 'Stocks';
    const sub = item.subcategory || 'General';
    let subSet = subsByCategory.get(cat);
    if (!subSet) {
      subSet = new Set<string>();
      subsByCategory.set(cat, subSet);
    }
    subSet.add(sub);
  }

  const orderIndex = new Map<string, number>(
    PATTY_CATEGORY_ORDER.map((c, idx) => [c, idx]),
  );

  const sortedCategories = Array.from(subsByCategory.keys()).sort((a, b) => {
    const ia = orderIndex.get(a) ?? 999;
    const ib = orderIndex.get(b) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, 'de');
  });

  const folders: AssetFolder[] = [rootFolder];

  for (const cat of sortedCategories) {
    const catId = `patty-cat-${slugifyPattyId(cat)}`;
    folders.push({
      id: catId,
      name: cat,
      parentId: rootFolder.id,
      color: getPattyCategoryColor(cat),
      collapsed: false,
      source: 'patty',
    });

    const sortedSubs = Array.from(subsByCategory.get(cat) ?? []).sort((a, b) =>
      a.localeCompare(b, 'de'),
    );
    const collapseSubs = items.length > 15;
    for (const sub of sortedSubs) {
      const subId = `patty-sub-${slugifyPattyId(cat)}-${slugifyPattyId(sub)}`;
      folders.push({
        id: subId,
        name: sub,
        parentId: catId,
        color: getPattySubcategoryColor(sub, cat),
        collapsed: collapseSubs,
        source: 'patty',
      });
    }
  }

  return folders;
}

export interface ResolvePattyInvestmentsOptions {
  investments: PattyNormalizedAsset[];
  overrides?: Record<string, string>;
  existingCatalogAssets?: CatalogAsset[];
  searchFn?: (query: string) => Promise<SymbolSearchResult[]>;
  onProgress?: (done: number, total: number, currentName: string) => void;
}

interface ResolvedDraft {
  item: PattyNormalizedAsset;
  symbol: string;
  assetClass: AssetClass;
  unit: string;
  decimals: number;
  exchange?: string;
}

export async function resolvePattyInvestments(
  options: ResolvePattyInvestmentsOptions,
): Promise<PattySyncBuildResult> {
  const {
    investments,
    overrides = {},
    existingCatalogAssets = [],
    searchFn = (q) => fetchSymbolSearchApi(q).then((r) => r.results),
    onProgress,
  } = options;

  const existingByIsin = new Map<string, CatalogAsset>();
  const existingBySymbol = new Map<string, CatalogAsset>();
  for (const a of existingCatalogAssets) {
    existingBySymbol.set(resolveCanonicalSymbol(a.symbol), a);
    if (a.isin) existingByIsin.set(a.isin.toUpperCase(), a);
  }

  const total = investments.length;
  let completed = 0;
  const unresolved: PattyUnresolvedItem[] = [];
  const drafts: ResolvedDraft[] = [];
  const newOverrides: Record<string, string> = {};

  const reportProgress = (name: string) => {
    completed++;
    onProgress?.(completed, total, name);
  };

  const pendingLive: PattyNormalizedAsset[] = [];

  for (const inv of investments) {
    // 1. Manual or cached override
    const overrideSym = overrides[inv.pattyKey];
    if (overrideSym && isValidTickerSymbol(overrideSym)) {
      const canonical = resolveCanonicalSymbol(overrideSym);
      const existing = existingBySymbol.get(canonical);
      const assetClass = existing?.assetClass ?? inferAssetClass(canonical);
      drafts.push({
        item: inv,
        symbol: canonical,
        assetClass,
        unit: existing?.unit ?? inferUnit(assetClass, inv.currency),
        decimals: existing?.decimals ?? inferDecimals(canonical, assetClass),
        exchange: existing?.exchange,
      });
      reportProgress(inv.displayName);
      continue;
    }

    // 2. Existing catalog asset with matching ISIN
    if (inv.isin) {
      const existingByI = existingByIsin.get(inv.isin.toUpperCase());
      if (existingByI) {
        const canonical = resolveCanonicalSymbol(existingByI.symbol);
        newOverrides[inv.pattyKey] = canonical;
        drafts.push({
          item: inv,
          symbol: canonical,
          assetClass: existingByI.assetClass,
          unit: existingByI.unit,
          decimals: existingByI.decimals,
          exchange: existingByI.exchange,
        });
        reportProgress(inv.displayName);
        continue;
      }
    }

    // 3. Curated static ISIN map
    const isinUpper = inv.isin.toUpperCase();
    if (isinUpper && KNOWN_PATTY_ISIN_MAP[isinUpper]) {
      const mapped = KNOWN_PATTY_ISIN_MAP[isinUpper];
      newOverrides[inv.pattyKey] = mapped.symbol;
      drafts.push({
        item: inv,
        ...mapped,
      });
      reportProgress(inv.displayName);
      continue;
    }

    // 4. Curated static crypto & precious metal name map
    const lowerDisplay = inv.displayName.toLowerCase().trim();
    const lowerOriginal = inv.originalName.toLowerCase().trim();
    const cryptoMatch =
      KNOWN_CRYPTO_METAL_NAME_MAP[lowerDisplay] ??
      KNOWN_CRYPTO_METAL_NAME_MAP[lowerOriginal];
    if (cryptoMatch) {
      newOverrides[inv.pattyKey] = cryptoMatch.symbol;
      drafts.push({
        item: inv,
        ...cryptoMatch,
      });
      reportProgress(inv.displayName);
      continue;
    }

    if (
      (lowerDisplay === 'gold' || lowerOriginal === 'gold') &&
      (inv.type === 'Edelmetalle' || inv.category.toLowerCase().includes('gold'))
    ) {
      newOverrides[inv.pattyKey] = 'GC=F';
      drafts.push({
        item: inv,
        symbol: 'GC=F',
        assetClass: 'precious_metals',
        unit: 'USD/oz',
        decimals: 2,
        exchange: 'COMEX',
      });
      reportProgress(inv.displayName);
      continue;
    }

    if (
      (lowerDisplay === 'silber' ||
        lowerDisplay === 'silver' ||
        lowerOriginal === 'silber' ||
        lowerOriginal === 'silver') &&
      (inv.type === 'Edelmetalle' || inv.subcategory.toLowerCase() === 'silber')
    ) {
      newOverrides[inv.pattyKey] = 'SI=F';
      drafts.push({
        item: inv,
        symbol: 'SI=F',
        assetClass: 'precious_metals',
        unit: 'USD/oz',
        decimals: 2,
        exchange: 'COMEX',
      });
      reportProgress(inv.displayName);
      continue;
    }

    // 5. Non-Yahoo structured products / wallets
    if (isNonYahooStructuredProduct(inv)) {
      unresolved.push({
        pattyKey: inv.pattyKey,
        displayName: inv.displayName,
        isin: inv.isin,
        type: inv.type,
        category: inv.category,
        subcategory: inv.subcategory,
        reason: 'Zertifikat / Wallet (kein Yahoo-Ticker)',
      });
      reportProgress(inv.displayName);
      continue;
    }

    pendingLive.push(inv);
  }

  // 6 & 7. Live Yahoo search in concurrency batches of 4
  const CONCURRENCY = 4;
  let cursor = 0;

  const worker = async () => {
    while (cursor < pendingLive.length) {
      const idx = cursor++;
      const inv = pendingLive[idx];

      let matched: SymbolSearchResult | null = null;
      let hadError = false;

      try {
        if (STANDARD_ISIN_RE.test(inv.isin.toUpperCase())) {
          const isinResults = await searchFn(inv.isin.toUpperCase());
          matched = pickBestYahooCandidate(isinResults, inv);
        }

        if (!matched) {
          const cleaned = cleanSearchName(inv.originalName || inv.displayName);
          if (cleaned.length >= 3) {
            const nameResults = await searchFn(cleaned);
            const candidate = pickBestYahooCandidate(nameResults, inv);
            if (candidate && hasMeaningfulWordOverlap(cleaned, candidate)) {
              matched = candidate;
            }
          }
        }
      } catch {
        hadError = true;
      }

      if (matched) {
        const canonical = resolveCanonicalSymbol(matched.symbol);
        newOverrides[inv.pattyKey] = canonical;
        drafts.push({
          item: inv,
          symbol: canonical,
          assetClass: matched.assetClass,
          unit: matched.unit || inferUnit(matched.assetClass, inv.currency),
          decimals: matched.decimals,
          exchange: matched.exchange,
        });
      } else {
        unresolved.push({
          pattyKey: inv.pattyKey,
          displayName: inv.displayName,
          isin: inv.isin,
          type: inv.type,
          category: inv.category,
          subcategory: inv.subcategory,
          reason: hadError
            ? 'Yahoo-Suche fehlgeschlagen (Netzwerk/API)'
            : 'Kein passender Yahoo-Ticker gefunden',
        });
      }

      reportProgress(inv.displayName);
    }
  };

  const workerCount = Math.min(CONCURRENCY, pendingLive.length);
  if (workerCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  // Deduplicate by canonical Yahoo symbol (keep highest currentValue, then non-General subcategory)
  const dedupedMap = new Map<string, ResolvedDraft>();
  for (const draft of drafts) {
    const prev = dedupedMap.get(draft.symbol);
    if (!prev) {
      dedupedMap.set(draft.symbol, draft);
      continue;
    }
    const replace =
      draft.item.currentValue > prev.item.currentValue ||
      (draft.item.currentValue === prev.item.currentValue &&
        prev.item.subcategory === 'General' &&
        draft.item.subcategory !== 'General');
    if (replace) {
      dedupedMap.set(draft.symbol, draft);
    }
  }

  const dedupedDrafts = Array.from(dedupedMap.values());
  const folders = buildPattyFolders(dedupedDrafts.map((d) => d.item));

  const assets: CatalogAsset[] = dedupedDrafts.map((d) => {
    const folderId = `patty-sub-${slugifyPattyId(d.item.category)}-${slugifyPattyId(
      d.item.subcategory,
    )}`;
    return {
      symbol: d.symbol,
      name: d.item.displayName,
      shortName: makeShortName(d.item.displayName, d.symbol),
      assetClass: d.assetClass,
      unit: d.unit,
      decimals: d.decimals,
      exchange: d.exchange,
      folderId,
      bookmarked: true,
      isin: d.item.isin || undefined,
      source: 'patty',
    };
  });

  const costBasis: Record<string, PersonalCostBasis> = {};
  const syncedAt = new Date().toISOString();
  for (const d of dedupedDrafts) {
    if (d.item.purchasePrice > 0) {
      costBasis[d.symbol] = {
        price: d.item.purchasePrice,
        currency: (d.item.currency || 'EUR').trim().toUpperCase() || 'EUR',
        source: 'patty',
        updatedAt: syncedAt,
      };
    }
  }

  return {
    folders,
    assets,
    unresolved,
    overrides: newOverrides,
    costBasis,
    totalNormalized: investments.length,
  };
}

export function buildPattySyncMeta(
  sourceType: PattySyncMeta['sourceType'],
  sourceLabel: string,
  result: PattySyncBuildResult,
  includeZeroQuantity: boolean,
): PattySyncMeta {
  return {
    syncedAt: new Date().toISOString(),
    sourceType,
    sourceLabel,
    totalAssets: result.totalNormalized,
    syncedCount: result.assets.length,
    unresolvedCount: result.unresolved.length,
    includeZeroQuantity,
  };
}

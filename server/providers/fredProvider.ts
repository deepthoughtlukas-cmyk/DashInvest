import type { MacroPoint, NetLiquidityPoint } from '../../shared/types.ts';
import { TtlCache } from '../cache.ts';
import type { MacroDataProvider } from './types.ts';

export function parseFredCsv(csvText: string): MacroPoint[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const points: MacroPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const commaIdx = line.indexOf(',');
    if (commaIdx <= 0) continue;

    const date = line.slice(0, commaIdx).trim();
    const rawVal = line.slice(commaIdx + 1).trim();
    if (!date || !rawVal || rawVal === '.') continue;

    const value = Number.parseFloat(rawVal);
    if (!Number.isFinite(value)) continue;
    points.push({ date, value });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Computes US Fed Net Liquidity normalized in Billions USD:
 *   Net Liquidity = (WALCL / 1,000) - (WTREGEN / 1,000) - RRPONTSYD
 * Because FRED reports WALCL & WTREGEN in Millions USD while RRPONTSYD is in Billions USD.
 * Forward-fills weekly series (WALCL, WTREGEN) and daily RRP onto the aligned date timeline.
 */
export function computeNetLiquiditySeries(
  walclMillions: MacroPoint[],
  wtregenMillions: MacroPoint[],
  rrpBillions: MacroPoint[],
  minDate = '2020-01-01',
): NetLiquidityPoint[] {
  if (walclMillions.length === 0 || wtregenMillions.length === 0 || rrpBillions.length === 0) {
    return [];
  }

  const walclMap = new Map(walclMillions.map((p) => [p.date, p.value]));
  const tgaMap = new Map(wtregenMillions.map((p) => [p.date, p.value]));
  const rrpMap = new Map(rrpBillions.map((p) => [p.date, p.value]));

  const earliestCommon = [
    walclMillions[0].date,
    wtregenMillions[0].date,
    rrpBillions[0].date,
    minDate,
  ]
    .sort()
    .at(-1)!;

  const dateSet = new Set<string>();
  for (const p of walclMillions) if (p.date >= earliestCommon) dateSet.add(p.date);
  for (const p of wtregenMillions) if (p.date >= earliestCommon) dateSet.add(p.date);
  for (const p of rrpBillions) if (p.date >= earliestCommon) dateSet.add(p.date);

  const allDates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));

  // Seed last known values prior to earliestCommon if available
  let lastWalcl: number | null = null;
  let lastTga: number | null = null;
  let lastRrp: number | null = null;

  for (const p of walclMillions) {
    if (p.date <= earliestCommon) lastWalcl = p.value;
    else break;
  }
  for (const p of wtregenMillions) {
    if (p.date <= earliestCommon) lastTga = p.value;
    else break;
  }
  for (const p of rrpBillions) {
    if (p.date <= earliestCommon) lastRrp = p.value;
    else break;
  }

  const result: NetLiquidityPoint[] = [];

  for (const date of allDates) {
    if (walclMap.has(date)) lastWalcl = walclMap.get(date)!;
    if (tgaMap.has(date)) lastTga = tgaMap.get(date)!;
    if (rrpMap.has(date)) lastRrp = rrpMap.get(date)!;

    if (lastWalcl === null || lastTga === null || lastRrp === null) continue;

    const fedAssetsB = lastWalcl / 1000;
    const tgaB = lastTga / 1000;
    const rrpB = lastRrp;
    const netLiquidity = fedAssetsB - tgaB - rrpB;

    result.push({
      date,
      netLiquidity: Number(netLiquidity.toFixed(2)),
      fedAssets: Number(fedAssetsB.toFixed(2)),
      tga: Number(tgaB.toFixed(2)),
      rrp: Number(rrpB.toFixed(2)),
    });
  }

  return result;
}

export function findValueOnOrBefore(points: MacroPoint[], targetDate: string): MacroPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].date <= targetDate) return points[i];
  }
  return points[0] ?? null;
}

export function offsetIsoDateDays(isoDate: string, daysDelta: number): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + daysDelta);
  return dt.toISOString().slice(0, 10);
}

export function computePercentile(values: number[], current: number): number {
  if (values.length === 0) return 50;
  let countLe = 0;
  for (const v of values) {
    if (v <= current) countLe++;
  }
  return Math.round((countLe / values.length) * 100);
}

interface FredApiResponse {
  observations?: Array<{ date: string; value: string }>;
}

export class FredProvider implements MacroDataProvider {
  readonly name = 'FRED St. Louis Fed';
  private cache = new TtlCache();

  async getSeries(seriesId: string): Promise<MacroPoint[]> {
    const cacheKey = `fred:series:${seriesId}`;
    const { data } = await this.cache.getOrLoad(cacheKey, 15 * 60_000, async () => {
      const apiKey = process.env.FRED_API_KEY?.trim();
      if (apiKey) {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(
          seriesId,
        )}&api_key=${encodeURIComponent(apiKey)}&file_type=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
          const json = (await res.json()) as FredApiResponse;
          const obs = json.observations ?? [];
          const points: MacroPoint[] = [];
          for (const item of obs) {
            if (!item.value || item.value === '.') continue;
            const value = Number.parseFloat(item.value);
            if (!Number.isFinite(value)) continue;
            points.push({ date: item.date, value });
          }
          if (points.length > 0) {
            return points.sort((a, b) => a.date.localeCompare(b.date));
          }
        }
      }

      const csvUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
      const res = await fetch(csvUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DashInvest/1.0)',
          Accept: 'text/csv,text/plain',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`FRED HTTP ${res.status} for ${seriesId}`);
      }
      const csv = await res.text();
      const parsed = parseFredCsv(csv);
      if (parsed.length === 0) {
        throw new Error(`FRED returned no valid observations for ${seriesId}`);
      }
      return parsed;
    });

    return data;
  }
}

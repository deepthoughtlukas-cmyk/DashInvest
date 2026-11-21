import { describe, expect, it } from 'vitest';
import {
  computeNetLiquiditySeries,
  parseFredCsv,
} from '../server/providers/fredProvider.ts';

describe('FRED CSV Parser & US Net Liquidity Normalization', () => {
  it('parses observation_date CSV headers and skips missing dot rows', () => {
    const csv = [
      'observation_date,WALCL',
      '2026-11-04,6750000',
      '2026-11-11,.',
      '2026-11-18,6741452',
    ].join('\n');

    const pts = parseFredCsv(csv);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toEqual({ date: '2026-11-04', value: 6750000 });
    expect(pts[1]).toEqual({ date: '2026-11-18', value: 6741452 });
  });

  it('normalizes WALCL/WTREGEN (millions) and RRPONTSYD (billions) and forward-fills weekly values', () => {
    const walcl = [
      { date: '2026-11-04', value: 6_800_000 }, // 6800 B
      { date: '2026-11-11', value: 6_750_000 }, // 6750 B
    ];
    const wtregen = [
      { date: '2026-11-04', value: 900_000 }, // 900 B
      { date: '2026-11-11', value: 850_000 }, // 850 B
    ];
    const rrp = [
      { date: '2026-11-04', value: 100 }, // 100 B
      { date: '2026-11-05', value: 50 },  // 50 B -> forward-fills WALCL/TGA from 11-04
      { date: '2026-11-11', value: 25 },  // 25 B
    ];

    const series = computeNetLiquiditySeries(walcl, wtregen, rrp, '2026-01-01');
    expect(series).toHaveLength(3);

    // 2026-11-04: 6800 - 900 - 100 = 5800
    expect(series[0]).toEqual({
      date: '2026-11-04',
      fedAssets: 6800,
      tga: 900,
      rrp: 100,
      netLiquidity: 5800,
    });

    // 2026-11-05: 6800 - 900 - 50 = 5850
    expect(series[1]).toEqual({
      date: '2026-11-05',
      fedAssets: 6800,
      tga: 900,
      rrp: 50,
      netLiquidity: 5850,
    });

    // 2026-11-11: 6750 - 850 - 25 = 5875
    expect(series[2]).toEqual({
      date: '2026-11-11',
      fedAssets: 6750,
      tga: 850,
      rrp: 25,
      netLiquidity: 5875,
    });
  });
});

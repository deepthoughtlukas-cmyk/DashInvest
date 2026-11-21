import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../server/cache.ts';
import {
  aggregateFourHourCandles,
  sanitizeCandles,
} from '../server/providers/yahooProvider.ts';

describe('TtlCache & Yahoo Data Hygiene', () => {
  it('caches values within TTL, deduplicates concurrent loads, and returns stale fallback on error', async () => {
    vi.useFakeTimers();
    try {
      const cache = new TtlCache();
      let calls = 0;

      const loader = vi.fn(async () => {
        calls++;
        return `payload-${calls}`;
      });

      // Concurrent cold calls share a single loader execution
      const [a, b] = await Promise.all([
        cache.getOrLoad('k1', 1000, loader),
        cache.getOrLoad('k1', 1000, loader),
      ]);
      expect(a).toEqual({ data: 'payload-1', stale: false });
      expect(b).toEqual({ data: 'payload-1', stale: false });
      expect(loader).toHaveBeenCalledTimes(1);

      // Advance past TTL and simulate upstream failure -> stale fallback
      vi.advanceTimersByTime(1500);
      const failingLoader = vi.fn(async () => {
        throw new Error('upstream down');
      });
      const fallback = await cache.getOrLoad('k1', 1000, failingLoader);
      expect(fallback).toEqual({ data: 'payload-1', stale: true });

      // Cold key with failing loader throws
      await expect(cache.getOrLoad('k2', 1000, failingLoader)).rejects.toThrow('upstream down');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sanitizes Yahoo raw candles: drops null/NaN, deduplicates, clamps highs/lows, sorts ascending', () => {
    const raw = {
      chart: {
        result: [
          {
            timestamp: [300, 100, 200, 200, 400],
            indicators: {
              quote: [
                {
                  open: [105, 100, 101, 102, null],
                  high: [106, 98, 104, 105, 110], // bar at 100 has high < open
                  low: [102, 101, 99, 100, 95],   // bar at 100 has low > open
                  close: [104, 99, 103, 104, 108],
                  volume: [-5, 500, null, 750, 900],
                },
              ],
            },
          },
        ],
      },
    };

    const cleaned = sanitizeCandles(raw);
    expect(cleaned).toHaveLength(3); // 400 dropped (open=null), duplicate 200 deduplicated
    expect(cleaned.map((c) => c.time)).toEqual([100, 200, 300]);

    // Bar at 100 clamped properly
    expect(cleaned[0].high).toBe(100);
    expect(cleaned[0].low).toBe(99);
    // Duplicate 200 took latest entry
    expect(cleaned[1].close).toBe(104);
    expect(cleaned[1].volume).toBe(750);
    // Negative volume at 300 clamped to 0
    expect(cleaned[2].volume).toBe(0);
  });

  it('aggregates hourly candles into UTC 4-hour buckets preserving OHLCV integrity', () => {
    const t0 = 14400 * 100; // exact 4H UTC boundary
    const hourly = [
      { time: t0, open: 100, high: 105, low: 98, close: 103, volume: 10 },
      { time: t0 + 3600, open: 103, high: 109, low: 101, close: 107, volume: 20 },
      { time: t0 + 7200, open: 107, high: 108, low: 97, close: 102, volume: 15 },
      { time: t0 + 14400, open: 102, high: 112, low: 100, close: 111, volume: 30 },
    ];

    const h4 = aggregateFourHourCandles(hourly);
    expect(h4).toHaveLength(2);
    expect(h4[0]).toEqual({
      time: t0,
      open: 100,
      high: 109,
      low: 97,
      close: 102,
      volume: 45,
    });
    expect(h4[1]).toEqual({
      time: t0 + 14400,
      open: 102,
      high: 112,
      low: 100,
      close: 111,
      volume: 30,
    });
  });
});

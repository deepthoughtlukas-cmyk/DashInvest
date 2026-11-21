import { describe, expect, it } from 'vitest';
import { alignOverlaySeries } from '../src/engine/macroOverlay.ts';

describe('Macro Overlay Series Alignment', () => {
  it('aligns daily comparison series to monthly/weekly macro series and marks earlier dates as null', () => {
    const base = [
      { date: '2019-01-01', value: 14500 },
      { date: '2020-01-01', value: 15400 },
      { date: '2020-02-01', value: 15500 },
      { date: '2020-03-01', value: 16000 },
    ];
    const overlay = [
      { date: '2020-01-01', value: 3230 },
      { date: '2020-01-15', value: 3280 },
      { date: '2020-02-10', value: 3350 },
    ];

    const aligned = alignOverlaySeries(base, overlay);
    expect(aligned).toEqual([null, 3230, 3280, 3350]);
  });

  it('returns null array when either series is empty', () => {
    expect(alignOverlaySeries([{ date: '2025-01-01', value: 100 }], [])).toEqual([null]);
    expect(alignOverlaySeries([], [{ date: '2025-01-01', value: 100 }])).toEqual([]);
  });
});

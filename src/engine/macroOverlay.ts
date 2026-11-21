import type { MacroPoint } from '../../shared/types.ts';

/**
 * Aligns an overlay series (e.g. daily S&P 500 or Gold) onto a base macro timeline.
 * Returns null for dates strictly before the earliest overlay observation so no
 * artificial flat leading line is drawn across earlier history.
 */
export function alignOverlaySeries(
  baseSeries: MacroPoint[],
  overlaySeries: MacroPoint[],
): Array<number | null> {
  if (baseSeries.length === 0 || overlaySeries.length === 0) {
    return baseSeries.map(() => null);
  }

  const sorted = [...overlaySeries].sort((a, b) => a.date.localeCompare(b.date));
  const earliestDate = sorted[0].date;
  const aligned: Array<number | null> = [];
  let j = 0;

  for (const pt of baseSeries) {
    if (pt.date < earliestDate) {
      aligned.push(null);
      continue;
    }
    while (j + 1 < sorted.length && sorted[j + 1].date <= pt.date) {
      j++;
    }
    aligned.push(sorted[j].value);
  }

  return aligned;
}

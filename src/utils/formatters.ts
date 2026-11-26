const deNumberFormatterCache = new Map<number, Intl.NumberFormat>();

/**
 * Format a finite number using German locale (`de-DE`) with a cached `Intl.NumberFormat`
 * instance per decimal precision to avoid repeated formatter construction in hot loops.
 */
export function formatNumberDe(val: number, decimals = 2): string {
  const safeDecimals = Math.max(0, Math.min(8, Math.trunc(decimals)));
  let fmt = deNumberFormatterCache.get(safeDecimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: safeDecimals,
      maximumFractionDigits: safeDecimals,
    });
    deNumberFormatterCache.set(safeDecimals, fmt);
  }
  return fmt.format(val);
}

import type { AssetFundamentals, PersonalCostBasis } from '../../shared/types.ts';

export interface NormalizedCurrency {
  currency: string;
  subunitDivisor: number;
}

export interface PersonalDividendYieldResult {
  personalYieldPercent: number | null;
  annualDividendInCostCurrency: number | null;
  deltaPercentagePoints: number | null;
  fxSymbol: string | null;
  needsFxRate: boolean;
  fxConverted: boolean;
}

/**
 * Normalize Yahoo Finance currency codes, converting subunit currencies
 * (e.g. London pence `GBp`/`GBX`, South African cents `ZAc`, Israeli agorot `ILA`)
 * into their major currency with the appropriate divisor.
 */
export function normalizeQuoteCurrency(
  rawCurrency: string | null | undefined,
): NormalizedCurrency {
  const trimmed = (rawCurrency ?? '').trim();
  if (!trimmed) {
    return { currency: '', subunitDivisor: 1 };
  }
  if (trimmed === 'GBp' || trimmed === 'GBX') {
    return { currency: 'GBP', subunitDivisor: 100 };
  }
  if (trimmed === 'ZAc') {
    return { currency: 'ZAR', subunitDivisor: 100 };
  }
  if (trimmed === 'ILA') {
    return { currency: 'ILS', subunitDivisor: 100 };
  }
  return { currency: trimmed.toUpperCase(), subunitDivisor: 1 };
}

/**
 * Return the Yahoo Finance FX pair (`<COST><YAHOO>=X`) needed to convert
 * a dividend denominated in `yahooCurrency` into `costCurrency`, or `null`
 * when no conversion is needed.
 */
export function getFxSymbol(
  costCurrency: string,
  yahooCurrency: string | null | undefined,
): string | null {
  const costCur = costCurrency.trim().toUpperCase();
  const { currency: yahooCur } = normalizeQuoteCurrency(yahooCurrency);

  if (!/^[A-Z]{3}$/.test(costCur) || !/^[A-Z]{3}$/.test(yahooCur)) {
    return null;
  }
  if (costCur === yahooCur) {
    return null;
  }
  return `${costCur}${yahooCur}=X`;
}

/**
 * Determine the annual per-share dividend amount in the stock's quote currency.
 * Falls back from forward `annualRate` to the latest complete historical year,
 * and finally to `yieldPercent * currentPrice`.
 */
export function resolveAnnualDividendAmount(
  dividend: AssetFundamentals['dividend'],
  currentPrice: number,
): number | null {
  if (dividend.annualRate !== null && Number.isFinite(dividend.annualRate) && dividend.annualRate > 0) {
    return dividend.annualRate;
  }

  if (Array.isArray(dividend.annualHistory) && dividend.annualHistory.length > 0) {
    const completeYears = dividend.annualHistory.filter((pt) => !pt.isPartial && pt.amount > 0);
    const pool =
      completeYears.length > 0
        ? completeYears
        : dividend.annualHistory.filter((pt) => pt.amount > 0);
    if (pool.length > 0) {
      return pool[pool.length - 1].amount;
    }
  }

  if (
    dividend.yieldPercent !== null &&
    Number.isFinite(dividend.yieldPercent) &&
    dividend.yieldPercent > 0 &&
    Number.isFinite(currentPrice) &&
    currentPrice > 0
  ) {
    return (dividend.yieldPercent / 100) * currentPrice;
  }

  return null;
}

/**
 * Compute the user's personal dividend yield (Yield on Cost / YoC) against their
 * per-share purchase price, handling subunit quote currencies and live FX rates.
 */
export function computePersonalDividendYield(params: {
  costBasis: PersonalCostBasis | null | undefined;
  dividend: AssetFundamentals['dividend'];
  currentPrice: number;
  yahooCurrency: string | null | undefined;
  fxRate?: number | null;
}): PersonalDividendYieldResult {
  const { costBasis, dividend, currentPrice, yahooCurrency, fxRate } = params;

  if (!costBasis || !Number.isFinite(costBasis.price) || costBasis.price <= 0) {
    return {
      personalYieldPercent: null,
      annualDividendInCostCurrency: null,
      deltaPercentagePoints: null,
      fxSymbol: null,
      needsFxRate: false,
      fxConverted: false,
    };
  }

  const { subunitDivisor } = normalizeQuoteCurrency(yahooCurrency);
  const fxSymbol = getFxSymbol(costBasis.currency, yahooCurrency);
  const rawAnnualDiv = resolveAnnualDividendAmount(dividend, currentPrice);

  if (rawAnnualDiv === null || rawAnnualDiv <= 0) {
    return {
      personalYieldPercent: 0,
      annualDividendInCostCurrency: 0,
      deltaPercentagePoints:
        dividend.yieldPercent !== null ? Number((0 - dividend.yieldPercent).toFixed(2)) : null,
      fxSymbol,
      needsFxRate: false,
      fxConverted: false,
    };
  }

  const annualDivMajor = rawAnnualDiv / subunitDivisor;

  let annualDividendInCostCurrency: number;
  let fxConverted = false;

  if (fxSymbol !== null) {
    if (fxRate === null || fxRate === undefined || !Number.isFinite(fxRate) || fxRate <= 0) {
      return {
        personalYieldPercent: null,
        annualDividendInCostCurrency: null,
        deltaPercentagePoints: null,
        fxSymbol,
        needsFxRate: true,
        fxConverted: false,
      };
    }
    annualDividendInCostCurrency = annualDivMajor / fxRate;
    fxConverted = true;
  } else {
    annualDividendInCostCurrency = annualDivMajor;
  }

  const personalYieldPercent = Number(
    ((annualDividendInCostCurrency / costBasis.price) * 100).toFixed(2),
  );
  const deltaPercentagePoints =
    dividend.yieldPercent !== null && Number.isFinite(dividend.yieldPercent)
      ? Number((personalYieldPercent - dividend.yieldPercent).toFixed(2))
      : null;

  return {
    personalYieldPercent,
    annualDividendInCostCurrency: Number(annualDividendInCostCurrency.toFixed(4)),
    deltaPercentagePoints,
    fxSymbol,
    needsFxRate: false,
    fxConverted,
  };
}

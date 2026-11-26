import React, { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  BarChart3,
  Check,
  Coins,
  PanelRightClose,
  Pencil,
  RefreshCw,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { resolveCanonicalSymbol } from '../../../shared/catalog.ts';
import type { AssetFundamentals } from '../../../shared/types.ts';
import { computePersonalDividendYield, getFxSymbol } from '../../engine/dividendYield.ts';
import { useAssetFundamentalsQuery, useFxRateQuery } from '../../hooks/useMarketData.ts';
import { useDashboardStore } from '../../store/dashboardStore.ts';

interface FundamentalsSidebarProps {
  symbol: string;
  assetName: string;
  shortName: string;
  currentPrice: number;
  decimals: number;
  unit: string;
  onCollapse: () => void;
  onSelectSymbol: (sym: string) => void;
}

function fmtNum(val: number | null | undefined, digits = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(val);
}

function fmtPct(val: number | null | undefined, digits = 2, signed = false): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const prefix = signed && val > 0 ? '+' : '';
  return `${prefix}${fmtNum(val, digits)} %`;
}

function fmtLargeMoney(val: number | null | undefined, currency?: string | null): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const cur = currency ? ` ${currency}` : '';
  const abs = Math.abs(val);
  if (abs >= 1e12) return `${fmtNum(val / 1e12, 2)} Bio.${cur}`;
  if (abs >= 1e9) return `${fmtNum(val / 1e9, 1)} Mrd.${cur}`;
  if (abs >= 1e6) return `${fmtNum(val / 1e6, 1)} Mio.${cur}`;
  return `${fmtNum(val, 0)}${cur}`;
}

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

function quoteTypeGerman(qt: string | null): string {
  switch (qt) {
    case 'EQUITY':
      return 'Aktie';
    case 'ETF':
      return 'ETF / Fonds';
    case 'CRYPTOCURRENCY':
      return 'Kryptowährung';
    case 'FUTURE':
      return 'Futures / Rohstoff';
    case 'INDEX':
      return 'Index';
    case 'CURRENCY':
      return 'Devisenpaar';
    default:
      return 'Marktwert';
  }
}

function MetricCell({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative' | 'accent';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-300'
      : tone === 'negative'
        ? 'text-rose-300'
        : tone === 'accent'
          ? 'text-amber-300'
          : 'text-slate-100';

  return (
    <div className="rounded-md border border-slate-800/80 bg-slate-900/55 px-2 py-1.5">
      <div className="truncate text-[10px] text-slate-400">{label}</div>
      <div className={`font-mono-num mt-0.5 text-[11.5px] font-semibold ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

function RangeBar52W({
  low,
  high,
  current,
  decimals,
}: {
  low: number;
  high: number;
  current: number;
  decimals: number;
}) {
  const span = high - low;
  const pct = span > 0 ? Math.max(0, Math.min(100, ((current - low) / span) * 100)) : 50;

  return (
    <div className="rounded-md border border-slate-800/80 bg-slate-900/50 px-2 py-1.5">
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>52W Spanne</span>
        <span className="font-mono-num text-slate-300">{Math.round(pct)} %</span>
      </div>
      <div className="relative my-1.5 h-1.5 w-full rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500/70 via-sky-400 to-emerald-400"
          style={{ width: `${pct}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-white shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="font-mono-num flex items-center justify-between text-[10px] text-slate-400">
        <span>{fmtNum(low, decimals)}</span>
        <span>{fmtNum(high, decimals)}</span>
      </div>
    </div>
  );
}

function AnalystTargetBar({
  low,
  mean,
  high,
  current,
  decimals,
}: {
  low: number;
  mean: number;
  high: number;
  current: number;
  decimals: number;
}) {
  const minVal = Math.min(low, current);
  const maxVal = Math.max(high, current);
  const span = maxVal - minVal;
  const pos = (v: number) =>
    span > 0 ? Math.max(2, Math.min(98, ((v - minVal) / span) * 100)) : 50;

  return (
    <div className="space-y-1 rounded-md border border-slate-800/80 bg-slate-900/50 px-2 py-1.5">
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>Kursziel-Korridor</span>
        <span className="font-mono-num text-sky-300">Ø {fmtNum(mean, decimals)}</span>
      </div>
      <div className="relative my-1.5 h-2 rounded-full bg-slate-800">
        <div
          className="absolute top-0 h-full rounded-full bg-sky-500/35"
          style={{
            left: `${pos(low)}%`,
            width: `${Math.max(4, pos(high) - pos(low))}%`,
          }}
        />
        <span
          className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-sky-400"
          title={`Ø Ziel: ${fmtNum(mean, decimals)}`}
          style={{ left: `${pos(mean)}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-950 bg-amber-400"
          title={`Aktuell: ${fmtNum(current, decimals)}`}
          style={{ left: `${pos(current)}%` }}
        />
      </div>
      <div className="font-mono-num flex items-center justify-between text-[10px] text-slate-400">
        <span>Tief: {fmtNum(low, decimals)}</span>
        <span>Hoch: {fmtNum(high, decimals)}</span>
      </div>
    </div>
  );
}

function hasEquityOrEtfMetrics(f: AssetFundamentals): boolean {
  return (
    f.valuation.trailingPE !== null ||
    f.valuation.forwardPE !== null ||
    f.valuation.priceToBook !== null ||
    f.growthAndQuality.earningsGrowthPercent !== null ||
    f.dividend.yieldPercent !== null ||
    f.dividend.annualHistory.length > 0 ||
    f.analyst.recommendationLabel !== null ||
    f.expenseRatioPercent !== null
  );
}

export const FundamentalsSidebar: React.FC<FundamentalsSidebarProps> = React.memo(({
  symbol,
  assetName,
  shortName,
  currentPrice,
  decimals,
  unit,
  onCollapse,
  onSelectSymbol,
}) => {
  const fundamentalsQuery = useAssetFundamentalsQuery(symbol, true);
  const data = fundamentalsQuery.data;

  const { personalCostBasis, setPersonalCostBasis } = useDashboardStore(
    useShallow((s) => ({
      personalCostBasis: s.personalCostBasis,
      setPersonalCostBasis: s.setPersonalCostBasis,
    })),
  );
  const canonicalSymbol = resolveCanonicalSymbol(symbol);
  const costBasis = personalCostBasis[canonicalSymbol] ?? null;

  const [editingCostBasis, setEditingCostBasis] = useState(false);
  const [costPriceInput, setCostPriceInput] = useState('');
  const [costCurrencyInput, setCostCurrencyInput] = useState('EUR');

  useEffect(() => {
    setEditingCostBasis(false);
  }, [canonicalSymbol]);

  const fxSymbol =
    costBasis && data ? getFxSymbol(costBasis.currency, data.currency ?? unit) : null;
  const fxQuery = useFxRateQuery(fxSymbol);
  const personalDiv = data
    ? computePersonalDividendYield({
        costBasis,
        dividend: data.dividend,
        currentPrice,
        yahooCurrency: data.currency ?? unit,
        fxRate: fxQuery.data ?? null,
      })
    : null;

  const openCostEditor = () => {
    setCostPriceInput(costBasis ? String(costBasis.price).replace('.', ',') : '');
    setCostCurrencyInput(costBasis?.currency || 'EUR');
    setEditingCostBasis(true);
  };

  const handleSaveCostBasis = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseFloat(costPriceInput.trim().replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setPersonalCostBasis(canonicalSymbol, {
      price: parsed,
      currency: costCurrencyInput,
      source: 'manual',
    });
    setEditingCostBasis(false);
  };

  const recentDividends = data?.dividend.annualHistory.slice(-8) ?? [];
  const maxDivAmount = recentDividends.reduce((m, y) => Math.max(m, y.amount), 0);

  const recBadgeCls =
    data?.analyst.recommendationKey === 'strong_buy' || data?.analyst.recommendationKey === 'buy'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
      : data?.analyst.recommendationKey === 'sell' ||
          data?.analyst.recommendationKey === 'underperform'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
        : 'border-amber-500/40 bg-amber-500/15 text-amber-200';

  const breakdown = data?.analyst.breakdown;
  const breakdownTotal = breakdown
    ? breakdown.strongBuy +
      breakdown.buy +
      breakdown.hold +
      breakdown.sell +
      breakdown.strongSell
    : 0;

  return (
    <aside
      aria-label="Fundamentaldaten-Sidebar"
      className="widget-no-drag flex w-[265px] shrink-0 flex-col overflow-hidden border-l border-slate-800/80 bg-[#0d1422] xl:w-[295px]"
    >
      {/* Sidebar Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 bg-[#0f1726] px-2.5 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <span className="text-xs font-semibold text-slate-100">Fundamentaldaten</span>
            <span className="font-mono-num truncate rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-sky-300">
              {symbol}
            </span>
          </div>
          <div className="truncate text-[10px] text-slate-400">
            {data?.sector
              ? `${data.sector}${data.industry ? ` · ${data.industry}` : ''}`
              : data
                ? `${quoteTypeGerman(data.quoteType)} · ${shortName}`
                : assetName}
          </div>
        </div>

        <button
          type="button"
          onClick={onCollapse}
          title="Fundamental-Sidebar einklappen"
          aria-label="Fundamental-Sidebar einklappen"
          className="widget-no-drag rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
        {fundamentalsQuery.isLoading && !data ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
            <span>Lade Fundamentaldaten für {shortName}…</span>
          </div>
        ) : fundamentalsQuery.isError && !data ? (
          <div className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <div>Fundamentaldaten derzeit nicht abrufbar.</div>
            <button
              type="button"
              onClick={() => fundamentalsQuery.refetch()}
              className="widget-no-drag rounded border border-rose-400/40 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-100 hover:bg-slate-800"
            >
              Erneut laden
            </button>
          </div>
        ) : data ? (
          <>
            {/* 1. Überblick */}
            <section className="space-y-1.5">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                Überblick
              </h4>
              <div className="grid grid-cols-2 gap-1.5">
                {data.totalAssets !== null ? (
                  <MetricCell
                    label="Fondsvermögen"
                    value={fmtLargeMoney(data.totalAssets, data.currency)}
                  />
                ) : (
                  <MetricCell
                    label="Marktkap."
                    value={fmtLargeMoney(data.marketCap, data.currency)}
                  />
                )}

                {data.quoteType === 'CRYPTOCURRENCY' && data.circulatingSupply !== null ? (
                  <MetricCell
                    label="Umlaufmenge"
                    value={`${fmtNum(data.circulatingSupply / 1e6, 2)} Mio.`}
                  />
                ) : data.expenseRatioPercent !== null ? (
                  <MetricCell
                    label="Kostenquote (TER)"
                    value={fmtPct(data.expenseRatioPercent, 2)}
                  />
                ) : (
                  <MetricCell label="Beta" value={fmtNum(data.beta, 2)} />
                )}

                {data.nextEarningsDate && (
                  <MetricCell
                    label="Nächste Zahlen"
                    value={fmtShortDate(data.nextEarningsDate)}
                  />
                )}
                {data.quoteType === 'EQUITY' && (
                  <MetricCell
                    label="Aktueller Kurs"
                    value={`${fmtNum(currentPrice, decimals)} ${data.currency ?? unit}`}
                  />
                )}
              </div>

              {data.fiftyTwoWeekLow !== null && data.fiftyTwoWeekHigh !== null && (
                <RangeBar52W
                  low={data.fiftyTwoWeekLow}
                  high={data.fiftyTwoWeekHigh}
                  current={currentPrice}
                  decimals={decimals}
                />
              )}
            </section>

            {hasEquityOrEtfMetrics(data) ? (
              <>
                {/* 2. Bewertung */}
                <section className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                  <h4 className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                    Bewertung
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    <MetricCell
                      label="KGV (TTM)"
                      value={fmtNum(data.valuation.trailingPE, 2)}
                    />
                    <MetricCell
                      label="Forward KGV"
                      value={fmtNum(data.valuation.forwardPE, 2)}
                      tone={
                        data.valuation.forwardPE !== null &&
                        data.valuation.trailingPE !== null &&
                        data.valuation.forwardPE < data.valuation.trailingPE
                          ? 'positive'
                          : 'default'
                      }
                    />
                    <MetricCell label="KBV" value={fmtNum(data.valuation.priceToBook, 2)} />
                    <MetricCell label="KUV" value={fmtNum(data.valuation.priceToSales, 2)} />
                    <MetricCell label="PEG Ratio" value={fmtNum(data.valuation.pegRatio, 2)} />
                    <MetricCell label="EV / EBITDA" value={fmtNum(data.valuation.evToEbitda, 2)} />
                    <MetricCell
                      label="EPS (TTM)"
                      value={
                        data.valuation.trailingEps !== null
                          ? `${fmtNum(data.valuation.trailingEps, 2)} ${data.currency ?? ''}`.trim()
                          : '—'
                      }
                    />
                    <MetricCell
                      label="EPS (Fwd)"
                      value={
                        data.valuation.forwardEps !== null
                          ? `${fmtNum(data.valuation.forwardEps, 2)} ${data.currency ?? ''}`.trim()
                          : '—'
                      }
                    />
                  </div>
                </section>

                {/* 3. Wachstum & Qualität */}
                {data.quoteType !== 'ETF' && (
                  <section className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                    <h4 className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                      Wachstum &amp; Qualität
                    </h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      <MetricCell
                        label="Gewinnwachstum"
                        value={fmtPct(data.growthAndQuality.earningsGrowthPercent, 1, true)}
                        tone={
                          (data.growthAndQuality.earningsGrowthPercent ?? 0) > 0
                            ? 'positive'
                            : (data.growthAndQuality.earningsGrowthPercent ?? 0) < 0
                              ? 'negative'
                              : 'default'
                        }
                      />
                      <MetricCell
                        label="Umsatzwachstum"
                        value={fmtPct(data.growthAndQuality.revenueGrowthPercent, 1, true)}
                        tone={
                          (data.growthAndQuality.revenueGrowthPercent ?? 0) > 0
                            ? 'positive'
                            : (data.growthAndQuality.revenueGrowthPercent ?? 0) < 0
                              ? 'negative'
                              : 'default'
                        }
                      />
                      <MetricCell
                        label="Eigenkapitalrendite (ROE)"
                        value={fmtPct(data.growthAndQuality.returnOnEquityPercent, 1)}
                        tone={
                          (data.growthAndQuality.returnOnEquityPercent ?? 0) >= 15
                            ? 'positive'
                            : 'default'
                        }
                      />
                      <MetricCell
                        label="Nettomarge"
                        value={fmtPct(data.growthAndQuality.profitMarginPercent, 1)}
                      />
                      <MetricCell
                        label="Op. Marge"
                        value={fmtPct(data.growthAndQuality.operatingMarginPercent, 1)}
                      />
                      <MetricCell
                        label="Verschuldung (D/E)"
                        value={fmtPct(data.growthAndQuality.debtToEquityPercent, 1)}
                      />
                      <MetricCell
                        label="Free Cashflow"
                        value={fmtLargeMoney(data.growthAndQuality.freeCashflow, data.currency)}
                      />
                    </div>
                  </section>
                )}

                {/* 4. Dividende & Historie */}
                <section className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                  <h4 className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                    <Coins className="h-3 w-3 text-amber-400" />
                    Dividende &amp; Historie
                  </h4>

                  {data.dividend.yieldPercent !== null || recentDividends.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        <MetricCell
                          label="Dividendenrendite"
                          value={fmtPct(data.dividend.yieldPercent, 2)}
                          tone={
                            (data.dividend.yieldPercent ?? 0) > 0 ? 'accent' : 'default'
                          }
                        />
                        <div
                          className="rounded-md border border-slate-800/80 bg-slate-900/55 px-2 py-1.5"
                          title={
                            personalDiv?.deltaPercentagePoints !== null &&
                            personalDiv?.deltaPercentagePoints !== undefined
                              ? `Abweichung zur akt. Rendite: ${fmtPct(personalDiv.deltaPercentagePoints, 2, true)}${
                                  personalDiv.fxConverted && fxQuery.data
                                    ? ` · FX ${fxSymbol}: ${fmtNum(fxQuery.data, 4)}`
                                    : ''
                                }`
                              : 'Persönliche Dividendenrendite auf deinen Einstandskurs (Yield on Cost)'
                          }
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-[10px] text-slate-400">
                              Pers. Rendite (YoC)
                            </span>
                            {costBasis && (
                              <button
                                type="button"
                                onClick={openCostEditor}
                                aria-label="Einstandskurs bearbeiten"
                                title="Einstandskurs bearbeiten"
                                className="widget-no-drag rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </div>
                          <div
                            className={`font-mono-num mt-0.5 text-[11.5px] font-semibold ${
                              personalDiv?.personalYieldPercent !== null &&
                              personalDiv?.personalYieldPercent !== undefined
                                ? personalDiv.personalYieldPercent >=
                                  (data.dividend.yieldPercent ?? 0)
                                  ? 'text-emerald-300'
                                  : 'text-sky-300'
                                : 'text-slate-400'
                            }`}
                          >
                            {costBasis && personalDiv?.needsFxRate && fxQuery.isLoading
                              ? '…'
                              : personalDiv?.personalYieldPercent !== null &&
                                  personalDiv?.personalYieldPercent !== undefined
                                ? fmtPct(personalDiv.personalYieldPercent, 2)
                                : '—'}
                          </div>
                          <div className="mt-0.5 truncate text-[9.5px] text-slate-500">
                            {costBasis ? (
                              <span className="font-mono-num">
                                EK {fmtNum(costBasis.price, 2)} {costBasis.currency}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={openCostEditor}
                                aria-label="Einstandskurs eingeben"
                                className="widget-no-drag text-sky-400 hover:text-sky-300 hover:underline"
                              >
                                + Einstandskurs
                              </button>
                            )}
                          </div>
                        </div>
                        {editingCostBasis && (
                          <form
                            onSubmit={handleSaveCostBasis}
                            className="col-span-2 flex flex-wrap items-center gap-1 rounded-md border border-sky-500/40 bg-slate-950/90 p-1.5"
                          >
                            <input
                              type="text"
                              inputMode="decimal"
                              autoFocus
                              aria-label="Einstandskurs"
                              placeholder="z. B. 125,50"
                              value={costPriceInput}
                              onChange={(e) => setCostPriceInput(e.target.value)}
                              className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-100 outline-none focus:border-sky-500"
                            />
                            <select
                              aria-label="Einstandswährung"
                              value={costCurrencyInput}
                              onChange={(e) => setCostCurrencyInput(e.target.value)}
                              className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-slate-200 outline-none focus:border-sky-500"
                            >
                              <option value="EUR">EUR</option>
                              <option value="USD">USD</option>
                              <option value="CHF">CHF</option>
                              <option value="GBP">GBP</option>
                            </select>
                            <button
                              type="submit"
                              aria-label="Einstandskurs speichern"
                              className="inline-flex items-center gap-0.5 rounded bg-sky-500/25 px-2 py-1 text-[10.5px] font-semibold text-sky-200 hover:bg-sky-500/35"
                            >
                              <Check className="h-3 w-3" />
                              OK
                            </button>
                            {costBasis && (
                              <button
                                type="button"
                                aria-label="Einstandskurs löschen"
                                title="Einstandskurs entfernen"
                                onClick={() => {
                                  setPersonalCostBasis(canonicalSymbol, null);
                                  setEditingCostBasis(false);
                                }}
                                className="rounded border border-rose-500/35 bg-rose-500/15 p-1 text-rose-300 hover:bg-rose-500/25"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label="Einstandskurs-Bearbeitung abbrechen"
                              onClick={() => setEditingCostBasis(false)}
                              className="rounded border border-slate-700 p-1 text-slate-400 hover:text-slate-200"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </form>
                        )}
                        <MetricCell
                          label="Jahresdividende"
                          value={
                            data.dividend.annualRate !== null
                              ? `${fmtNum(data.dividend.annualRate, 2)} ${data.currency ?? ''}`.trim()
                              : '—'
                          }
                        />
                        <MetricCell
                          label="Ausschüttungsquote"
                          value={fmtPct(data.dividend.payoutRatioPercent, 1)}
                        />
                        <MetricCell
                          label="5J-Ø Rendite"
                          value={fmtPct(data.dividend.fiveYearAvgYieldPercent, 2)}
                        />
                        <MetricCell
                          label="5J-Wachstum (CAGR)"
                          value={fmtPct(data.dividend.cagr5yPercent, 1, true)}
                          tone={
                            (data.dividend.cagr5yPercent ?? 0) > 0
                              ? 'positive'
                              : (data.dividend.cagr5yPercent ?? 0) < 0
                                ? 'negative'
                                : 'default'
                          }
                        />
                        <MetricCell
                          label="Ex-Dividende"
                          value={fmtShortDate(data.dividend.exDividendDate)}
                        />
                      </div>

                      {recentDividends.length > 0 && (
                        <div className="rounded-md border border-slate-800/80 bg-slate-900/50 p-2">
                          <div className="mb-1.5 flex items-center justify-between text-[10px]">
                            <span className="font-medium text-slate-300">Dividendenhistorie</span>
                            <span className="text-slate-400">
                              {data.dividend.consecutiveYears > 0
                                ? `${data.dividend.consecutiveYears} J. in Folge`
                                : `${recentDividends.length} J.`}
                            </span>
                          </div>
                          <div className="flex h-16 items-end gap-1 pt-1">
                            {recentDividends.map((pt) => {
                              const heightPct =
                                maxDivAmount > 0
                                  ? Math.max(14, Math.round((pt.amount / maxDivAmount) * 100))
                                  : 14;
                              return (
                                <div
                                  key={pt.year}
                                  className="flex flex-1 flex-col items-center justify-end gap-0.5"
                                  title={`${pt.year}: ${fmtNum(pt.amount, 2)} ${data.currency ?? ''} (${pt.payments}×${pt.isPartial ? ', lfd.' : ''})`}
                                >
                                  <div
                                    className={`w-full rounded-t transition-all ${
                                      pt.isPartial ? 'bg-amber-400/45' : 'bg-amber-400/85'
                                    }`}
                                    style={{ height: `${heightPct}%` }}
                                  />
                                  <span className="font-mono-num text-[8.5px] text-slate-500">
                                    {String(pt.year).slice(-2)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="font-mono-num mt-1 flex items-center justify-between text-[9.5px] text-slate-400">
                            <span>
                              {recentDividends[0].year}: {fmtNum(recentDividends[0].amount, 2)}
                            </span>
                            <span>
                              {recentDividends[recentDividends.length - 1].year}:{' '}
                              {fmtNum(recentDividends[recentDividends.length - 1].amount, 2)}
                              {recentDividends[recentDividends.length - 1].isPartial ? '*' : ''}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-md border border-slate-800/80 bg-slate-900/40 px-2.5 py-2 text-[11px] text-slate-400">
                      Zahlt aktuell keine Dividende.
                    </div>
                  )}
                </section>

                {/* 5. Analysten-Konsens */}
                {data.quoteType !== 'ETF' && (
                  <section className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                    <h4 className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                      <Users className="h-3 w-3 text-sky-400" />
                      Analysten-Konsens
                    </h4>

                    {data.analyst.recommendationLabel || data.analyst.targetMean !== null ? (
                      <>
                        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-800/80 bg-slate-900/55 px-2.5 py-1.5">
                          <span
                            className={`rounded border px-2 py-0.5 text-[11px] font-bold ${recBadgeCls}`}
                          >
                            {data.analyst.recommendationLabel ?? 'Keine Einstufung'}
                          </span>
                          <div className="text-right text-[10.5px]">
                            {data.analyst.recommendationMean !== null && (
                              <span className="font-mono-num font-semibold text-slate-200">
                                {fmtNum(data.analyst.recommendationMean, 2)} / 5
                              </span>
                            )}
                            {data.analyst.numberOfAnalysts !== null && (
                              <span className="ml-1 text-slate-400">
                                ({data.analyst.numberOfAnalysts})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <MetricCell
                            label="Kursziel (Ø)"
                            value={
                              data.analyst.targetMean !== null
                                ? `${fmtNum(data.analyst.targetMean, decimals)} ${data.currency ?? ''}`.trim()
                                : '—'
                            }
                          />
                          <MetricCell
                            label="Potenzial"
                            value={fmtPct(data.analyst.upsidePercent, 1, true)}
                            tone={
                              (data.analyst.upsidePercent ?? 0) > 0
                                ? 'positive'
                                : (data.analyst.upsidePercent ?? 0) < 0
                                  ? 'negative'
                                  : 'default'
                            }
                          />
                        </div>

                        {data.analyst.targetLow !== null &&
                          data.analyst.targetMean !== null &&
                          data.analyst.targetHigh !== null && (
                            <AnalystTargetBar
                              low={data.analyst.targetLow}
                              mean={data.analyst.targetMean}
                              high={data.analyst.targetHigh}
                              current={currentPrice}
                              decimals={decimals}
                            />
                          )}

                        {breakdown && breakdownTotal > 0 && (
                          <div className="space-y-1.5 rounded-md border border-slate-800/80 bg-slate-900/50 p-2">
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="bg-emerald-500"
                                style={{
                                  width: `${(breakdown.strongBuy / breakdownTotal) * 100}%`,
                                }}
                              />
                              <div
                                className="bg-emerald-400/75"
                                style={{
                                  width: `${(breakdown.buy / breakdownTotal) * 100}%`,
                                }}
                              />
                              <div
                                className="bg-amber-400"
                                style={{
                                  width: `${(breakdown.hold / breakdownTotal) * 100}%`,
                                }}
                              />
                              <div
                                className="bg-rose-500"
                                style={{
                                  width: `${((breakdown.sell + breakdown.strongSell) / breakdownTotal) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="grid grid-cols-4 gap-1 text-center text-[9.5px]">
                              <div>
                                <div className="font-mono-num font-semibold text-emerald-300">
                                  {breakdown.strongBuy}
                                </div>
                                <div className="text-slate-500">Stark K.</div>
                              </div>
                              <div>
                                <div className="font-mono-num font-semibold text-emerald-400">
                                  {breakdown.buy}
                                </div>
                                <div className="text-slate-500">Kauf</div>
                              </div>
                              <div>
                                <div className="font-mono-num font-semibold text-amber-300">
                                  {breakdown.hold}
                                </div>
                                <div className="text-slate-500">Halten</div>
                              </div>
                              <div>
                                <div className="font-mono-num font-semibold text-rose-400">
                                  {breakdown.sell + breakdown.strongSell}
                                </div>
                                <div className="text-slate-500">Verkauf</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-md border border-slate-800/80 bg-slate-900/40 px-2.5 py-2 text-[11px] text-slate-400">
                        Keine aktuellen Analysten-Schätzungen verfügbar.
                      </div>
                    )}
                  </section>
                )}
              </>
            ) : (
              /* Non-equity asset helpful info & quick equity switch */
              <section className="space-y-2 border-t border-slate-800/80 pt-2.5">
                <div className="rounded-md border border-slate-800/80 bg-slate-900/50 p-2.5 text-[11px] leading-relaxed text-slate-400">
                  Rohstoffe, Indizes, Krypto und Devisen besitzen keine Unternehmensbilanzen,
                  KGV- oder Dividendenkennzahlen. Wähle eine Aktie für volle Fundamentaldaten:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { sym: 'AAPL', label: 'AAPL · Apple' },
                    { sym: 'NVDA', label: 'NVDA · NVIDIA' },
                    { sym: 'SAP.DE', label: 'SAP.DE · SAP' },
                  ].map((item) => (
                    <button
                      key={item.sym}
                      type="button"
                      onClick={() => onSelectSymbol(item.sym)}
                      className="widget-no-drag rounded-md border border-sky-500/35 bg-sky-500/12 px-2 py-1 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-500/22"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
});

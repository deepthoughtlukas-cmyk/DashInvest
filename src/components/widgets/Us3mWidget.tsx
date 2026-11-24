import React from 'react';
import { Activity, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import type { MacroOverview } from '../../../shared/types.ts';
import { MacroSparkChart } from './MacroSparkChart.tsx';

interface Us3mWidgetProps {
  macro?: MacroOverview;
  isLoading: boolean;
}

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);

function fmtDateShort(iso: string): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export const Us3mWidget: React.FC<Us3mWidgetProps> = ({ macro, isLoading }) => {
  if (isLoading && !macro) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        Lade 3M US-Treasury Renditen…
      </div>
    );
  }
  if (!macro?.us3m) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-rose-400">
        US 3M nicht verfügbar
      </div>
    );
  }

  const {
    yieldPercent,
    change1dBps,
    change1wBps,
    change1mBps,
    change3mBps,
    spread10y3mBps,
    curveStatus,
    history,
    momentum,
  } = macro.us3m;

  const momBadgeStyle =
    momentum.status === 'turning_up'
      ? 'border-rose-500/45 bg-rose-500/15 text-rose-200'
      : momentum.status === 'turning_down'
        ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-200'
        : momentum.status === 'rising'
          ? 'border-amber-500/35 bg-amber-500/12 text-amber-200'
          : momentum.status === 'falling'
            ? 'border-sky-500/35 bg-sky-500/12 text-sky-200'
            : 'border-slate-700 bg-slate-800/80 text-slate-300';

  const MomIcon =
    momentum.direction === 'up'
      ? TrendingUp
      : momentum.direction === 'down'
        ? TrendingDown
        : Activity;

  const leadPillStyle =
    momentum.leadSignal === 'diverging_up'
      ? 'border-rose-500/35 bg-rose-500/10 text-rose-300'
      : momentum.leadSignal === 'diverging_down'
        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
        : 'border-slate-700/80 bg-slate-800/70 text-slate-300';

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      {/* Header Yield + 10Y-3M Curve Spread */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono-num text-2xl font-bold text-slate-50">
              {fmt(yieldPercent, 3)} %
            </span>
            <span
              className={`font-mono-num text-xs font-semibold ${
                change1dBps <= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {change1dBps >= 0 ? '+' : ''}
              {change1dBps} bps (1T)
            </span>
          </div>
          <div className="font-mono-num mt-0.5 flex flex-wrap gap-2 text-[10.5px] text-slate-400">
            <span>
              1W: {change1wBps >= 0 ? '+' : ''}
              {change1wBps} bps
            </span>
            <span>
              1M: {change1mBps >= 0 ? '+' : ''}
              {change1mBps} bps
            </span>
            <span>
              3M: {change3mBps >= 0 ? '+' : ''}
              {change3mBps} bps
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              curveStatus === 'inverted'
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                : curveStatus === 'flat'
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
            }`}
          >
            10J–3M:{' '}
            {spread10y3mBps !== null
              ? `${spread10y3mBps >= 0 ? '+' : ''}${spread10y3mBps} bps`
              : '—'}
          </span>
          <span className="text-[10px] text-slate-500">
            {curveStatus === 'inverted'
              ? 'Kurve invertiert'
              : curveStatus === 'flat'
                ? 'Kurve flach'
                : 'Kurve normal'}
          </span>
        </div>
      </div>

      {/* Leading Momentum-Turn Indicator */}
      <div
        aria-label="3M Momentum-Indikator"
        className={`rounded-lg border px-2.5 py-2 text-[11px] ${momBadgeStyle}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 font-semibold">
            {momentum.isTurning ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <MomIcon className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>{momentum.statusLabel}</span>
          </div>

          <div className="font-mono-num flex flex-wrap items-center gap-2 text-[10px] opacity-90">
            <span>
              Mom: {momentum.momentumBps >= 0 ? '+' : ''}
              {fmt(momentum.momentumBps, 1)} bps
            </span>
            <span>
              Δ5T: {momentum.momentumDelta5dBps >= 0 ? '+' : ''}
              {fmt(momentum.momentumDelta5dBps, 1)} bps
            </span>
            {momentum.lastTurnDate && (
              <span>Drehung {fmtDateShort(momentum.lastTurnDate)}</span>
            )}
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
          <span className="text-[10.5px] leading-snug opacity-90">{momentum.summary}</span>
          <span
            className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${leadPillStyle}`}
          >
            {momentum.leadSummary}
          </span>
        </div>
      </div>

      {/* Sparkline + Optional S&P 500 & Gold Overlay */}
      <MacroSparkChart
        series={history}
        comparisons={macro.comparisons}
        defaultOverlay="none"
        color="#22d3ee"
        unitSuffix=" %"
        decimals={2}
        defaultRange="3Y"
      />
    </div>
  );
};

import React, { useState } from 'react';
import type { MacroOverview } from '../../../shared/types.ts';
import { MacroSparkChart } from './MacroSparkChart.tsx';

interface NetLiquidityWidgetProps {
  macro?: MacroOverview;
  isLoading: boolean;
}

const fmt = (n: number, d = 1) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);

export const NetLiquidityWidget: React.FC<NetLiquidityWidgetProps> = ({ macro, isLoading }) => {
  const [overlay, setOverlay] = useState<'none' | 'sp500' | 'gold'>('sp500');

  if (isLoading && !macro) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-500">
        Lade US-Netto-Liquidität…
      </div>
    );
  }
  if (!macro) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-rose-400">
        Net-Liquidity nicht verfügbar
      </div>
    );
  }

  const {
    currentB,
    currentT,
    fedAssetsB,
    tgaB,
    rrpB,
    delta4wB,
    delta4wPercent,
    delta13wB,
    delta13wPercent,
    impulse,
    date,
    history,
  } = macro.netLiquidity;

  const overlaySeries =
    overlay === 'sp500'
      ? macro.comparisons.sp500
      : overlay === 'gold'
        ? macro.comparisons.gold
        : undefined;

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono-num text-2xl font-bold text-slate-50">
              {fmt(currentT, 2)} Bio. $
            </span>
            <span className="font-mono-num text-xs text-slate-400">
              ({fmt(currentB, 0)} Mrd. $)
            </span>
          </div>
          <div className="font-mono-num mt-0.5 flex flex-wrap gap-3 text-[11px] text-slate-400">
            <span>
              4W:{' '}
              <strong className={delta4wB >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {delta4wB >= 0 ? '+' : ''}
                {fmt(delta4wB, 0)} Mrd. ({delta4wPercent >= 0 ? '+' : ''}
                {fmt(delta4wPercent, 2)}%)
              </strong>
            </span>
            <span>
              13W:{' '}
              <strong className={delta13wB >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {delta13wB >= 0 ? '+' : ''}
                {fmt(delta13wB, 0)} Mrd. ({delta13wPercent >= 0 ? '+' : ''}
                {fmt(delta13wPercent, 2)}%)
              </strong>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              impulse === 'expanding'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : impulse === 'contracting'
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                  : 'border-slate-700 bg-slate-800/70 text-slate-300'
            }`}
          >
            {impulse === 'expanding'
              ? 'Liquiditäts-Expansion'
              : impulse === 'contracting'
                ? 'Liquiditäts-Entzug'
                : 'Liquidität Stabil'}
          </span>
          <span className="text-[10px] text-slate-500">Stand: {date}</span>
        </div>
      </div>

      {/* 3-Driver Formula Breakdown */}
      <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-slate-800/80 bg-slate-900/60 px-2.5 py-1.5 text-[10.5px]">
        <div>
          <div className="text-slate-500">Fed-Bilanz (WALCL)</div>
          <div className="font-mono-num font-semibold text-sky-300">+{fmt(fedAssetsB, 0)} Mrd.</div>
        </div>
        <div>
          <div className="text-slate-500">− TGA (WTREGEN)</div>
          <div className="font-mono-num font-semibold text-amber-300">−{fmt(tgaB, 0)} Mrd.</div>
        </div>
        <div>
          <div className="text-slate-500">− ON RRP</div>
          <div className="font-mono-num font-semibold text-purple-300">−{fmt(rrpB, 1)} Mrd.</div>
        </div>
      </div>

      {/* Overlay Selector */}
      <div className="widget-no-drag flex items-center justify-between text-[10.5px]">
        <span className="text-slate-500">Vergleichs-Overlay (normalisiert):</span>
        <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900/70 p-0.5">
          {(
            [
              ['none', 'Aus'],
              ['sp500', 'S&P 500'],
              ['gold', 'Gold'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setOverlay(id)}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                overlay === id
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <MacroSparkChart
        series={history.map((p) => ({ date: p.date, value: p.netLiquidity / 1000 }))}
        overlaySeries={overlaySeries}
        overlayLabel={overlay === 'sp500' ? 'S&P 500' : overlay === 'gold' ? 'Gold' : undefined}
        color="#38bdf8"
        overlayColor="#f59e0b"
        unitSuffix=" Bio."
        decimals={2}
        defaultRange="3Y"
      />
    </div>
  );
};

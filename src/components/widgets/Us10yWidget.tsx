import React from 'react';
import type { MacroOverview } from '../../../shared/types.ts';
import { MacroSparkChart } from './MacroSparkChart.tsx';

interface Us10yWidgetProps {
  macro?: MacroOverview;
  isLoading: boolean;
}

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);

export const Us10yWidget: React.FC<Us10yWidgetProps> = ({ macro, isLoading }) => {
  if (isLoading && !macro) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-500">Lade 10J US-Renditen…</div>;
  }
  if (!macro) {
    return <div className="flex h-full items-center justify-center text-xs text-rose-400">US 10Y nicht verfügbar</div>;
  }

  const {
    yieldPercent,
    change1dBps,
    change1wBps,
    change1mBps,
    spread2s10sBps,
    curveStatus,
    history,
  } = macro.us10y;

  return (
    <div className="flex h-full flex-col justify-between gap-2">
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
          <div className="font-mono-num mt-0.5 flex flex-wrap gap-2.5 text-[11px] text-slate-400">
            <span>
              1W: {change1wBps >= 0 ? '+' : ''}
              {change1wBps} bps
            </span>
            <span>
              1M: {change1mBps >= 0 ? '+' : ''}
              {change1mBps} bps
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              curveStatus === 'inverted'
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                : curveStatus === 'flat'
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
            }`}
          >
            2s10s:{' '}
            {spread2s10sBps !== null
              ? `${spread2s10sBps >= 0 ? '+' : ''}${spread2s10sBps} bps`
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

      <MacroSparkChart
        series={history}
        color="#f59e0b"
        unitSuffix=" %"
        decimals={2}
        thresholds={[{ value: 4.5, label: '4,50 %', color: 'rgba(239,68,68,0.45)' }]}
        defaultRange="3Y"
      />
    </div>
  );
};

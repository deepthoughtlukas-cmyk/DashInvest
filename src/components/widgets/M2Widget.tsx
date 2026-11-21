import React from 'react';
import type { MacroOverview } from '../../../shared/types.ts';
import { MacroSparkChart } from './MacroSparkChart.tsx';

interface M2WidgetProps {
  macro?: MacroOverview;
  isLoading: boolean;
}

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);

export const M2Widget: React.FC<M2WidgetProps> = ({ macro, isLoading }) => {
  if (isLoading && !macro) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-500">Lade M2-Geldmenge…</div>;
  }
  if (!macro) {
    return <div className="flex h-full items-center justify-center text-xs text-rose-400">M2 nicht verfügbar</div>;
  }

  const { latestT, date, yoyPercent, threeMonthAnnualizedPercent, momPercent, status, history } =
    macro.m2;

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono-num text-2xl font-bold text-slate-50">
              {fmt(latestT, 2)} Bio. $
            </span>
            <span
              className={`font-mono-num text-xs font-semibold ${
                yoyPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {yoyPercent >= 0 ? '+' : ''}
              {fmt(yoyPercent, 1)}% YoY
            </span>
          </div>
          <div className="font-mono-num mt-0.5 flex flex-wrap gap-2.5 text-[11px] text-slate-400">
            <span>
              3M ann.:{' '}
              <strong className={threeMonthAnnualizedPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {threeMonthAnnualizedPercent >= 0 ? '+' : ''}
                {fmt(threeMonthAnnualizedPercent, 1)}%
              </strong>
            </span>
            <span>
              MoM: {momPercent >= 0 ? '+' : ''}
              {fmt(momPercent, 2)}%
            </span>
            <span className="text-slate-500">Stand: {date}</span>
          </div>
        </div>

        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
            status === 'expanding'
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : status === 'contracting'
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                : 'border-slate-700 bg-slate-800/70 text-slate-300'
          }`}
        >
          {status === 'expanding'
            ? 'Expansion'
            : status === 'contracting'
              ? 'Kontraktion'
              : 'Seitwärts'}
        </span>
      </div>

      <MacroSparkChart
        series={history.map((p) => ({ date: p.date, value: p.value / 1000 }))}
        color="#10b981"
        unitSuffix=" Bio."
        decimals={2}
        defaultRange="5Y"
      />
    </div>
  );
};

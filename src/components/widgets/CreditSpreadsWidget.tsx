import React from 'react';
import type { MacroOverview } from '../../../shared/types.ts';
import { MacroSparkChart } from './MacroSparkChart.tsx';

interface CreditSpreadsWidgetProps {
  macro?: MacroOverview;
  isLoading: boolean;
}

export const CreditSpreadsWidget: React.FC<CreditSpreadsWidgetProps> = ({ macro, isLoading }) => {
  if (isLoading && !macro) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-500">Lade Credit Spreads…</div>;
  }
  if (!macro) {
    return <div className="flex h-full items-center justify-center text-xs text-rose-400">Credit Spreads nicht verfügbar</div>;
  }

  const { hyOasBps, hyOasPercent, change1wBps, change1mBps, percentile5y, regime, date, history } =
    macro.creditSpreads;

  const badgeStyles =
    regime === 'risk-on'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
      : regime === 'stress'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
        : 'border-amber-500/40 bg-amber-500/15 text-amber-300';

  const badgeLabel =
    regime === 'risk-on'
      ? 'Risk-On (<350 bps)'
      : regime === 'stress'
        ? 'Kreditstress (>500 bps)'
        : 'Neutral (350–500 bps)';

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono-num text-2xl font-bold text-slate-50">
              {hyOasBps} bps
            </span>
            <span className="font-mono-num text-xs text-slate-400">
              ({hyOasPercent.toFixed(2).replace('.', ',')} %)
            </span>
          </div>
          <div className="font-mono-num mt-0.5 flex flex-wrap gap-2.5 text-[11px] text-slate-400">
            <span>
              1W:{' '}
              <strong className={change1wBps <= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {change1wBps >= 0 ? '+' : ''}
                {change1wBps} bps
              </strong>
            </span>
            <span>
              1M:{' '}
              <strong className={change1mBps <= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {change1mBps >= 0 ? '+' : ''}
                {change1mBps} bps
              </strong>
            </span>
            <span className="text-slate-500">Stand: {date}</span>
          </div>
        </div>

        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${badgeStyles}`}>
          {badgeLabel}
        </span>
      </div>

      {/* 5Y Percentile Bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10.5px] text-slate-400">
          <span>5-Jahres-Spannbreite (Perzentil)</span>
          <span className="font-mono-num font-semibold text-slate-200">{percentile5y}. Perzentil</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${
              regime === 'risk-on'
                ? 'bg-emerald-500'
                : regime === 'stress'
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
            }`}
            style={{ width: `${Math.max(4, Math.min(100, percentile5y))}%` }}
          />
        </div>
      </div>

      <MacroSparkChart
        series={history}
        comparisons={macro.comparisons}
        defaultOverlay="none"
        color={regime === 'stress' ? '#ef4444' : regime === 'risk-on' ? '#10b981' : '#f59e0b'}
        unitSuffix=" bps"
        decimals={0}
        thresholds={[
          { value: 350, label: '350 bps', color: 'rgba(16,185,129,0.45)' },
          { value: 500, label: '500 bps', color: 'rgba(239,68,68,0.55)' },
        ]}
        defaultRange="3Y"
      />
    </div>
  );
};

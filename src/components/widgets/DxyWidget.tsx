import React from 'react';
import type { MacroOverview } from '../../../shared/types.ts';
import { MacroSparkChart } from './MacroSparkChart.tsx';

interface DxyWidgetProps {
  macro?: MacroOverview;
  isLoading: boolean;
}

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);

export const DxyWidget: React.FC<DxyWidgetProps> = ({ macro, isLoading }) => {
  if (isLoading && !macro) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-500">Lade DXY-Daten…</div>;
  }
  if (!macro) {
    return <div className="flex h-full items-center justify-center text-xs text-rose-400">DXY nicht verfügbar</div>;
  }

  const { quote, history, sma50, sma200, trend } = macro.dxy;
  const isUp = quote.changePercent >= 0;

  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono-num text-2xl font-bold text-slate-50">
              {fmt(quote.price, 2)}
            </span>
            <span
              className={`font-mono-num text-xs font-semibold ${
                isUp ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isUp ? '+' : ''}
              {fmt(quote.changePercent, 2)}% (1T)
            </span>
          </div>
          <div className="font-mono-num mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-400">
            {quote.weekChangePercent !== undefined && (
              <span>
                1W: {quote.weekChangePercent >= 0 ? '+' : ''}
                {fmt(quote.weekChangePercent, 2)}%
              </span>
            )}
            {quote.ytdChangePercent !== undefined && (
              <span>
                YTD: {quote.ytdChangePercent >= 0 ? '+' : ''}
                {fmt(quote.ytdChangePercent, 2)}%
              </span>
            )}
          </div>
        </div>

        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
            trend === 'bullish'
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              : trend === 'bearish'
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 bg-slate-800/70 text-slate-300'
          }`}
        >
          {trend === 'bullish'
            ? 'USD Stark (Gegenwind)'
            : trend === 'bearish'
              ? 'USD Schwach (Rückenwind)'
              : 'Trend Neutral'}
        </span>
      </div>

      <div className="font-mono-num flex items-center gap-3 text-[11px] text-slate-400">
        <span>SMA 50: {sma50 ? fmt(sma50, 2) : '—'}</span>
        <span>SMA 200: {sma200 ? fmt(sma200, 2) : '—'}</span>
        <span className="ml-auto text-slate-500">Gold/Aktien invers</span>
      </div>

      <MacroSparkChart
        series={history}
        color="#38bdf8"
        thresholds={sma200 ? [{ value: sma200, label: 'SMA200', color: 'rgba(192,132,252,0.55)' }] : []}
        decimals={2}
        defaultRange="1Y"
      />
    </div>
  );
};

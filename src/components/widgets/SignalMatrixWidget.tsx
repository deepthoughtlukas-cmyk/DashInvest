import React from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';
import type { CatalogAsset, QuoteSummary } from '../../../shared/types.ts';
import type { FullAssetAnalysis, MacroRegimeEvaluation, SignalEvent } from '../../engine/signals.ts';
import { useDashboardStore } from '../../store/dashboardStore.ts';

interface SignalMatrixWidgetProps {
  focusAssets: CatalogAsset[];
  quoteMap: Map<string, QuoteSummary>;
  dailyAnalyses: Record<string, FullAssetAnalysis>;
  macroRegime: MacroRegimeEvaluation | null;
}

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);

export const SignalMatrixWidget: React.FC<SignalMatrixWidgetProps> = ({
  focusAssets,
  quoteMap,
  dailyAnalyses,
  macroRegime,
}) => {
  const { activeSymbol, catalogAssets, setActiveSymbol, setProseTab } = useDashboardStore();

  const nameBySymbol = new Map(catalogAssets.map((a) => [a.symbol, a.shortName]));

  const allSignals: SignalEvent[] = [];
  for (const item of focusAssets) {
    const an = dailyAnalyses[item.symbol];
    if (an) {
      allSignals.push(...an.signals.slice(0, 3));
    }
  }
  allSignals.sort((a, b) => b.time - a.time);

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-y-auto pr-0.5">
      {/* Bookmarked / Focus Cross-Asset Confluence Matrix */}
      <div className="space-y-1.5">
        {focusAssets.map((item) => {
          const q = quoteMap.get(item.symbol);
          const an = dailyAnalyses[item.symbol];
          const score = an?.scores.confluence ?? 0;
          const isSelected = activeSymbol === item.symbol;
          const isUp = (q?.changePercent ?? 0) >= 0;

          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => {
                setActiveSymbol(item.symbol);
                setProseTab('asset');
              }}
              className={`widget-no-drag flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                isSelected
                  ? 'border-sky-500/60 bg-sky-500/10'
                  : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-slate-100">
                    {item.shortName}
                  </span>
                  <span className="font-mono-num text-[9.5px] text-slate-500">{item.symbol}</span>
                  {an?.fibonacci?.inGoldenPocket && (
                    <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9.5px] font-medium text-amber-300">
                      GP
                    </span>
                  )}
                </div>
                <div className="font-mono-num text-[11px] text-slate-400">
                  {q ? fmt(q.price, item.decimals) : an ? fmt(an.latestPrice, item.decimals) : '—'}
                  {q && (
                    <span className={`ml-1.5 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isUp ? '+' : ''}
                      {fmt(q.changePercent, 2)}%
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      score >= 15
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : score <= -15
                          ? 'bg-rose-500/15 text-rose-300'
                          : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {an?.scores.bias ?? 'Lade…'}
                  </span>
                  <span className="font-mono-num text-xs font-bold text-slate-200">
                    {score > 0 ? '+' : ''}
                    {score}
                  </span>
                </div>
                {/* Score Gauge */}
                <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      score >= 15
                        ? 'bg-emerald-500'
                        : score <= -15
                          ? 'bg-rose-500'
                          : 'bg-sky-400'
                    }`}
                    style={{ width: `${Math.max(8, Math.round((score + 100) / 2))}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Macro Alerts */}
      {macroRegime && macroRegime.alerts.length > 0 && (
        <div className="space-y-1">
          {macroRegime.alerts.map((al, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>{al}</span>
            </div>
          ))}
        </div>
      )}

      {/* Live Signal Feed */}
      <div className="border-t border-slate-800/80 pt-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <Activity className="h-3.5 w-3.5 text-sky-400" />
          Aktive Markt-Signale (1D)
        </div>
        <div className="space-y-1.5">
          {allSignals.slice(0, 8).map((sig) => (
            <button
              key={sig.id}
              type="button"
              onClick={() => setActiveSymbol(sig.assetId)}
              className="widget-no-drag flex w-full items-start gap-2 rounded-md border border-slate-800/70 bg-slate-900/40 px-2 py-1.5 text-left transition hover:border-slate-700"
            >
              {sig.severity === 'bullish' ? (
                <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : sig.severity === 'bearish' ? (
                <ArrowDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                  <span className="text-sky-300">
                    {nameBySymbol.get(sig.assetId) ?? sig.assetId}
                  </span>
                  <span>·</span>
                  <span className="truncate">{sig.title}</span>
                </div>
                <div className="text-[10.5px] leading-snug text-slate-400">{sig.detail}</div>
              </div>
            </button>
          ))}
          {allSignals.length === 0 && (
            <div className="text-xs text-slate-500">Signale werden berechnet…</div>
          )}
        </div>
      </div>
    </div>
  );
};

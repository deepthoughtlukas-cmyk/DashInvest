import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Star,
} from 'lucide-react';
import type { CatalogAsset } from '../../../shared/types.ts';
import type { BookmarkedSignalEvent } from '../../engine/signals.ts';
import { useDashboardStore } from '../../store/dashboardStore.ts';

interface BookmarkSignalsWidgetProps {
  bookmarkedAssets: CatalogAsset[];
  signals: BookmarkedSignalEvent[];
  isLoading: boolean;
}

type SeverityFilter = 'all' | 'bullish' | 'bearish' | 'warning';

function formatSignalDate(timeSec: number): { ageLabel: string; dateLabel: string } {
  const diffDays = Math.max(0, Math.floor((Date.now() / 1000 - timeSec) / 86_400));
  const ageLabel =
    diffDays === 0 ? 'Heute' : diffDays === 1 ? 'Vor 1 T.' : `Vor ${diffDays} T.`;
  const dateLabel = new Date(timeSec * 1000).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  });
  return { ageLabel, dateLabel };
}

export const BookmarkSignalsWidget: React.FC<BookmarkSignalsWidgetProps> = ({
  bookmarkedAssets,
  signals,
  isLoading,
}) => {
  const { activeSymbol, setActiveSymbol, setProseTab } = useDashboardStore();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [assetFilter, setAssetFilter] = useState<string>('ALL');

  const effectiveAssetFilter =
    assetFilter !== 'ALL' && bookmarkedAssets.some((a) => a.symbol === assetFilter)
      ? assetFilter
      : 'ALL';

  const counts = useMemo(() => {
    let bullish = 0;
    let bearish = 0;
    let warning = 0;
    const bySymbol = new Map<string, number>();

    for (const sig of signals) {
      if (sig.severity === 'bullish') bullish++;
      else if (sig.severity === 'bearish') bearish++;
      else if (sig.severity === 'warning') warning++;
      bySymbol.set(sig.symbol, (bySymbol.get(sig.symbol) ?? 0) + 1);
    }

    return { bullish, bearish, warning, bySymbol };
  }, [signals]);

  const filteredSignals = useMemo(
    () =>
      signals.filter((sig) => {
        if (severityFilter !== 'all' && sig.severity !== severityFilter) return false;
        if (effectiveAssetFilter !== 'ALL' && sig.symbol !== effectiveAssetFilter) return false;
        return true;
      }),
    [signals, severityFilter, effectiveAssetFilter],
  );

  const filterButtons: Array<{ id: SeverityFilter; label: string; count: number }> = [
    { id: 'all', label: 'Alle', count: signals.length },
    { id: 'bullish', label: 'Bullisch', count: counts.bullish },
    { id: 'bearish', label: 'Bärisch', count: counts.bearish },
    { id: 'warning', label: 'Warnung', count: counts.warning },
  ];

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-hidden">
      {/* Header Summary & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 font-semibold text-sky-300">
            <BellRing className="h-3 w-3" />
            {signals.length} {signals.length === 1 ? 'Signal' : 'Signale'} (7T)
          </span>
          <span className="text-slate-400">{bookmarkedAssets.length} Bookmarks aktiv</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="widget-no-drag flex items-center rounded-lg border border-slate-800 bg-slate-900/70 p-0.5">
            {filterButtons.map((btn) => {
              const active = severityFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSeverityFilter(btn.id)}
                  className={`rounded-md px-2 py-0.5 text-[10.5px] font-medium transition ${
                    active
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {btn.label} ({btn.count})
                </button>
              );
            })}
          </div>

          <select
            aria-label="Bookmark-Asset filtern"
            value={effectiveAssetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="widget-no-drag rounded-lg border border-slate-800 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-sky-500"
          >
            <option value="ALL">Alle Bookmarks ({bookmarkedAssets.length})</option>
            {bookmarkedAssets.map((asset) => (
              <option key={asset.symbol} value={asset.symbol}>
                {asset.shortName} ({counts.bySymbol.get(asset.symbol) ?? 0})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Signal Feed Body */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {bookmarkedAssets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-4 text-center">
            <Star className="h-5 w-5 text-amber-400/70" />
            <div className="text-xs font-medium text-slate-300">
              Keine Bookmarks aktiv — markiere im Katalog Werte mit ★.
            </div>
            <div className="text-[11px] text-slate-500">
              Alle ausgelösten Signale der letzten 7 Tage erscheinen hier automatisch.
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Prüfe 7-Tage-Signale aller Bookmarks…
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-4 text-center">
            <div className="text-xs text-slate-400">
              {severityFilter !== 'all' || effectiveAssetFilter !== 'ALL'
                ? 'Keine 7-Tage-Signale für diesen Filter gefunden.'
                : 'Keine ausgelösten Signale in den letzten 7 Tagen bei deinen Bookmarks.'}
            </div>
            {(severityFilter !== 'all' || effectiveAssetFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter('all');
                  setAssetFilter('ALL');
                }}
                className="widget-no-drag rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-2">
            {filteredSignals.map((sig) => {
              const isSelected = activeSymbol === sig.symbol;
              const { ageLabel, dateLabel } = formatSignalDate(sig.time);
              const badgeClass =
                sig.severity === 'bullish'
                  ? 'border-emerald-500/30 bg-emerald-500/8 hover:border-emerald-400/50'
                  : sig.severity === 'bearish'
                    ? 'border-rose-500/30 bg-rose-500/8 hover:border-rose-400/50'
                    : 'border-amber-500/30 bg-amber-500/8 hover:border-amber-400/50';

              return (
                <button
                  key={sig.id}
                  type="button"
                  onClick={() => {
                    setActiveSymbol(sig.symbol);
                    setProseTab('asset');
                  }}
                  className={`widget-no-drag flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition ${
                    isSelected
                      ? 'border-sky-400/70 bg-sky-500/12 ring-1 ring-sky-400/30'
                      : `${badgeClass}`
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {sig.severity === 'bullish' ? (
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : sig.severity === 'bearish' ? (
                        <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                      )}
                      <span className="truncate text-xs font-bold text-slate-100">
                        {sig.shortName}
                      </span>
                      <span className="font-mono-num text-[9.5px] text-slate-500">
                        {sig.symbol}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 text-[10px]">
                      <span className="rounded bg-slate-800/90 px-1.5 py-0.5 text-slate-300">
                        {sig.source}
                      </span>
                      <span
                        className="font-mono-num rounded bg-slate-900/90 px-1.5 py-0.5 text-slate-400"
                        title={dateLabel}
                      >
                        {ageLabel} · {dateLabel}
                      </span>
                    </div>
                  </div>

                  <div className="text-[11.5px] font-semibold text-slate-200">{sig.title}</div>
                  <div className="text-[10.5px] leading-snug text-slate-400">{sig.detail}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

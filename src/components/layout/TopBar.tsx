import React, { useState } from 'react';
import {
  Activity,
  LayoutGrid,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Unlock,
  X,
} from 'lucide-react';
import type { MacroRegimeEvaluation } from '../../engine/signals.ts';
import { useDashboardStore, type PresetId, type WidgetId } from '../../store/dashboardStore.ts';
import { ALL_WIDGET_IDS, WIDGET_REGISTRY } from './WidgetRegistry.ts';

interface TopBarProps {
  macroRegime: MacroRegimeEvaluation | null;
  updatedAt?: string;
  isFetching: boolean;
  onRefreshAll: () => void;
}

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'analyse-fokus', label: 'Analyse-Fokus' },
  { id: 'multi-chart', label: '2×2 Multi-Chart' },
  { id: 'makro-cockpit', label: 'Makro-Cockpit' },
];

export const TopBar: React.FC<TopBarProps> = ({
  macroRegime,
  updatedAt,
  isFetching,
  onRefreshAll,
}) => {
  const {
    activePreset,
    activeWidgets,
    layoutLocked,
    applyPreset,
    toggleWidget,
    setLayoutLocked,
    resetCurrentPreset,
  } = useDashboardStore();

  const [drawerOpen, setDrawerOpen] = useState(false);

  const formattedTime = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  const regimeBadgeStyle =
    macroRegime?.regime === 'expansion'
      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
      : macroRegime?.regime === 'risk-off'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
        : 'border-amber-500/40 bg-amber-500/15 text-amber-300';

  const categories = ['Charts', 'Analyse & Signale', 'Makro & Liquidität'] as const;

  return (
    <>
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-[#0b101b]/95 px-4 py-2.5 backdrop-blur-md">
        {/* Left: Brand & Macro Regime Pill */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-400">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-100">
                Dash<span className="text-sky-400">Invest</span>
              </div>
              <div className="text-[10px] text-slate-400">Market &amp; Macro Terminal</div>
            </div>
          </div>

          {macroRegime && (
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${regimeBadgeStyle}`}
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              <span>Makro: {macroRegime.regimeLabel}</span>
              <span className="font-mono-num opacity-85">
                ({macroRegime.score > 0 ? '+' : ''}
                {macroRegime.score})
              </span>
            </div>
          )}
        </div>

        {/* Center/Right: Presets + Widget Controls + Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/80 p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  activePreset === p.id
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25"
          >
            <Plus className="h-3.5 w-3.5" />
            Widgets ({activeWidgets.length})
          </button>

          <button
            type="button"
            onClick={() => setLayoutLocked(!layoutLocked)}
            title={layoutLocked ? 'Layout entsperren (Drag & Resize)' : 'Layout sperren'}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              layoutLocked
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700'
            }`}
          >
            {layoutLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {layoutLocked ? 'Gesperrt' : 'Flexibel'}
          </button>

          <button
            type="button"
            onClick={resetCurrentPreset}
            title="Preset-Layout zurücksetzen"
            className="rounded-lg border border-slate-800 bg-slate-900/80 p-1.5 text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onRefreshAll}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-slate-700 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin text-sky-400' : ''}`} />
            <span className="font-mono-num hidden sm:inline">{formattedTime}</span>
          </button>
        </div>
      </header>

      {/* Widget Catalog Slide-Over Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-[#0f1623] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Widget-Katalog flexibel anordnen
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <p className="text-xs leading-relaxed text-slate-400">
                Aktiviere oder deaktiviere beliebige Analyse-, Chart- und Makro-Widgets. Im
                Modus <strong className="text-slate-200">Flexibel</strong> kannst du jedes Widget an
                der Titelzeile verschieben und unten rechts frei skalieren.
              </p>

              {categories.map((cat) => {
                const items = ALL_WIDGET_IDS.map((id) => WIDGET_REGISTRY[id]).filter(
                  (w) => w.category === cat,
                );
                return (
                  <div key={cat} className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {cat}
                    </h3>
                    <div className="space-y-1.5">
                      {items.map((widget) => {
                        const enabled = activeWidgets.includes(widget.id as WidgetId);
                        return (
                          <button
                            key={widget.id}
                            type="button"
                            onClick={() => toggleWidget(widget.id as WidgetId)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                              enabled
                                ? 'border-sky-500/50 bg-sky-500/12'
                                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-semibold text-slate-100">
                                {widget.title}
                              </div>
                              <div className="text-[11px] text-slate-400">{widget.subtitle}</div>
                            </div>
                            <span
                              className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                enabled
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {enabled ? 'Aktiv' : '+ Hinzufügen'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

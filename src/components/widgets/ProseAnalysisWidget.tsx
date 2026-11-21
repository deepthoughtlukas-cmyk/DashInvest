import React, { useMemo, useState } from 'react';
import {
  Check,
  Compass,
  Copy,
  FileText,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { ProseConclusion, ProseReport } from '../../engine/proseAnalysis.ts';
import { useDashboardStore } from '../../store/dashboardStore.ts';

interface ProseAnalysisWidgetProps {
  macroReport: ProseReport | null;
  assetReport: ProseReport | null;
  isLoading: boolean;
}

function ConclusionIcon({ type }: { type: ProseConclusion['type'] }) {
  switch (type) {
    case 'bias':
      return <Compass className="h-3.5 w-3.5 shrink-0 text-sky-400" />;
    case 'opportunity':
      return <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
    case 'risk':
      return <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-400" />;
    case 'trigger':
      return <Target className="h-3.5 w-3.5 shrink-0 text-amber-400" />;
  }
}

function conclusionCardStyle(type: ProseConclusion['type']): string {
  switch (type) {
    case 'bias':
      return 'border-sky-500/30 bg-sky-500/8';
    case 'opportunity':
      return 'border-emerald-500/30 bg-emerald-500/8';
    case 'risk':
      return 'border-rose-500/30 bg-rose-500/8';
    case 'trigger':
      return 'border-amber-500/30 bg-amber-500/8';
  }
}

export const ProseAnalysisWidget: React.FC<ProseAnalysisWidgetProps> = ({
  macroReport,
  assetReport,
  isLoading,
}) => {
  const {
    activeSymbol,
    catalogAssets,
    proseTab,
    proseDepth,
    setActiveSymbol,
    setProseTab,
    setProseDepth,
  } = useDashboardStore();

  const [copied, setCopied] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);

  const quickAssets = useMemo(() => {
    const bookmarked = catalogAssets.filter((a) => a.bookmarked);
    const list = [...bookmarked];
    const activeItem = catalogAssets.find((a) => a.symbol === activeSymbol);
    if (activeItem && !list.some((a) => a.symbol === activeItem.symbol)) {
      list.unshift(activeItem);
    }
    return list.length > 0 ? list : catalogAssets.slice(0, 6);
  }, [catalogAssets, activeSymbol]);

  const report = proseTab === 'macro' ? macroReport : assetReport;

  const handleCopy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard permissions error
    }
  };

  const renderContent = (inModal = false) => (
    <div className="flex h-full flex-col gap-2.5">
      {/* Controls Bar */}
      <div className="widget-no-drag flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-0.5">
          <button
            type="button"
            onClick={() => setProseTab('macro')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              proseTab === 'macro'
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Makro-Briefing
          </button>
          <button
            type="button"
            onClick={() => setProseTab('asset')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              proseTab === 'asset'
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Asset-Analyse
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-md border border-slate-800 bg-slate-900/70 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setProseDepth('compact')}
              className={`rounded px-2 py-0.5 font-medium transition ${
                proseDepth === 'compact'
                  ? 'bg-slate-700/70 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Kompakt
            </button>
            <button
              type="button"
              onClick={() => setProseDepth('detailed')}
              className={`rounded px-2 py-0.5 font-medium transition ${
                proseDepth === 'detailed'
                  ? 'bg-slate-700/70 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ausführlich
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!report}
            title="Analyse als Markdown kopieren"
            className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-300 transition hover:border-slate-700 hover:text-white disabled:opacity-40"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                Kopiert
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Kopieren
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setReaderOpen(!inModal)}
            title={inModal ? 'Lesemodus schließen' : 'Im Lesemodus öffnen'}
            className="rounded-md border border-slate-800 bg-slate-900/70 p-1 text-slate-400 transition hover:border-slate-700 hover:text-white"
          >
            {inModal ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Asset Quick Pills when in Asset tab */}
      {proseTab === 'asset' && (
        <div className="widget-no-drag flex flex-wrap items-center gap-1">
          {quickAssets.map((item) => (
            <button
              key={item.symbol}
              type="button"
              onClick={() => setActiveSymbol(item.symbol)}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                activeSymbol === item.symbol
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                  : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.shortName}
            </button>
          ))}
        </div>
      )}

      {/* Prose Body */}
      <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-[13px] leading-relaxed text-slate-300">
        {isLoading && !report ? (
          <div className="flex h-36 items-center justify-center gap-2 text-xs text-slate-500">
            <FileText className="h-4 w-4 animate-pulse text-sky-400" />
            Erstelle aktuelle Marktanalyse…
          </div>
        ) : !report ? (
          <div className="text-xs text-slate-500">
            Warte auf Kurs- und Makrodaten für den Analysebericht…
          </div>
        ) : (
          <>
            {/* Executive Header */}
            <div className="rounded-lg border border-slate-800/90 bg-slate-900/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                  <Sparkles className="h-4 w-4 text-sky-400" />
                  {report.headline}
                </div>
                <span
                  className={`font-mono-num rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    report.score >= 15
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : report.score <= -15
                        ? 'bg-rose-500/15 text-rose-300'
                        : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {report.badgeLabel}
                </span>
              </div>
              <div className="font-mono-num mt-1 text-[11px] text-slate-400">
                {report.subheadline}
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-slate-200">
                {report.compactSummary}
              </p>
            </div>

            {/* Detailed Prose Sections */}
            {proseDepth === 'detailed' && (
              <div className="space-y-2.5">
                {report.paragraphs.map((para) => (
                  <section key={para.heading} className="space-y-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-300/90">
                      {para.heading}
                    </h4>
                    <p className="text-[12.5px] leading-relaxed text-slate-300">{para.body}</p>
                  </section>
                ))}
              </div>
            )}

            {/* Highlighted Conclusions */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Wichtigste Schlussfolgerungen
              </h4>
              <div className="grid grid-cols-1 gap-1.5">
                {report.conclusions.map((c, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border px-2.5 py-2 ${conclusionCardStyle(c.type)}`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                      <ConclusionIcon type={c.type} />
                      <span>{c.title}</span>
                    </div>
                    <p className="mt-0.5 pl-5 text-[12px] leading-snug text-slate-300">{c.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="border-t border-slate-800/70 pt-2 text-[10.5px] text-slate-500">
              Hinweis: Regelbasierte Analyse aus Live-Marktdaten &amp; Indikatoren — keine Anlageberatung.
            </p>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {renderContent(false)}
      {readerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700/80 bg-[#0f1623] p-5 shadow-2xl">
            {renderContent(true)}
          </div>
        </div>
      )}
    </>
  );
};

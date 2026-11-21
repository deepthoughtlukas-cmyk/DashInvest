import React, { useId, useMemo, useState } from 'react';
import type { MacroPoint } from '../../../shared/types.ts';
import { alignOverlaySeries } from '../../engine/macroOverlay.ts';

export type MacroOverlayKey = 'none' | 'sp500' | 'gold';

interface ThresholdLine {
  value: number;
  label: string;
  color: string;
}

interface MacroSparkChartProps {
  series: MacroPoint[];
  comparisons?: {
    sp500: MacroPoint[];
    gold: MacroPoint[];
  };
  defaultOverlay?: MacroOverlayKey;
  overlaySeries?: MacroPoint[];
  overlayLabel?: string;
  color?: string;
  overlayColor?: string;
  thresholds?: ThresholdLine[];
  unitSuffix?: string;
  decimals?: number;
  defaultRange?: '1Y' | '3Y' | '5Y' | 'ALL';
}

const RANGE_OPTIONS: Array<{ id: '1Y' | '3Y' | '5Y' | 'ALL'; label: string }> = [
  { id: '1Y', label: '1J' },
  { id: '3Y', label: '3J' },
  { id: '5Y', label: '5J' },
  { id: 'ALL', label: 'MAX' },
];

const OVERLAY_OPTIONS: Array<{ id: MacroOverlayKey; label: string; color: string }> = [
  { id: 'none', label: 'Aus', color: '#94a3b8' },
  { id: 'sp500', label: 'S&P 500', color: '#c084fc' },
  { id: 'gold', label: 'Gold', color: '#facc15' },
];

export const MacroSparkChart: React.FC<MacroSparkChartProps> = ({
  series,
  comparisons,
  defaultOverlay = 'none',
  overlaySeries,
  overlayLabel,
  color = '#38bdf8',
  overlayColor,
  thresholds = [],
  unitSuffix = '',
  decimals = 2,
  defaultRange = '3Y',
}) => {
  const gradId = useId();
  const [range, setRange] = useState<'1Y' | '3Y' | '5Y' | 'ALL'>(defaultRange);
  const [overlay, setOverlay] = useState<MacroOverlayKey>(defaultOverlay);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const activeOverlaySeries = useMemo(() => {
    if (comparisons) {
      if (overlay === 'sp500') return comparisons.sp500;
      if (overlay === 'gold') return comparisons.gold;
      return undefined;
    }
    return overlaySeries;
  }, [comparisons, overlay, overlaySeries]);

  const activeOverlayLabel = useMemo(() => {
    if (comparisons) {
      if (overlay === 'sp500') return 'S&P 500';
      if (overlay === 'gold') return 'Gold';
      return undefined;
    }
    return overlayLabel;
  }, [comparisons, overlay, overlayLabel]);

  const resolvedOverlayColor = useMemo(() => {
    if (overlayColor) return overlayColor;
    if (overlay === 'sp500') return '#c084fc';
    if (overlay === 'gold') return '#facc15';
    return '#c084fc';
  }, [overlayColor, overlay]);

  const activeOverlayAttr: MacroOverlayKey = comparisons
    ? overlay
    : overlaySeries
      ? 'sp500'
      : 'none';

  const filtered = useMemo(() => {
    if (series.length === 0) return [];
    if (range === 'ALL') return series;
    const latestDate = new Date(`${series[series.length - 1].date}T00:00:00Z`);
    const years = range === '1Y' ? 1 : range === '3Y' ? 3 : 5;
    latestDate.setUTCFullYear(latestDate.getUTCFullYear() - years);
    const cutoff = latestDate.toISOString().slice(0, 10);
    const sliced = series.filter((p) => p.date >= cutoff);
    return sliced.length >= 4 ? sliced : series;
  }, [series, range]);

  const alignedOverlay = useMemo(() => {
    if (!activeOverlaySeries || activeOverlaySeries.length === 0 || filtered.length === 0) {
      return null;
    }
    return alignOverlaySeries(filtered, activeOverlaySeries);
  }, [activeOverlaySeries, filtered]);

  const width = 420;
  const height = 108;
  const padX = 6;
  const padY = 10;

  const { pathD, areaD, minVal, maxVal, overlayPathD, yOf } = useMemo(() => {
    if (filtered.length < 2) {
      return {
        pathD: '',
        areaD: '',
        minVal: 0,
        maxVal: 1,
        overlayPathD: '',
        yOf: () => height / 2,
      };
    }

    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of filtered) {
      if (p.value < minV) minV = p.value;
      if (p.value > maxV) maxV = p.value;
    }
    for (const th of thresholds) {
      if (th.value >= minV * 0.7 && th.value <= maxV * 1.3) {
        minV = Math.min(minV, th.value);
        maxV = Math.max(maxV, th.value);
      }
    }
    const span = maxV - minV || 1;
    const yFn = (v: number) =>
      padY + (1 - (v - minV) / span) * (height - padY * 2);
    const xFn = (i: number) =>
      padX + (i / (filtered.length - 1)) * (width - padX * 2);

    const coords = filtered.map((p, idx) => ({ x: xFn(idx), y: yFn(p.value) }));
    const linePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');
    const fillPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(
      height - padY
    ).toFixed(1)} L${coords[0].x.toFixed(1)},${(height - padY).toFixed(1)} Z`;

    let oPath = '';
    if (alignedOverlay) {
      const validOv = alignedOverlay.filter((v): v is number => v !== null);
      if (validOv.length >= 2) {
        const oMin = Math.min(...validOv);
        const oMax = Math.max(...validOv);
        const oSpan = oMax - oMin || 1;
        let segmentOpen = false;
        const cmds: string[] = [];
        for (let idx = 0; idx < alignedOverlay.length; idx++) {
          const v = alignedOverlay[idx];
          if (v === null) {
            segmentOpen = false;
            continue;
          }
          const x = xFn(idx);
          const y = padY + (1 - (v - oMin) / oSpan) * (height - padY * 2);
          cmds.push(`${segmentOpen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
          segmentOpen = true;
        }
        oPath = cmds.join(' ');
      }
    }

    return {
      pathD: linePath,
      areaD: fillPath,
      minVal: minV,
      maxVal: maxV,
      overlayPathD: oPath,
      yOf: yFn,
    };
  }, [filtered, alignedOverlay, thresholds]);

  const hovered = hoverIdx !== null ? filtered[hoverIdx] : null;
  const hoveredOverlay =
    hoverIdx !== null && alignedOverlay ? alignedOverlay[hoverIdx] : null;

  const fmtVal = (v: number) =>
    `${new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(v)}${unitSuffix}`;

  const dashOverlay =
    overlay === 'gold' && color.toLowerCase() === '#f59e0b' ? '4 2' : undefined;

  return (
    <div className="flex flex-1 flex-col justify-end gap-1">
      {/* Unified compact readout + Overlay & Range controls */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10.5px]">
        <div className="font-mono-num min-w-0 truncate text-slate-400">
          {hovered ? (
            <span className="text-slate-200">
              {hovered.date}: <strong style={{ color }}>{fmtVal(hovered.value)}</strong>
              {hoveredOverlay !== null && activeOverlayLabel && (
                <span className="ml-1.5" style={{ color: resolvedOverlayColor }}>
                  · {activeOverlayLabel}:{' '}
                  {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(
                    hoveredOverlay,
                  )}
                </span>
              )}
            </span>
          ) : (
            <span>
              {fmtVal(minVal)} – {fmtVal(maxVal)}
            </span>
          )}
        </div>

        <div className="widget-no-drag flex flex-wrap items-center gap-1">
          {comparisons && (
            <div
              role="group"
              aria-label="Vergleichs-Overlay"
              className="flex items-center gap-0.5 rounded border border-slate-800 bg-slate-900/80 p-0.5"
            >
              {OVERLAY_OPTIONS.map((opt) => {
                const active = overlay === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setOverlay(opt.id)}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                      active
                        ? opt.id === 'sp500'
                          ? 'bg-purple-500/20 text-purple-300'
                          : opt.id === 'gold'
                            ? 'bg-yellow-500/20 text-yellow-300'
                            : 'bg-slate-700/70 text-slate-200'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {opt.id !== 'none' && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-0.5 rounded border border-slate-800 bg-slate-900/80 p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                  range === opt.id
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative min-h-[86px] flex-1 w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            if (filtered.length < 2) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const idx = Math.round(relX * (filtered.length - 1));
            setHoverIdx(idx);
          }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {thresholds.map((th) => {
            const y = yOf(th.value);
            if (y < padY - 2 || y > height - padY + 2) return null;
            return (
              <g key={th.label}>
                <line
                  x1={padX}
                  x2={width - padX}
                  y1={y}
                  y2={y}
                  stroke={th.color}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={width - padX - 2}
                  y={y - 3}
                  textAnchor="end"
                  fill={th.color}
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {th.label}
                </text>
              </g>
            );
          })}

          {areaD && <path d={areaD} fill={`url(#${gradId})`} />}
          {overlayPathD && (
            <path
              data-overlay={activeOverlayAttr}
              d={overlayPathD}
              fill="none"
              stroke={resolvedOverlayColor}
              strokeWidth="1.5"
              strokeOpacity="0.88"
              strokeDasharray={dashOverlay}
            />
          )}
          {pathD && (
            <path
              data-series="base"
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth="1.9"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {hoverIdx !== null && filtered[hoverIdx] && (
            <g>
              <line
                x1={padX + (hoverIdx / Math.max(1, filtered.length - 1)) * (width - padX * 2)}
                x2={padX + (hoverIdx / Math.max(1, filtered.length - 1)) * (width - padX * 2)}
                y1={padY}
                y2={height - padY}
                stroke="rgba(148,163,184,0.4)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <circle
                cx={padX + (hoverIdx / Math.max(1, filtered.length - 1)) * (width - padX * 2)}
                cy={yOf(filtered[hoverIdx].value)}
                r="3.2"
                fill={color}
                stroke="#0f1623"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};

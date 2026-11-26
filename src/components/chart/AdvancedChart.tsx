import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import {
  Crosshair,
  FolderOpen,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  RefreshCw,
  Star,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  DEFAULT_CATALOG_BY_SYMBOL,
  inferAssetClass,
  inferDecimals,
  resolveCanonicalSymbol,
} from '../../../shared/catalog.ts';
import type {
  Candle,
  CatalogAsset,
  ChartStyle,
  ElliottDegree,
  MacroOverview,
  QuoteSummary,
  Timeframe,
} from '../../../shared/types.ts';
import { useDashboardStore } from '../../store/dashboardStore.ts';
import { getCachedFullAssetAnalysis, useAssetCandlesQuery } from '../../hooks/useMarketData.ts';
import { toHeikinAshi } from '../../engine/movingAverages.ts';
import { computeFibonacciFromAnchors, type FibAnchor } from '../../engine/fibonacci.ts';
import { FibonacciPrimitive } from './primitives/FibonacciPrimitive.ts';
import { ElliottWavePrimitive } from './primitives/ElliottWavePrimitive.ts';
import { FundamentalsSidebar } from './FundamentalsSidebar.tsx';
import { formatNumberDe } from '../../utils/formatters.ts';

interface AdvancedChartProps {
  lockedSymbol?: string;
  macro?: MacroOverview;
  quoteMap: Map<string, QuoteSummary>;
  compact?: boolean;
  onOpenCatalog?: () => void;
}

const TIMEFRAMES: Array<{ id: Timeframe; label: string }> = [
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
];

const fmtPrice = (val: number, decimals = 2) => formatNumberDe(val, decimals);

interface QuickAssetTabsProps {
  tabs: CatalogAsset[];
  activeSymbol: string;
  quoteMap: Map<string, QuoteSummary>;
  onSelect: (symbol: string) => void;
}

const QuickAssetTabs: React.FC<QuickAssetTabsProps> = React.memo(
  ({ tabs, activeSymbol, quoteMap, onSelect }) => (
    <>
      {tabs.map((item) => {
        const q = quoteMap.get(item.symbol);
        const active = item.symbol === activeSymbol;
        const up = (q?.changePercent ?? 0) >= 0;
        return (
          <button
            key={item.symbol}
            type="button"
            onClick={() => onSelect(item.symbol)}
            className={`widget-no-drag flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
              active
                ? 'border-sky-500/60 bg-sky-500/15 text-slate-100'
                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <span className="font-semibold">{item.shortName}</span>
            {q && (
              <span className="font-mono-num text-[11px] text-slate-300">
                {fmtPrice(q.price, item.decimals)}
                <span className={`ml-1 ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {up ? '+' : ''}
                  {q.changePercent.toFixed(2)}%
                </span>
              </span>
            )}
          </button>
        );
      })}
    </>
  ),
);

export const AdvancedChart: React.FC<AdvancedChartProps> = React.memo(({
  lockedSymbol,
  macro,
  quoteMap,
  compact = false,
  onOpenCatalog,
}) => {
  const {
    activeSymbol,
    activeTimeframe,
    refreshIntervalMs,
    showFundamentalsSidebar,
    chartSettings,
    manualFibs,
    catalogAssets,
    setActiveSymbol,
    setActiveTimeframe,
    setShowFundamentalsSidebar,
    updateChartSetting,
    setManualFib,
    toggleBookmark,
  } = useDashboardStore(
    useShallow((s) => ({
      activeSymbol: s.activeSymbol,
      activeTimeframe: s.activeTimeframe,
      refreshIntervalMs: s.refreshIntervalMs,
      showFundamentalsSidebar: s.showFundamentalsSidebar,
      chartSettings: s.chartSettings,
      manualFibs: s.manualFibs,
      catalogAssets: s.catalogAssets,
      setActiveSymbol: s.setActiveSymbol,
      setActiveTimeframe: s.setActiveTimeframe,
      setShowFundamentalsSidebar: s.setShowFundamentalsSidebar,
      updateChartSetting: s.updateChartSetting,
      setManualFib: s.setManualFib,
      toggleBookmark: s.toggleBookmark,
    })),
  );

  const handleSelectQuickSymbol = useCallback(
    (sym: string) => setActiveSymbol(sym),
    [setActiveSymbol],
  );

  const [localTimeframe, setLocalTimeframe] = useState<Timeframe>(activeTimeframe);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [drawStep, setDrawStep] = useState<'idle' | 'pick_start' | 'pick_end'>('idle');
  const [pendingStart, setPendingStart] = useState<FibAnchor | null>(null);
  const [hoverOhlc, setHoverOhlc] = useState<{
    o: number;
    h: number;
    l: number;
    c: number;
    rsi: number | null;
    adx: number | null;
  } | null>(null);

  const symbol = resolveCanonicalSymbol(lockedSymbol ?? activeSymbol);
  const tf = lockedSymbol ? localTimeframe : activeTimeframe;

  const catalogEntry = useMemo(
    () => catalogAssets.find((a) => a.symbol === symbol) ?? DEFAULT_CATALOG_BY_SYMBOL.get(symbol),
    [catalogAssets, symbol],
  );

  const candlesQuery = useAssetCandlesQuery(symbol, tf, refreshIntervalMs);
  const candles = candlesQuery.data?.candles ?? [];
  const quote = candlesQuery.data?.quote ?? quoteMap.get(symbol);

  const meta = useMemo(() => {
    const assetClass = catalogEntry?.assetClass ?? inferAssetClass(symbol);
    return {
      symbol,
      name: catalogEntry?.name ?? quote?.name ?? symbol,
      shortName: catalogEntry?.shortName ?? quote?.shortName ?? symbol,
      decimals: catalogEntry?.decimals ?? quote?.decimals ?? inferDecimals(symbol, assetClass),
      unit: catalogEntry?.unit ?? quote?.unit ?? 'USD',
      assetClass,
      bookmarked: catalogEntry?.bookmarked ?? false,
      inCatalog: catalogAssets.some((a) => a.symbol === symbol),
    };
  }, [catalogEntry, catalogAssets, quote, symbol]);

  const quickTabs = useMemo(() => {
    const bookmarked = catalogAssets.filter((a) => a.bookmarked);
    const tabs = [...bookmarked];
    if (!tabs.some((a) => a.symbol === symbol)) {
      tabs.push({
        symbol,
        name: meta.name,
        shortName: meta.shortName,
        assetClass: meta.assetClass,
        unit: meta.unit,
        decimals: meta.decimals,
        folderId: '',
        bookmarked: false,
      });
    }
    return tabs;
  }, [catalogAssets, symbol, meta]);

  const analysis = useMemo(() => {
    if (candles.length === 0) return null;
    return getCachedFullAssetAnalysis(
      symbol,
      candles,
      macro,
      tf,
      chartSettings.elliottDegree,
      meta.assetClass,
    );
  }, [symbol, candles, macro, tf, chartSettings.elliottDegree, meta.assetClass]);

  const manualPair = manualFibs[symbol] ?? null;
  const manualFibAnalysis = useMemo(() => {
    if (!manualPair || candles.length === 0) return null;
    const lastPrice = candles[candles.length - 1].close;
    return computeFibonacciFromAnchors(manualPair.start, manualPair.end, lastPrice);
  }, [manualPair, candles]);

  const chartHostRef = useRef<HTMLDivElement>(null);
  const fullscreenHostRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick' | 'Line'> | null>(null);

  const drawStepRef = useRef(drawStep);
  const pendingStartRef = useRef(pendingStart);
  const symbolRef = useRef(symbol);
  drawStepRef.current = drawStep;
  pendingStartRef.current = pendingStart;
  symbolRef.current = symbol;

  useEffect(() => {
    const container = isFullscreen ? fullscreenHostRef.current : chartHostRef.current;
    if (!container || candles.length === 0 || !analysis) return;

    const chart = createChart(container, {
      width: container.clientWidth || 640,
      height: container.clientHeight || 360,
      layout: {
        background: { type: ColorType.Solid, color: '#0b111c' },
        textColor: '#94a3b8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        panes: {
          separatorColor: 'rgba(148, 163, 184, 0.16)',
          separatorHoverColor: 'rgba(56, 189, 248, 0.5)',
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.06)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.06)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(56, 189, 248, 0.4)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(56, 189, 248, 0.4)', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.14)',
        mode: chartSettings.logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.14)',
        timeVisible: tf === '15m' || tf === '1h' || tf === '4h',
        secondsVisible: false,
      },
    });

    chartInstanceRef.current = chart;

    // 1. Main Price Series on Pane 0
    const displayCandles: Candle[] =
      chartSettings.style === 'heikin_ashi' ? toHeikinAshi(candles) : candles;

    let mainSeries: ISeriesApi<'Candlestick' | 'Line'>;
    if (chartSettings.style === 'line') {
      const line = chart.addSeries(
        LineSeries,
        {
          color: '#38bdf8',
          lineWidth: 2,
          priceLineVisible: true,
          lastValueVisible: true,
        },
        0,
      );
      line.setData(displayCandles.map((c) => ({ time: c.time as Time, value: c.close })));
      mainSeries = line;
    } else {
      const cs = chart.addSeries(
        CandlestickSeries,
        {
          upColor: '#10b981',
          downColor: '#ef4444',
          borderUpColor: '#10b981',
          borderDownColor: '#ef4444',
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        },
        0,
      );
      cs.setData(
        displayCandles.map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      mainSeries = cs;
    }
    mainSeriesRef.current = mainSeries;

    // 2. Price Overlays (Pane 0)
    const addLineOverlay = (
      points: Array<{ time: number; value: number; color?: string }>,
      color: string,
      lineWidth: 1 | 2 | 3 = 1,
      lineStyle = LineStyle.Solid,
      title = '',
    ) => {
      if (points.length === 0) return;
      const s = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth,
          lineStyle,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          title,
        },
        0,
      );
      s.setData(
        points.map((p) => ({
          time: p.time as Time,
          value: p.value,
          ...(p.color ? { color: p.color } : {}),
        })),
      );
    };

    if (chartSettings.showEma21) {
      addLineOverlay(analysis.ema21, '#38bdf8', 1, LineStyle.Solid, 'EMA 21');
    }
    if (chartSettings.showSma50) {
      addLineOverlay(analysis.sma50, '#f59e0b', 1, LineStyle.Solid, 'SMA 50');
    }
    if (chartSettings.showSma200) {
      addLineOverlay(analysis.sma200, '#c084fc', 2, LineStyle.Solid, 'SMA 200');
    }
    if (chartSettings.showVwap && analysis.vwap.length > 0) {
      addLineOverlay(analysis.vwap, '#22d3ee', 1, LineStyle.Dotted, 'VWAP');
    }
    if (chartSettings.showSupertrend && analysis.supertrend.length > 0) {
      addLineOverlay(
        analysis.supertrend.map((s) => ({
          time: s.time,
          value: s.value,
          color: s.direction === 1 ? '#10b981' : '#ef4444',
        })),
        '#10b981',
        2,
        LineStyle.Solid,
        'Supertrend',
      );
    }
    if (chartSettings.showBollinger && analysis.bollinger.length > 0) {
      addLineOverlay(
        analysis.bollinger.map((b) => ({ time: b.time, value: b.upper })),
        'rgba(148, 163, 184, 0.55)',
        1,
        LineStyle.Dashed,
      );
      addLineOverlay(
        analysis.bollinger.map((b) => ({ time: b.time, value: b.lower })),
        'rgba(148, 163, 184, 0.55)',
        1,
        LineStyle.Dashed,
      );
    }
    if (chartSettings.showIchimoku) {
      addLineOverlay(analysis.ichimoku.tenkan, '#60a5fa', 1, LineStyle.Solid);
      addLineOverlay(analysis.ichimoku.kijun, '#f97316', 1, LineStyle.Solid);
      addLineOverlay(analysis.ichimoku.senkouA, 'rgba(16, 185, 129, 0.55)', 1, LineStyle.Dotted);
      addLineOverlay(analysis.ichimoku.senkouB, 'rgba(239, 68, 68, 0.55)', 1, LineStyle.Dotted);
    }

    // 3. Fibonacci & Elliott Wave Primitives
    if (chartSettings.showAutoFib && analysis.fibonacci) {
      const fibPrim = new FibonacciPrimitive(false);
      mainSeries.attachPrimitive(fibPrim);
      fibPrim.setData(analysis.fibonacci, meta.decimals);
    }

    if (manualFibAnalysis) {
      const manPrim = new FibonacciPrimitive(true);
      mainSeries.attachPrimitive(manPrim);
      manPrim.setData(manualFibAnalysis, meta.decimals);
    }

    if (chartSettings.showElliott && analysis.elliott.primary) {
      const ewPrim = new ElliottWavePrimitive();
      mainSeries.attachPrimitive(ewPrim);
      ewPrim.setData(analysis.elliott.primary, meta.decimals);
    }

    // 4. Signal Markers on Price Series
    if (chartSettings.showSignals) {
      const markers: SeriesMarker<Time>[] = [];
      for (const cross of analysis.maCrosses) {
        markers.push({
          time: cross.time as Time,
          position: cross.type === 'golden_cross' ? 'belowBar' : 'aboveBar',
          color: cross.type === 'golden_cross' ? '#10b981' : '#ef4444',
          shape: cross.type === 'golden_cross' ? 'arrowUp' : 'arrowDown',
          text: cross.type === 'golden_cross' ? 'Golden Cross' : 'Death Cross',
        });
      }
      for (const div of analysis.rsiDivergences.slice(-4)) {
        markers.push({
          time: div.time as Time,
          position: div.type === 'bullish' ? 'belowBar' : 'aboveBar',
          color: div.type === 'bullish' ? '#38bdf8' : '#f59e0b',
          shape: 'circle',
          text: div.type === 'bullish' ? 'RSI Div+' : 'RSI Div-',
        });
      }
      for (const st of analysis.supertrend.filter((p) => p.flipped).slice(-4)) {
        markers.push({
          time: st.time as Time,
          position: st.direction === 1 ? 'belowBar' : 'aboveBar',
          color: st.direction === 1 ? '#10b981' : '#ef4444',
          shape: st.direction === 1 ? 'arrowUp' : 'arrowDown',
          text: st.direction === 1 ? 'ST Buy' : 'ST Sell',
        });
      }

      markers.sort((a, b) => Number(a.time) - Number(b.time));
      if (markers.length > 0) {
        createSeriesMarkers(mainSeries, markers);
      }
    }

    // 5. Sub-Panes (Native Lightweight Charts v5 Multi-Pane)
    let nextPane = 1;
    const hasVol = candles.some((c) => c.volume > 0);

    if (chartSettings.showVolume && hasVol && !compact) {
      const volPane = nextPane++;
      const volSeries = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: 'volume' },
          priceLineVisible: false,
          lastValueVisible: false,
        },
        volPane,
      );
      volSeries.setData(
        candles.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color:
            c.close >= c.open
              ? 'rgba(16, 185, 129, 0.38)'
              : 'rgba(239, 68, 68, 0.38)',
        })),
      );
    }

    if (chartSettings.showRsi && analysis.rsi.length > 0 && !compact) {
      const rsiPane = nextPane++;
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: '#a78bfa',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'RSI (14)',
        },
        rsiPane,
      );
      rsiSeries.setData(analysis.rsi.map((p) => ({ time: p.time as Time, value: p.value })));
      rsiSeries.createPriceLine({
        price: 70,
        color: 'rgba(239, 68, 68, 0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: 'rgba(16, 185, 129, 0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
    }

    if (chartSettings.showMacd && analysis.macd.length > 0 && !compact) {
      const macdPane = nextPane++;
      const histSeries = chart.addSeries(
        HistogramSeries,
        {
          priceLineVisible: false,
          lastValueVisible: false,
        },
        macdPane,
      );
      histSeries.setData(
        analysis.macd.map((m) => ({
          time: m.time as Time,
          value: m.histogram,
          color:
            m.histogram >= 0
              ? 'rgba(16, 185, 129, 0.55)'
              : 'rgba(239, 68, 68, 0.55)',
        })),
      );
      const macdLine = chart.addSeries(
        LineSeries,
        {
          color: '#38bdf8',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: 'MACD',
        },
        macdPane,
      );
      macdLine.setData(analysis.macd.map((m) => ({ time: m.time as Time, value: m.macd })));
      const sigLine = chart.addSeries(
        LineSeries,
        {
          color: '#f59e0b',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: 'Signal',
        },
        macdPane,
      );
      sigLine.setData(analysis.macd.map((m) => ({ time: m.time as Time, value: m.signal })));
    }

    if (chartSettings.showAdx && analysis.adx.length > 0 && !compact) {
      const adxPane = nextPane++;
      const adxSeries = chart.addSeries(
        LineSeries,
        {
          color: '#f8fafc',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'ADX',
        },
        adxPane,
      );
      adxSeries.setData(analysis.adx.map((a) => ({ time: a.time as Time, value: a.adx })));
      adxSeries.createPriceLine({
        price: 25,
        color: 'rgba(245, 158, 11, 0.45)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
      const plusDi = chart.addSeries(
        LineSeries,
        {
          color: '#10b981',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        adxPane,
      );
      plusDi.setData(analysis.adx.map((a) => ({ time: a.time as Time, value: a.plusDI })));
      const minusDi = chart.addSeries(
        LineSeries,
        {
          color: '#ef4444',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        },
        adxPane,
      );
      minusDi.setData(analysis.adx.map((a) => ({ time: a.time as Time, value: a.minusDI })));
    }

    // Balance vertical pane proportions
    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setStretchFactor(3.4);
      for (let i = 1; i < panes.length; i++) {
        panes[i].setStretchFactor(1);
      }
    }

    // Show trailing ~150 bars on daily/weekly or fit all on shorter intraday windows
    if (candles.length > 140) {
      chart.timeScale().setVisibleLogicalRange({
        from: candles.length - 140,
        to: candles.length + 6,
      });
    } else {
      chart.timeScale().fitContent();
    }

    // Crosshair hover OHLCV readout
    const rsiMap = new Map(analysis.rsi.map((p) => [p.time, p.value]));
    const adxMap = new Map(analysis.adx.map((p) => [p.time, p.adx]));
    const candleMap = new Map(candles.map((c) => [c.time, c]));

    let lastHoverTime: number | null = null;
    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        if (lastHoverTime !== null) {
          lastHoverTime = null;
          setHoverOhlc(null);
        }
        return;
      }
      const t = Number(param.time);
      if (lastHoverTime === t) return;
      const bar = candleMap.get(t);
      if (!bar) return;
      lastHoverTime = t;
      setHoverOhlc({
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        rsi: rsiMap.get(t) ?? null,
        adx: adxMap.get(t) ?? null,
      });
    });

    // Click handler for Manual Fibonacci drawing (native DOM click avoids LWC's 250ms dblclick suppression)
    let downPos: { x: number; y: number } | null = null;
    const handlePointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const handleContainerClick = (e: MouseEvent) => {
      const mode = drawStepRef.current;
      if (mode === 'idle') return;
      if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const priceScaleWidth = chart.priceScale('right').width();
      if (localX < 0 || localX > rect.width - priceScaleWidth) return;

      const price = mainSeries.coordinateToPrice(localY);
      if (price === null) return;

      let timeVal = chart.timeScale().coordinateToTime(localX);
      if (timeVal === null) {
        const logical = chart.timeScale().coordinateToLogical(localX);
        if (logical === null) return;
        const clampedIdx = Math.max(0, Math.min(candles.length - 1, Math.round(logical)));
        timeVal = candles[clampedIdx].time as Time;
      }

      const anchor: FibAnchor = { time: Number(timeVal), price: Number(price) };
      if (mode === 'pick_start') {
        setPendingStart(anchor);
        setDrawStep('pick_end');
      } else if (mode === 'pick_end' && pendingStartRef.current) {
        setManualFib(symbolRef.current, {
          start: pendingStartRef.current,
          end: anchor,
        });
        setPendingStart(null);
        setDrawStep('idle');
      }
    };

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('click', handleContainerClick);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 10 && height > 10) {
          chart.applyOptions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('click', handleContainerClick);
      resizeObserver.disconnect();
      chart.remove();
      chartInstanceRef.current = null;
      mainSeriesRef.current = null;
    };
  }, [
    symbol,
    tf,
    candles,
    analysis,
    manualFibAnalysis,
    chartSettings,
    compact,
    isFullscreen,
    meta.decimals,
    setManualFib,
  ]);

  const toggleBoolSetting = (
    key:
      | 'showEma21'
      | 'showSma50'
      | 'showSma200'
      | 'showVwap'
      | 'showSupertrend'
      | 'showBollinger'
      | 'showIchimoku'
      | 'showAutoFib'
      | 'showElliott'
      | 'showSignals'
      | 'showVolume'
      | 'showRsi'
      | 'showMacd'
      | 'showAdx'
      | 'logScale',
  ) => {
    updateChartSetting(key, !chartSettings[key]);
  };

  const priceIsUp = (quote?.changePercent ?? 0) >= 0;
  const lastCandle = candles[candles.length - 1];
  const displayPrice = quote?.price ?? lastCandle?.close ?? 0;

  const renderChartInner = (fullscreenMode: boolean) => (
    <div className="flex h-full flex-col overflow-hidden bg-[#0b111c]">
      {/* Asset & Live Price Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
          {!lockedSymbol ? (
            <>
              <QuickAssetTabs
                tabs={quickTabs}
                activeSymbol={symbol}
                quoteMap={quoteMap}
                onSelect={handleSelectQuickSymbol}
              />

              {meta.inCatalog && (
                <button
                  type="button"
                  onClick={() => toggleBookmark(symbol)}
                  title={
                    meta.bookmarked
                      ? `${meta.shortName} aus Bookmarks entfernen`
                      : `${meta.shortName} bookmarken`
                  }
                  className={`widget-no-drag shrink-0 rounded-lg border p-1 transition ${
                    meta.bookmarked
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-amber-300'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${meta.bookmarked ? 'fill-amber-400' : ''}`} />
                </button>
              )}

              {onOpenCatalog && (
                <button
                  type="button"
                  onClick={onOpenCatalog}
                  title="Wertpapier-Katalog öffnen"
                  className="widget-no-drag flex shrink-0 items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:border-sky-500/50 hover:text-sky-200"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
                  Katalog
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-slate-100">{meta.name}</span>
              <span className="font-mono-num text-sm font-semibold text-white">
                {fmtPrice(displayPrice, meta.decimals)}
              </span>
              {quote && (
                <span
                  className={`font-mono-num rounded px-1.5 py-0.5 text-xs font-medium ${
                    priceIsUp
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {priceIsUp ? '+' : ''}
                  {quote.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Controls: Timeframes + Style + Fullscreen */}
        <div className="widget-no-drag flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/70 p-0.5">
            {TIMEFRAMES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  lockedSymbol ? setLocalTimeframe(item.id) : setActiveTimeframe(item.id)
                }
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                  tf === item.id
                    ? 'bg-sky-500/25 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <select
            aria-label="Chart-Darstellung"
            value={chartSettings.style}
            onChange={(e) => updateChartSetting('style', e.target.value as ChartStyle)}
            className="rounded-lg border border-slate-800 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-sky-500"
          >
            <option value="candles">Kerzen</option>
            <option value="heikin_ashi">Heikin-Ashi</option>
            <option value="line">Linie</option>
          </select>

          <button
            type="button"
            onClick={() => toggleBoolSetting('logScale')}
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
              chartSettings.logScale
                ? 'border-sky-500/60 bg-sky-500/20 text-sky-300'
                : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
            }`}
          >
            LOG
          </button>

          {!lockedSymbol && !compact && (
            <button
              type="button"
              onClick={() => setShowFundamentalsSidebar(!showFundamentalsSidebar)}
              aria-expanded={showFundamentalsSidebar}
              title={
                showFundamentalsSidebar
                  ? 'Fundamentaldaten einklappen'
                  : 'Fundamentaldaten einblenden'
              }
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                showFundamentalsSidebar
                  ? 'border-sky-500/60 bg-sky-500/20 text-sky-300'
                  : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
              }`}
            >
              {showFundamentalsSidebar ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Fundamental</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen(!fullscreenMode)}
            title={fullscreenMode ? 'Vollbild schließen' : 'Chart maximieren'}
            className="rounded-lg border border-slate-800 bg-slate-900/70 p-1 text-slate-400 transition hover:border-slate-700 hover:text-slate-100"
          >
            {fullscreenMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Technical Overlay & Indicator Toggles */}
      <div className="widget-no-drag flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-800/70 bg-[#0d1422] px-3 py-1.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ['showAutoFib', 'Auto-Fib', 'amber'],
              ['showElliott', 'Elliott-Wellen', 'sky'],
              ['showSupertrend', 'Supertrend', 'emerald'],
              ['showEma21', 'EMA 21', 'sky'],
              ['showSma50', 'SMA 50', 'amber'],
              ['showSma200', 'SMA 200', 'purple'],
              ['showBollinger', 'Bollinger', 'slate'],
              ['showIchimoku', 'Ichimoku', 'slate'],
              ['showVwap', 'VWAP', 'slate'],
              ['showSignals', 'Signale', 'emerald'],
            ] as const
          ).map(([key, label, accent]) => {
            const active = chartSettings[key];
            const activeCls =
              accent === 'amber'
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : accent === 'emerald'
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : accent === 'purple'
                    ? 'border-purple-500/50 bg-purple-500/15 text-purple-300'
                    : accent === 'sky'
                      ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                      : 'border-slate-500/60 bg-slate-700/40 text-slate-200';
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleBoolSetting(key)}
                className={`rounded border px-1.5 py-0.5 font-medium transition ${
                  active
                    ? activeCls
                    : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            );
          })}

          {chartSettings.showElliott && (
            <select
              aria-label="Elliott Grad"
              value={chartSettings.elliottDegree}
              onChange={(e) =>
                updateChartSetting('elliottDegree', e.target.value as ElliottDegree)
              }
              className="ml-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[11px] text-sky-300 outline-none"
            >
              <option value="minor">EW: Minor</option>
              <option value="intermediate">EW: Interm.</option>
              <option value="primary">EW: Primary</option>
            </select>
          )}
        </div>

        {/* Sub-Panes + Manual Fib Drawing Tool */}
        <div className="flex flex-wrap items-center gap-1">
          {!compact &&
            (
              [
                ['showVolume', 'Vol'],
                ['showRsi', 'RSI'],
                ['showMacd', 'MACD'],
                ['showAdx', 'ADX'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleBoolSetting(key)}
                className={`rounded border px-1.5 py-0.5 font-medium transition ${
                  chartSettings[key]
                    ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                    : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}

          <button
            type="button"
            onClick={() => {
              if (drawStep === 'idle') {
                setPendingStart(null);
                setDrawStep('pick_start');
              } else {
                setPendingStart(null);
                setDrawStep('idle');
              }
            }}
            className={`ml-1 flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium transition ${
              drawStep !== 'idle'
                ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <PenTool className="h-3 w-3" />
            {drawStep === 'idle' ? 'Manuell-Fib' : 'Abbrechen'}
          </button>

          {manualPair && (
            <button
              type="button"
              onClick={() => setManualFib(symbol, null)}
              title="Manuelles Fibonacci entfernen"
              className="rounded border border-rose-500/40 bg-rose-500/10 p-0.5 text-rose-300 hover:bg-rose-500/20"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Live OHLCV + Fib / Elliott Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/50 bg-[#090e17] px-3 py-1 text-[11px]">
        <div className="font-mono-num flex flex-wrap items-center gap-3 text-slate-400">
          {hoverOhlc ? (
            <>
              <span>O: {fmtPrice(hoverOhlc.o, meta.decimals)}</span>
              <span>H: {fmtPrice(hoverOhlc.h, meta.decimals)}</span>
              <span>L: {fmtPrice(hoverOhlc.l, meta.decimals)}</span>
              <span className="text-slate-200">C: {fmtPrice(hoverOhlc.c, meta.decimals)}</span>
              {hoverOhlc.rsi !== null && <span>RSI: {hoverOhlc.rsi.toFixed(1)}</span>}
              {hoverOhlc.adx !== null && <span>ADX: {hoverOhlc.adx.toFixed(1)}</span>}
            </>
          ) : lastCandle ? (
            <>
              <span className="font-semibold text-slate-200">{meta.name}</span>
              <span className="text-slate-300">
                Letzter Schluss: {fmtPrice(displayPrice, meta.decimals)} {meta.unit}
              </span>
              {analysis?.latest.rsi !== null && analysis?.latest.rsi !== undefined && (
                <span>RSI: {analysis.latest.rsi.toFixed(1)}</span>
              )}
              {analysis?.latest.adx !== null && analysis?.latest.adx !== undefined && (
                <span>ADX: {analysis.latest.adx.toFixed(1)}</span>
              )}
            </>
          ) : (
            <span>Lade Kursdaten…</span>
          )}
        </div>

        {analysis && (
          <div className="flex flex-wrap items-center gap-2">
            {analysis.fibonacci && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] text-amber-300">
                GP: {fmtPrice(analysis.fibonacci.goldenPocket.low, meta.decimals)}–
                {fmtPrice(analysis.fibonacci.goldenPocket.high, meta.decimals)}
              </span>
            )}
            {analysis.elliott.primary && (
              <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10.5px] text-sky-300">
                EW: {analysis.elliott.primary.activeWave} ({analysis.elliott.primary.confidence}%) ·
                Inv. {fmtPrice(analysis.elliott.primary.invalidationLevel, meta.decimals)}
              </span>
            )}
            <span
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                analysis.scores.confluence >= 15
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : analysis.scores.confluence <= -15
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-slate-800 text-slate-300'
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              Score {analysis.scores.confluence > 0 ? '+' : ''}
              {analysis.scores.confluence}
            </span>
          </div>
        )}
      </div>

      {/* Main Chart Canvas + Collapsible Fundamentals Sidebar */}
      <div className="flex min-h-[240px] flex-1 overflow-hidden">
        <div className="relative min-w-0 flex-1">
          {drawStep !== 'idle' && (
            <div className="pointer-events-none absolute top-2 left-3 z-20 flex items-center gap-1.5 rounded-md border border-sky-400/50 bg-sky-950/90 px-2.5 py-1 text-xs font-medium text-sky-200 shadow-lg">
              <Crosshair className="h-3.5 w-3.5" />
              {drawStep === 'pick_start'
                ? 'Schritt 1/2: Klicke im Chart auf den Start-Swing (0 % / 100 %)'
                : 'Schritt 2/2: Klicke auf den End-Swing für das manuelle Fibonacci'}
            </div>
          )}

          {candlesQuery.isLoading && candles.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-400">
              <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
              Lade Marktdaten für {meta.shortName}…
            </div>
          ) : candlesQuery.isError && candles.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-rose-400">
              <span>Fehler beim Laden von {meta.shortName}: {(candlesQuery.error as Error).message}</span>
              <button
                type="button"
                onClick={() => candlesQuery.refetch()}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
              >
                Erneut versuchen
              </button>
            </div>
          ) : (
            <div
              ref={fullscreenMode ? fullscreenHostRef : chartHostRef}
              className="h-full w-full"
            />
          )}
        </div>

        {!lockedSymbol && !compact && showFundamentalsSidebar && (
          <FundamentalsSidebar
            symbol={symbol}
            assetName={meta.name}
            shortName={meta.shortName}
            currentPrice={displayPrice}
            decimals={meta.decimals}
            unit={meta.unit}
            onCollapse={() => setShowFundamentalsSidebar(false)}
            onSelectSymbol={(sym) => setActiveSymbol(sym)}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {renderChartInner(false)}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85 p-3 backdrop-blur-sm">
          <div className="flex-1 overflow-hidden rounded-xl border border-slate-700/70 shadow-2xl">
            {renderChartInner(true)}
          </div>
        </div>
      )}
    </>
  );
});

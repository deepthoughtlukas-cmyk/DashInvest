import type {
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  ISeriesApi,
  IChartApiBase,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { FibonacciAnalysis } from '../../../engine/fibonacci.ts';

interface RenderedFibLevel {
  y: number;
  price: number;
  ratio: number;
  label: string;
  isGoldenPocket: boolean;
  isExtension: boolean;
}

interface RenderedFibData {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  leftX: number;
  levels: RenderedFibLevel[];
  gpTopY: number | null;
  gpBottomY: number | null;
  decimals: number;
  isManual: boolean;
}

class FibPaneRenderer implements IPrimitivePaneRenderer {
  private data: RenderedFibData | null;

  constructor(data: RenderedFibData | null) {
    this.data = data;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const data = this.data;
    if (!data || data.levels.length === 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const width = mediaSize.width;
      const rightEdge = width - 4;
      const startX = Math.max(0, Math.min(data.leftX, width - 80));

      ctx.save();

      // Shaded Golden Pocket Zone (0.618 - 0.650)
      if (data.gpTopY !== null && data.gpBottomY !== null) {
        const yMin = Math.min(data.gpTopY, data.gpBottomY);
        const height = Math.max(2, Math.abs(data.gpBottomY - data.gpTopY));
        ctx.fillStyle = data.isManual
          ? 'rgba(56, 189, 248, 0.16)'
          : 'rgba(245, 158, 11, 0.16)';
        ctx.fillRect(startX, yMin, width - startX, height);
      }

      // Subtle anchor connecting line
      if (Number.isFinite(data.startY) && Number.isFinite(data.endY)) {
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = data.isManual
          ? 'rgba(56, 189, 248, 0.5)'
          : 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1;
        ctx.moveTo(data.startX, data.startY);
        ctx.lineTo(data.endX, data.endY);
        ctx.stroke();

        // Anchor dots
        for (const pt of [
          { x: data.startX, y: data.startY },
          { x: data.endX, y: data.endY },
        ]) {
          ctx.beginPath();
          ctx.setLineDash([]);
          ctx.fillStyle = data.isManual ? '#38bdf8' : '#f59e0b';
          ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Level lines and labels
      ctx.font = '500 10.5px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';

      let lastLabelY = -999;

      for (const lvl of data.levels) {
        if (lvl.y < -10 || lvl.y > mediaSize.height + 10) continue;

        const isKey =
          lvl.ratio === 0 ||
          lvl.ratio === 0.5 ||
          lvl.ratio === 1 ||
          lvl.isGoldenPocket ||
          lvl.ratio === 1.618;

        ctx.beginPath();
        if (lvl.isExtension) {
          ctx.setLineDash([3, 4]);
        } else if (!isKey) {
          ctx.setLineDash([5, 4]);
        } else {
          ctx.setLineDash([]);
        }

        if (lvl.isGoldenPocket) {
          ctx.strokeStyle = data.isManual
            ? 'rgba(56, 189, 248, 0.9)'
            : 'rgba(245, 158, 11, 0.9)';
          ctx.lineWidth = 1.4;
        } else if (lvl.isExtension) {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.65)';
          ctx.lineWidth = 1;
        } else if (lvl.ratio === 0 || lvl.ratio === 1) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
          ctx.lineWidth = 1;
        }

        ctx.moveTo(startX, lvl.y);
        ctx.lineTo(width, lvl.y);
        ctx.stroke();

        // Skip colliding labels except golden pocket
        if (Math.abs(lvl.y - lastLabelY) < 13 && !lvl.isGoldenPocket) continue;
        lastLabelY = lvl.y;

        const prefix = data.isManual ? 'M-' : '';
        const text = `${prefix}${lvl.label} · ${lvl.price.toFixed(data.decimals)}`;
        const metrics = ctx.measureText(text);
        const padX = 5;
        const boxW = metrics.width + padX * 2;
        const boxH = 15;
        const boxX = Math.max(startX + 4, rightEdge - boxW - 2);
        const boxY = lvl.y - boxH / 2;

        ctx.fillStyle = lvl.isGoldenPocket
          ? data.isManual
            ? 'rgba(14, 116, 144, 0.85)'
            : 'rgba(180, 83, 9, 0.88)'
          : 'rgba(15, 22, 35, 0.85)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 3);
        ctx.fill();

        ctx.fillStyle = lvl.isGoldenPocket
          ? '#fef3c7'
          : lvl.isExtension
            ? '#d8b4fe'
            : '#cbd5e1';
        ctx.fillText(text, boxX + padX, lvl.y + 0.5);
      }

      ctx.restore();
    });
  }
}

class FibPaneView implements IPrimitivePaneView {
  private data: RenderedFibData | null = null;

  update(data: RenderedFibData | null) {
    this.data = data;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new FibPaneRenderer(this.data);
  }
}

export class FibonacciPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private analysis: FibonacciAnalysis | null = null;
  private decimals = 2;
  private isManual = false;
  private paneView = new FibPaneView();

  constructor(isManual = false) {
    this.isManual = isManual;
  }

  setData(analysis: FibonacciAnalysis | null, decimals = 2) {
    this.analysis = analysis;
    this.decimals = decimals;
    this.updateAllViews();
    this.requestUpdate?.();
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
    this.updateAllViews();
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  updateAllViews(): void {
    if (!this.chart || !this.series || !this.analysis) {
      this.paneView.update(null);
      return;
    }

    const timeScale = this.chart.timeScale();
    const rawStartX = timeScale.timeToCoordinate(this.analysis.anchorStart.time as Time);
    const rawEndX = timeScale.timeToCoordinate(this.analysis.anchorEnd.time as Time);
    const startY = this.series.priceToCoordinate(this.analysis.anchorStart.price);
    const endY = this.series.priceToCoordinate(this.analysis.anchorEnd.price);

    const startX = rawStartX ?? 0;
    const endX = rawEndX ?? 120;
    const leftX = Math.min(startX, endX);

    const levels: RenderedFibLevel[] = [];
    for (const l of this.analysis.levels) {
      const y = this.series.priceToCoordinate(l.price);
      if (y === null) continue;
      levels.push({
        y,
        price: l.price,
        ratio: l.ratio,
        label: l.label,
        isGoldenPocket: l.isGoldenPocket,
        isExtension: l.isExtension,
      });
    }

    const gpTopY = this.series.priceToCoordinate(this.analysis.goldenPocket.high);
    const gpBottomY = this.series.priceToCoordinate(this.analysis.goldenPocket.low);

    this.paneView.update({
      startX,
      startY: startY ?? 0,
      endX,
      endY: endY ?? 0,
      leftX,
      levels,
      gpTopY,
      gpBottomY,
      decimals: this.decimals,
      isManual: this.isManual,
    });
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}

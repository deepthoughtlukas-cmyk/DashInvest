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
import type { ElliottWaveCount } from '../../../engine/elliottWave.ts';

interface RenderedPoint {
  x: number;
  y: number;
  label: string;
  kind: 'high' | 'low';
  provisional?: boolean;
}

interface RenderedElliottData {
  points: RenderedPoint[];
  direction: 'bullish' | 'bearish';
  patternType: 'impulse' | 'abc_correction';
  invalidationY: number | null;
  invalidationPrice: number;
  targetTopY: number | null;
  targetBottomY: number | null;
  targetLabel: string;
  decimals: number;
}

class ElliottPaneRenderer implements IPrimitivePaneRenderer {
  private data: RenderedElliottData | null;

  constructor(data: RenderedElliottData | null) {
    this.data = data;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const data = this.data;
    if (!data || data.points.length < 2) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const width = mediaSize.width;
      const isBull = data.direction === 'bullish';
      const strokeColor =
        data.patternType === 'abc_correction'
          ? '#a78bfa'
          : isBull
            ? '#38bdf8'
            : '#fb7185';

      ctx.save();

      // Target projection zone box on right side of last point
      const lastPt = data.points[data.points.length - 1];
      if (data.targetTopY !== null && data.targetBottomY !== null) {
        const boxLeft = Math.max(40, Math.min(width - 140, lastPt.x + 8));
        const boxWidth = Math.max(60, width - boxLeft - 6);
        const yTop = Math.min(data.targetTopY, data.targetBottomY);
        const boxH = Math.max(12, Math.abs(data.targetBottomY - data.targetTopY));

        ctx.fillStyle = isBull
          ? 'rgba(16, 185, 129, 0.13)'
          : 'rgba(239, 68, 68, 0.13)';
        ctx.strokeStyle = isBull
          ? 'rgba(16, 185, 129, 0.45)'
          : 'rgba(239, 68, 68, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(boxLeft, yTop, boxWidth, boxH);
        ctx.strokeRect(boxLeft, yTop, boxWidth, boxH);

        ctx.font = '600 10px Inter, sans-serif';
        ctx.fillStyle = isBull ? '#6ee7b7' : '#fda4af';
        ctx.fillText(data.targetLabel, boxLeft + 6, yTop + 11);
      }

      // Invalidation horizontal dashed line
      if (data.invalidationY !== null && data.invalidationY > 0 && data.invalidationY < mediaSize.height) {
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.78)';
        ctx.lineWidth = 1.2;
        const invStartX = Math.max(0, data.points[0].x);
        ctx.moveTo(invStartX, data.invalidationY);
        ctx.lineTo(width, data.invalidationY);
        ctx.stroke();

        const invLabel = `EW Inv. ${data.invalidationPrice.toFixed(data.decimals)}`;
        ctx.font = '600 10px "JetBrains Mono", monospace';
        const tw = ctx.measureText(invLabel).width;
        const bx = Math.max(invStartX + 4, width - tw - 16);
        const by = data.invalidationY - 8;
        ctx.fillStyle = 'rgba(127, 29, 29, 0.9)';
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + 10, 15, 3);
        ctx.fill();
        ctx.fillStyle = '#fecaca';
        ctx.textBaseline = 'middle';
        ctx.fillText(invLabel, bx + 5, data.invalidationY);
      }

      // Wave segments
      ctx.lineWidth = 2;
      for (let i = 1; i < data.points.length; i++) {
        const prev = data.points[i - 1];
        const curr = data.points[i];
        ctx.beginPath();
        ctx.setLineDash(curr.provisional ? [5, 4] : []);
        ctx.strokeStyle = strokeColor;
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }

      // Wave label badges
      ctx.setLineDash([]);
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (const pt of data.points) {
        if (pt.x < -20 || pt.x > width + 20) continue;
        const offsetY = pt.kind === 'high' ? -15 : 15;
        const badgeY = Math.max(12, Math.min(mediaSize.height - 12, pt.y + offsetY));

        // Node circle
        ctx.beginPath();
        ctx.fillStyle = strokeColor;
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Badge pill
        const radius = 10;
        ctx.beginPath();
        ctx.fillStyle = '#0f1623';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.arc(pt.x, badgeY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.fillText(pt.label, pt.x, badgeY + 0.5);
      }

      ctx.restore();
    });
  }
}

class ElliottPaneView implements IPrimitivePaneView {
  private data: RenderedElliottData | null = null;

  update(data: RenderedElliottData | null) {
    this.data = data;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new ElliottPaneRenderer(this.data);
  }
}

export class ElliottWavePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private count: ElliottWaveCount | null = null;
  private decimals = 2;
  private paneView = new ElliottPaneView();

  setData(count: ElliottWaveCount | null, decimals = 2) {
    this.count = count;
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
    if (!this.chart || !this.series || !this.count || this.count.points.length < 2) {
      this.paneView.update(null);
      return;
    }

    const ts = this.chart.timeScale();
    const points: RenderedPoint[] = [];

    for (const p of this.count.points) {
      const x = ts.timeToCoordinate(p.time as Time);
      const y = this.series.priceToCoordinate(p.price);
      if (x === null || y === null) continue;
      points.push({
        x,
        y,
        label: p.label,
        kind: p.kind,
        provisional: p.provisional,
      });
    }

    if (points.length < 2) {
      this.paneView.update(null);
      return;
    }

    const invalidationY = this.series.priceToCoordinate(this.count.invalidationLevel);
    const targetTopY = this.series.priceToCoordinate(this.count.targetZone.high);
    const targetBottomY = this.series.priceToCoordinate(this.count.targetZone.low);

    this.paneView.update({
      points,
      direction: this.count.direction,
      patternType: this.count.patternType,
      invalidationY,
      invalidationPrice: this.count.invalidationLevel,
      targetTopY,
      targetBottomY,
      targetLabel: this.count.targetZone.label,
      decimals: this.decimals,
    });
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }
}

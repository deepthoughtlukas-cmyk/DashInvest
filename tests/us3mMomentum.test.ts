import { describe, expect, it } from 'vitest';
import type { MacroOverview, MacroPoint } from '../shared/types.ts';
import { analyzeUs3mMomentum } from '../shared/yieldMomentum.ts';
import { evaluateMacroRegime } from '../src/engine/signals.ts';

function buildDateSeries(values: number[]): MacroPoint[] {
  const start = new Date('2026-06-01T00:00:00Z');
  return values.map((value, idx) => {
    const dt = new Date(start);
    dt.setUTCDate(dt.getUTCDate() + idx);
    return {
      date: dt.toISOString().slice(0, 10),
      value: Number(value.toFixed(3)),
    };
  });
}

function buildBaseMacro(): MacroOverview {
  return {
    dxy: {
      quote: {
        id: 'DXY',
        symbol: 'DX-Y.NYB',
        name: 'DXY',
        shortName: 'DXY',
        price: 103,
        change: 0,
        changePercent: 0,
        prevClose: 103,
        dayHigh: 103.5,
        dayLow: 102.5,
        fiftyTwoWeekHigh: 107,
        fiftyTwoWeekLow: 99,
        currency: 'USD',
        unit: 'Pkt.',
        decimals: 2,
        updatedAt: '2026-11-24T19:00:00Z',
      },
      history: buildDateSeries([104, 103.5, 103]),
      sma50: 103,
      sma200: 103,
      trend: 'neutral',
    },
    m2: {
      latestB: 23000,
      latestT: 23.0,
      date: '2026-10-01',
      yoyPercent: 3.0,
      threeMonthAnnualizedPercent: 3.0,
      momPercent: 0.3,
      status: 'expanding',
      history: buildDateSeries([22500, 22800, 23000]),
    },
    us10y: {
      yieldPercent: 4.35,
      change1dBps: 0,
      change1wBps: -2,
      change1mBps: -8,
      spread2s10sPercent: 0.25,
      spread2s10sBps: 25,
      curveStatus: 'normal',
      date: '2026-11-24',
      history: buildDateSeries([4.45, 4.4, 4.35]),
      spreadHistory: buildDateSeries([0.2, 0.22, 0.25]),
    },
    creditSpreads: {
      hyOasBps: 330,
      hyOasPercent: 3.3,
      change1wBps: 0,
      change1mBps: -5,
      percentile5y: 25,
      regime: 'risk-on',
      date: '2026-11-24',
      history: buildDateSeries([335, 332, 330]),
    },
    netLiquidity: {
      currentB: 5900,
      currentT: 5.9,
      fedAssetsB: 6750,
      tgaB: 800,
      rrpB: 50,
      delta4wB: 20,
      delta4wPercent: 0.3,
      delta13wB: 40,
      delta13wPercent: 0.7,
      impulse: 'neutral',
      date: '2026-11-24',
      history: [],
    },
    comparisons: { sp500: [], gold: [] },
    updatedAt: '2026-11-24T19:00:00Z',
  };
}

describe('3M US Treasury Yield Momentum-Turn Leading Indicator', () => {
  it('detects upward momentum reversal (turning_up) and flags diverging_up when 10Y is still calm', () => {
    // 55 falling days followed by 8 rebounding days -> EMA10 crosses cleanly above EMA30
    const vals = [
      ...Array.from({ length: 55 }, (_, i) => 4.8 - i * 0.015),
      4.02,
      4.06,
      4.12,
      4.18,
      4.25,
      4.32,
      4.39,
      4.46,
    ];
    const mom = analyzeUs3mMomentum(buildDateSeries(vals), -8);

    expect(mom.status).toBe('turning_up');
    expect(mom.direction).toBe('up');
    expect(mom.isTurning).toBe(true);
    expect(mom.lastTurnDirection).toBe('up');
    expect(mom.lastTurnDate).not.toBeNull();
    expect(mom.tradingDaysSinceTurn).toBeLessThanOrEqual(15);
    expect(mom.leadSignal).toBe('diverging_up');
    expect(mom.leadSummary).toContain('Vorlauf-Warnung');
  });

  it('detects downward momentum reversal (turning_down) and flags diverging_down when 10Y is still elevated', () => {
    // 55 rising days followed by 8 falling days -> EMA10 crosses cleanly below EMA30
    const vals = [
      ...Array.from({ length: 55 }, (_, i) => 3.8 + i * 0.015),
      4.56,
      4.5,
      4.43,
      4.36,
      4.29,
      4.22,
      4.15,
      4.08,
    ];
    const mom = analyzeUs3mMomentum(buildDateSeries(vals), +10);

    expect(mom.status).toBe('turning_down');
    expect(mom.direction).toBe('down');
    expect(mom.isTurning).toBe(true);
    expect(mom.lastTurnDirection).toBe('down');
    expect(mom.leadSignal).toBe('diverging_down');
    expect(mom.leadSummary).toContain('Vorlauf-Entlastung');
  });

  it('classifies steady trend and flat range without false turn alerts', () => {
    const steadyUp = Array.from({ length: 65 }, (_, i) => 3.9 + i * 0.01);
    const upRes = analyzeUs3mMomentum(buildDateSeries(steadyUp), 20);
    expect(upRes.status).toBe('rising');
    expect(upRes.isTurning).toBe(false);
    expect(upRes.leadSignal).toBe('aligned');

    const flat = Array.from({ length: 65 }, (_, i) => 4.3 + Math.sin(i / 4) * 0.004);
    const flatRes = analyzeUs3mMomentum(buildDateSeries(flat), 0);
    expect(flatRes.status).toBe('neutral');
    expect(flatRes.isTurning).toBe(false);
  });

  it('fires macro regime leading alerts when 3M yield momentum turns up or down', () => {
    const base = buildBaseMacro();
    const upVals = [
      ...Array.from({ length: 55 }, (_, i) => 4.8 - i * 0.015),
      4.02,
      4.08,
      4.16,
      4.25,
      4.34,
      4.43,
    ];
    const upMom = analyzeUs3mMomentum(buildDateSeries(upVals), -5);
    const regimeUp = evaluateMacroRegime({
      ...base,
      us3m: {
        yieldPercent: 4.43,
        change1dBps: 9,
        change1wBps: 27,
        change1mBps: 30,
        change3mBps: -20,
        spread10y3mPercent: -0.08,
        spread10y3mBps: -8,
        curveStatus: 'inverted',
        date: '2026-11-24',
        history: buildDateSeries(upVals),
        momentum: upMom,
      },
    });

    expect(regimeUp.alerts.some((a) => a.includes('Zins-Frühsignal (3M)') && a.includes('aufwärts'))).toBe(
      true,
    );

    const downVals = [
      ...Array.from({ length: 55 }, (_, i) => 3.8 + i * 0.015),
      4.56,
      4.48,
      4.39,
      4.3,
      4.21,
      4.12,
    ];
    const downMom = analyzeUs3mMomentum(buildDateSeries(downVals), 8);
    const regimeDown = evaluateMacroRegime({
      ...base,
      us3m: {
        yieldPercent: 4.12,
        change1dBps: -9,
        change1wBps: -27,
        change1mBps: -30,
        change3mBps: 15,
        spread10y3mPercent: 0.23,
        spread10y3mBps: 23,
        curveStatus: 'flat',
        date: '2026-11-24',
        history: buildDateSeries(downVals),
        momentum: downMom,
      },
    });

    expect(regimeDown.alerts.some((a) => a.includes('Zins-Frühsignal (3M)') && a.includes('abwärts'))).toBe(
      true,
    );
  });
});

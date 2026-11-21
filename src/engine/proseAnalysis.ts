import type { MacroOverview, QuoteSummary, Timeframe } from '../../shared/types.ts';
import type { FullAssetAnalysis, MacroRegimeEvaluation } from './signals.ts';

export interface ProseConclusion {
  type: 'bias' | 'opportunity' | 'risk' | 'trigger';
  title: string;
  text: string;
}

export interface ProseParagraph {
  heading: string;
  body: string;
}

export interface ProseReport {
  headline: string;
  subheadline: string;
  badgeLabel: string;
  score: number;
  compactSummary: string;
  paragraphs: ProseParagraph[];
  conclusions: ProseConclusion[];
  markdown: string;
  generatedAt: string;
}

export interface AssetQuickSummary {
  assetId: string;
  name: string;
  price: number;
  changePercent: number;
  confluence: number;
  bias: string;
}

const fmtNum = (val: number, decimals = 2) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);

const fmtSigned = (val: number, decimals = 2, suffix = '') => {
  const prefix = val > 0 ? '+' : '';
  return `${prefix}${fmtNum(val, decimals)}${suffix}`;
};

function timeframeLabel(tf: Timeframe): string {
  switch (tf) {
    case '15m':
      return '15-Minuten-Chart';
    case '1h':
      return '1-Stunden-Chart';
    case '4h':
      return '4-Stunden-Chart';
    case '1d':
      return 'Tageschart (1D)';
    case '1w':
      return 'Wochenchart (1W)';
  }
}

export function generateMacroProseReport(
  macro: MacroOverview,
  regime: MacroRegimeEvaluation,
  assetSummaries: AssetQuickSummary[] = [],
): ProseReport {
  const nl = macro.netLiquidity;
  const m2 = macro.m2;
  const y10 = macro.us10y;
  const cs = macro.creditSpreads;
  const dxy = macro.dxy;

  const nlDirectionText =
    nl.delta4wB > 25
      ? 'spürbar expansiv und liefert Risikoanlagen Rückenwind'
      : nl.delta4wB < -25
        ? 'restriktiv und entzieht den Märkten spürbar Überschussliquidität'
        : 'weitgehend stabil ohne akuten Liquiditätsschock';

  const largestDrain =
    nl.tgaB > nl.rrpB
      ? `das US-Finanzministerium über das Treasury General Account (TGA: ${fmtNum(nl.tgaB, 0)} Mrd. USD)`
      : `die Overnight Reverse Repo Fazilität (ON RRP: ${fmtNum(nl.rrpB, 1)} Mrd. USD)`;

  const m2Interpretation =
    m2.status === 'expanding'
      ? `Die US-Geldmenge M2 wächst wieder (${fmtSigned(m2.yoyPercent, 1, ' %')} YoY, 3M-annualisiert ${fmtSigned(
          m2.threeMonthAnnualizedPercent,
          1,
          ' %',
        )}), was mittelfristig insbesondere knappe Sachwerte wie Gold und Silber stützt.`
      : m2.status === 'contracting'
        ? `Die US-Geldmenge M2 schrumpft (${fmtSigned(m2.yoyPercent, 1, ' %')} YoY), was auf anhaltend straffe monetäre Rahmenbedingungen hinweist.`
        : `Die US-Geldmenge M2 bewegt sich seitwärts (${fmtSigned(m2.yoyPercent, 1, ' %')} YoY) und liefert derzeit weder starken Inflations- noch Deflationsimpuls.`;

  const creditText =
    cs.regime === 'risk-on'
      ? `Am Kreditmarkt herrscht hohe Risikobereitschaft: Die High-Yield-Spreads (HY OAS) notieren bei ruhigen ${cs.hyOasBps} bps (${cs.percentile5y}. Perzentil der letzten 5 Jahre) und signalisieren keine akute Ausfallangst.`
      : cs.regime === 'stress'
        ? `Warnsignal vom Kreditmarkt: Die High-Yield-Spreads sind auf erhöhte ${cs.hyOasBps} bps (${cs.percentile5y}. Perzentil) geklettert, was auf wachsende Refinanzierungsrisiken und Risk-Off-Druck hindeutet.`
        : `Die High-Yield Credit Spreads liegen bei ${cs.hyOasBps} bps (${cs.percentile5y}. Perzentil, 1M: ${fmtSigned(
            cs.change1mBps,
            0,
            ' bps',
          )}) in einer neutral-wachsamen Zone.`;

  const curveText =
    y10.spread2s10sBps !== null
      ? y10.spread2s10sBps < 0
        ? `Die Zinsstrukturkurve (2s10s) bleibt mit ${y10.spread2s10sBps} bps invertiert und mahnt konjunkturell zur Vorsicht.`
        : `Der 2s10s-Spread notiert bei ${fmtSigned(y10.spread2s10sBps, 0, ' bps')} (${
            y10.curveStatus === 'flat' ? 'flach' : 'positiv normalisiert'
          }).`
      : '';

  const dxyText =
    dxy.trend === 'bullish'
      ? `Der US-Dollar-Index (DXY) zeigt bei ${fmtNum(dxy.quote.price, 2)} Punkten einen intakten Aufwärtstrend${
          dxy.sma50 ? ` über dem SMA 50 (${fmtNum(dxy.sma50, 2)})` : ''
        } und wirkt als Gegenwind für Edelmetalle.`
      : dxy.trend === 'bearish'
        ? `Der US-Dollar-Index (DXY) schwächelt bei ${fmtNum(dxy.quote.price, 2)} Punkten und schafft damit konstruktiven Rückenwind für Gold, Silber und globale Liquidität.`
        : `Der US-Dollar-Index (DXY) konsolidiert bei ${fmtNum(dxy.quote.price, 2)} Punkten (${fmtSigned(
            dxy.quote.changePercent,
            2,
            ' %',
          )} heute) ohne klare Trenddominanz.`;

  const sortedAssets = [...assetSummaries].sort((a, b) => b.confluence - a.confluence);
  const strongest = sortedAssets[0];
  const weakest = sortedAssets[sortedAssets.length - 1];

  const crossAssetBody =
    assetSummaries.length > 0
      ? `Im aktuellen Makro-Umfeld („${regime.regimeLabel}“, Score ${fmtSigned(
          regime.score,
          0,
        )}) ergibt sich eine klare Differenzierung über die beobachteten Kernmärkte: Technisch und makroökonomisch am stärksten präsentiert sich derzeit ${
          strongest.name
        } (Confluence-Score ${fmtSigned(strongest.confluence, 0)} / „${strongest.bias}“), während ${
          weakest.name
        } (Score ${fmtSigned(weakest.confluence, 0)}) die relativ geringste Überzeugungskraft zeigt. Gold und Silber reagieren aktuell vor allem auf die Kombination aus DXY-Richtung und 10-Jahres-Renditen, während S&P 500 und Nasdaq 100 primär am Netto-Liquiditätstrend und der Entwicklung der Kredit-Spreads hängen.`
      : `Die Kombination aus ${fmtNum(nl.currentT, 2)} Bio. USD Netto-Liquidität, ${fmtNum(
          y10.yieldPercent,
          2,
        )} % bei den 10-jährigen US-Renditen und ${cs.hyOasBps} bps High-Yield-Spreads definiert den übergeordneten Risikoappetit für Aktien und Edelmetalle.`;

  const compactSummary = `Das Makro-Gesamtbild signalisiert aktuell das Regime „${regime.regimeLabel}“ (Score ${fmtSigned(
    regime.score,
    0,
  )}/100). Die US-Marktliquidität (Fed Net Liquidity) liegt bei ${fmtNum(
    nl.currentT,
    2,
  )} Bio. USD (4-Wochen-Impuls: ${fmtSigned(nl.delta4wB, 0, ' Mrd. USD')}) und verhält sich damit ${nlDirectionText}. Die 10-jährigen US-Renditen notieren bei ${fmtNum(
    y10.yieldPercent,
    2,
  )} %, während die Credit Spreads (${cs.hyOasBps} bps) ${
    cs.regime === 'risk-on'
      ? 'weiterhin stabile Finanzierungsbedingungen bestätigen.'
      : cs.regime === 'stress'
        ? 'erhöhten Stress am Anleihemarkt anzeigen.'
        : 'ein abwartendes Niveau widerspiegeln.'
  }`;

  const paragraphs: ProseParagraph[] = [
    {
      heading: '1. Liquidität & Geldmenge (Fed Net Liquidity & M2)',
      body: `Die bereinigte US-Netto-Liquidität beläuft sich aktuell auf ${fmtNum(
        nl.currentB,
        0,
      )} Mrd. USD (${fmtNum(nl.currentT, 2)} Bio. USD). Auf Sicht von 4 Wochen veränderte sie sich um ${fmtSigned(
        nl.delta4wB,
        0,
        ' Mrd. USD',
      )} (${fmtSigned(nl.delta4wPercent, 2, ' %')}) und über 13 Wochen um ${fmtSigned(
        nl.delta13wB,
        0,
        ' Mrd. USD',
      )}. Ausgehend von der Fed-Bilanzsumme (${fmtNum(
        nl.fedAssetsB,
        0,
      )} Mrd. USD) bindet aktuell vor allem ${largestDrain} Liquidität aus dem Bankensystem. ${m2Interpretation}`,
    },
    {
      heading: '2. Zinsen, US-Dollar & Kreditrisiko',
      body: `Die Rendite 10-jähriger US-Staatsanleihen notiert bei ${fmtNum(
        y10.yieldPercent,
        3,
      )} % (1-Monats-Veränderung: ${fmtSigned(y10.change1mBps, 0, ' bps')}). ${curveText} ${dxyText} ${creditText}`,
    },
    {
      heading: '3. Cross-Asset-Einordnung (Gold, Silber, S&P 500, Nasdaq 100)',
      body: crossAssetBody,
    },
  ];

  const conclusions: ProseConclusion[] = [
    {
      type: 'bias',
      title: `Makro-Gesamturteil: ${regime.regimeLabel}`,
      text:
        regime.regime === 'expansion'
          ? 'Liquidität und Kreditmärkte tragen konstruktive Risiko-Allokationen; Rücksetzer in trendstarken Assets bieten eher Einstiegschancen als strukturelle Trendbrüche.'
          : regime.regime === 'risk-off'
            ? 'Vorsicht geboten: Restriktive Liquidität oder anziehende Spreads sprechen für strafferes Risikomanagement, höhere Cash-/Qualitätsquoten und selektive Absicherung.'
            : 'Übergangs- und Rotationsphase: Weder breite Liquiditätspanik noch ungebremste Expansion — Einzelasset-Charttechnik und Schlüsselmarken entscheiden über das Timing.',
    },
    {
      type: 'opportunity',
      title: 'Relativer Rückenwind',
      text:
        dxy.trend === 'bearish' || m2.status === 'expanding'
          ? 'Schwächerer/gedeckelter USD und wachsendes M2 begünstigen tendenziell Edelmetalle (Gold/Silber) sowie Qualitätswachstum bei stabilen Realzinsen.'
          : 'Solange Credit Spreads unter 380–400 bps verbleiben, bleibt das Grundvertrauen für Aktienindizes (S&P 500 / Nasdaq 100) intakt.',
    },
    {
      type: 'risk',
      title: 'Zentrale Makro-Risiken',
      text: `Ein Ausbruch der 10J-Renditen um weitere +25 bps oder ein Ausweiten der HY Credit Spreads über ${
        cs.hyOasBps < 400 ? '400 bps' : '500 bps'
      } würde Bewertungsmultiplikatoren im Nasdaq 100 spürbar belasten.`,
    },
    {
      type: 'trigger',
      title: 'Wichtige Trigger-Marken für die nächsten Wochen',
      text: `Beobachte die 4W-Netto-Liquidität (${fmtSigned(
        nl.delta4wB,
        0,
        ' Mrd. USD',
      )}) sowie den DXY bei ${fmtNum(dxy.quote.price, 2)} Pkt. — ein Liquiditätsrückgang unter -75 Mrd. USD in 4 Wochen wäre ein klares Warnsignal.`,
    },
  ];

  const headline = `Makro-Briefing: ${regime.regimeLabel}`;
  const subheadline = `Net Liquidity ${fmtNum(nl.currentT, 2)} Bio. $ · HY Spread ${cs.hyOasBps} bps · US10Y ${fmtNum(
    y10.yieldPercent,
    2,
  )} % · DXY ${fmtNum(dxy.quote.price, 2)}`;

  const markdown = [
    `# ${headline}`,
    `*${subheadline}*`,
    '',
    `> **Kurzfassung:** ${compactSummary}`,
    '',
    ...paragraphs.flatMap((p) => [`## ${p.heading}`, p.body, '']),
    '## Wichtigste Schlussfolgerungen',
    ...conclusions.map((c) => `- **${c.title}:** ${c.text}`),
  ].join('\n');

  return {
    headline,
    subheadline,
    badgeLabel: `${regime.regimeLabel} (${fmtSigned(regime.score, 0)})`,
    score: regime.score,
    compactSummary,
    paragraphs,
    conclusions,
    markdown,
    generatedAt: new Date().toISOString(),
  };
}

export function generateAssetProseReport(
  assetName: string,
  timeframe: Timeframe,
  quote: QuoteSummary | undefined,
  analysis: FullAssetAnalysis,
  macroRegime: MacroRegimeEvaluation | null,
): ProseReport {
  const decimals = quote?.decimals ?? 2;
  const price = quote?.price ?? analysis.latestPrice;
  const chgPct = quote?.changePercent ?? 0;
  const tfText = timeframeLabel(timeframe);
  const { latest, fibonacci, elliott, scores } = analysis;

  const maRelations: string[] = [];
  if (latest.ema21 !== null) {
    maRelations.push(
      `${price >= latest.ema21 ? 'über' : 'unter'} der EMA 21 (${fmtNum(latest.ema21, decimals)})`,
    );
  }
  if (latest.sma50 !== null) {
    maRelations.push(
      `${price >= latest.sma50 ? 'über' : 'unter'} dem SMA 50 (${fmtNum(latest.sma50, decimals)})`,
    );
  }
  if (latest.sma200 !== null) {
    maRelations.push(
      `${price >= latest.sma200 ? 'über' : 'unter'} dem SMA 200 (${fmtNum(latest.sma200, decimals)})`,
    );
  }

  const adxText =
    latest.adx !== null
      ? latest.adx >= 25
        ? `Der ADX bestätigt mit ${fmtNum(latest.adx, 1)} Punkten eine ausgeprägte Trendphase.`
        : `Der ADX liegt bei ${fmtNum(latest.adx, 1)} Punkten und deutet auf eine eher trendarme bzw. konsolidierende Marktphase hin.`
      : '';

  const stText =
    latest.supertrendDir !== null && latest.supertrendVal !== null
      ? `Der Supertrend steht auf ${
          latest.supertrendDir === 1 ? 'Bullisch (Unterstützung' : 'Bärisch (Widerstand'
        } bei ${fmtNum(latest.supertrendVal, decimals)}).`
      : '';

  const rsiText =
    latest.rsi !== null
      ? `Der RSI (14) notiert bei ${fmtNum(latest.rsi, 1)} (${
          latest.rsi >= 70
            ? 'überkaufter Extrembereich — Rücksetzerrisiko beachten'
            : latest.rsi <= 30
              ? 'überverkaufter Bereich — Gegenbewegungs-Potenzial'
              : latest.rsi >= 50
                ? 'positives Momentum'
                : 'gedämpftes Momentum'
        }).`
      : '';

  const latestDiv = analysis.rsiDivergences[analysis.rsiDivergences.length - 1];
  const divText = latestDiv
    ? ` Zudem wurde zuletzt eine ${
        latestDiv.type === 'bullish' ? 'bullishe' : 'bärische'
      } RSI-Divergenz registriert.`
    : '';

  const macdText = `Der MACD liegt ${
    latest.macdBullish ? 'positiv über seiner Signallinie' : 'negativ unter seiner Signallinie'
  }${
    latest.macdHist !== null
      ? ` (Histogramm ${latest.macdHist >= 0 ? 'positiv' : 'negativ'})`
      : ''
  }.`;

  let fibElliottBody = '';
  if (fibonacci) {
    fibElliottBody += `Die Auto-Fibonacci-Analyse über den letzten dominanten ${
      fibonacci.direction === 'uptrend' ? 'Aufwärts-Swing' : 'Abwärts-Swing'
    } (${fmtNum(fibonacci.anchorStart.price, decimals)} bis ${fmtNum(
      fibonacci.anchorEnd.price,
      decimals,
    )}) verortet das Golden Pocket (0.618–0.650) zwischen ${fmtNum(
      fibonacci.goldenPocket.low,
      decimals,
    )} und ${fmtNum(fibonacci.goldenPocket.high, decimals)}. Aktuell befindet sich der Kurs: ${
      fibonacci.pricePositionLabel
    }.`;
    if (fibonacci.nearestSupport || fibonacci.nearestResistance) {
      fibElliottBody += ` Nächste Fib-Unterstützung liegt bei ${
        fibonacci.nearestSupport ? fmtNum(fibonacci.nearestSupport.price, decimals) : '—'
      }, nächster Fib-Widerstand bei ${
        fibonacci.nearestResistance ? fmtNum(fibonacci.nearestResistance.price, decimals) : '—'
      }.`;
    }
  }

  if (elliott.primary) {
    const ew = elliott.primary;
    fibElliottBody += ` In der Elliott-Wellen-Auswertung (${ew.degree}) dominiert das Szenario „${
      ew.status
    }“ mit ${ew.confidence} % Regelkonformität: Aktive Phase ist ${
      ew.activeWave
    }, der Zielkorridor spannt sich von ${fmtNum(ew.targetZone.low, decimals)} bis ${fmtNum(
      ew.targetZone.high,
      decimals,
    )} (Invalidierung bei ${fmtNum(ew.invalidationLevel, decimals)}).`;
    if (elliott.alternative) {
      fibElliottBody += ` Als Alternativzählung bleibt „${elliott.alternative.status}“ (${elliott.alternative.confidence} % Konfidenz) aktiv auf dem Radar.`;
    }
  } else {
    fibElliottBody +=
      ' Für eine eindeutige Elliott-Wellen-Zählung auf diesem Grad fehlen aktuell ausreichend getrennte Swing-Pivots.';
  }

  const macroBody = macroRegime
    ? `Aus Makro-Sicht ergibt sich für ${assetName} ein Teilscore von ${fmtSigned(
        scores.macro,
        0,
      )}/100 im Regime „${macroRegime.regimeLabel}“. ${
        scores.macro >= 15
          ? 'Geldpolitik, Liquiditätsfluss und/oder Zins-/Dollar-Dynamik liefern derzeit spürbaren Rückenwind.'
          : scores.macro <= -15
            ? 'Gegenläufige Makro-Faktoren (Dollarstärke, Renditedruck oder Liquiditätsentzug) bremsen das Aufwärtspotenzial.'
            : 'Die Makro-Impulse wirken aktuell weitgehend neutral und überlassen der Charttechnik die Führung.'
      }`
    : 'Makro-Daten werden geladen, um den Cross-Asset-Rückenwind präzise einzuordnen.';

  const compactSummary = `${assetName} notiert im ${tfText} bei ${fmtNum(price, decimals)} (${fmtSigned(
    chgPct,
    2,
    ' %',
  )}) und erzielt einen Confluence-Score von ${fmtSigned(scores.confluence, 0)}/100 („${
    scores.bias
  }“). ${
    maRelations.length > 0 ? `Der Kurs handelt ${maRelations.join(', ')}. ` : ''
  }${
    elliott.primary
      ? `Elliott-Fokus: ${elliott.primary.activeWave} (Ziel ${fmtNum(
          elliott.primary.targetZone.low,
          decimals,
        )}–${fmtNum(elliott.primary.targetZone.high, decimals)}, Invalidierung ${fmtNum(
          elliott.primary.invalidationLevel,
          decimals,
        )}).`
      : ''
  }`;

  const paragraphs: ProseParagraph[] = [
    {
      heading: `1. Trend & Marktstruktur (${tfText})`,
      body: `Der Kurs notiert ${
        maRelations.length > 0 ? maRelations.join(' sowie ') : `bei ${fmtNum(price, decimals)}`
      }. ${stText} ${adxText}${
        latest.bollingerSqueeze
          ? ' Zusätzlich zeigen die Bollinger-Bänder einen Volatility Squeeze — eine größere Impulsbewegung steht statistisch bevor.'
          : ''
      }`,
    },
    {
      heading: '2. Momentum & Timing-Indikatoren',
      body: `${rsiText} ${macdText}${divText}`,
    },
    {
      heading: '3. Fibonacci & Elliott-Wellen-Struktur',
      body: fibElliottBody.trim(),
    },
    {
      heading: '4. Makro-Kontext & relative Einordnung',
      body: macroBody,
    },
  ];

  const bullTargetText = elliott.primary
    ? `Bestätigung der Struktur (${elliott.primary.activeWave}) eröffnet Potenzial in Richtung ${fmtNum(
        elliott.primary.targetZone.low,
        decimals,
      )}–${fmtNum(elliott.primary.targetZone.high, decimals)}.`
    : fibonacci?.nearestResistance
      ? `Ein Ausbruch über ${fmtNum(
          fibonacci.nearestResistance.price,
          decimals,
        )} setzt Aufwärtspotenzial frei.`
      : 'Anschlusskäufe über den kurzfristigen gleitenden Durchschnitten stärken das Bullenszenario.';

  const invalidationPrice =
    elliott.primary?.invalidationLevel ??
    fibonacci?.nearestSupport?.price ??
    latest.sma50 ??
    price * 0.97;

  const conclusions: ProseConclusion[] = [
    {
      type: 'bias',
      title: `Gesamt-Bias: ${scores.bias} (${fmtSigned(scores.confluence, 0)}/100)`,
      text: `Trend (${fmtSigned(scores.trend, 0)}) · Momentum (${fmtSigned(
        scores.momentum,
        0,
      )}) · Charttechnik (${fmtSigned(scores.chartTech, 0)}) · Makro (${fmtSigned(scores.macro, 0)}).`,
    },
    {
      type: 'opportunity',
      title: 'Konstruktives Szenario & Zielbereich',
      text: bullTargetText,
    },
    {
      type: 'risk',
      title: 'Invalidierung & Schlüsselunterstützung',
      text: `Das aktuelle Primärszenario wird technisch kritisch bzw. invalidiert bei Bruch der Marke ${fmtNum(
        invalidationPrice,
        decimals,
      )}${
        fibonacci
          ? ` (Golden Pocket Support: ${fmtNum(fibonacci.goldenPocket.low, decimals)}–${fmtNum(
              fibonacci.goldenPocket.high,
              decimals,
            )})`
          : ''
      }.`,
    },
    {
      type: 'trigger',
      title: 'Taktisches Fazit für Anleger',
      text:
        scores.confluence >= 20
          ? 'Konstruktives Setup: Rücksetzer an EMA 21 oder ins Fibonacci Golden Pocket bieten das beste Chance-Risiko-Verhältnis.'
          : scores.confluence <= -20
            ? 'Defensiv bleiben: Erst ein Rückerobern von EMA 21 / Supertrend-Widerstand würde das Chartbild wieder aufhellen.'
            : 'Abwartende Positionierung: Ausbruch aus der aktuellen Range bzw. Bestätigung am Golden Pocket abwarten.',
    },
  ];

  const headline = `${assetName} — Technische & Makro-Analyse`;
  const subheadline = `Kurs ${fmtNum(price, decimals)} (${fmtSigned(chgPct, 2, ' %')}) · ${tfText}`;

  const markdown = [
    `# ${headline}`,
    `*${subheadline}*`,
    '',
    `> **Kurzfassung:** ${compactSummary}`,
    '',
    ...paragraphs.flatMap((p) => [`## ${p.heading}`, p.body, '']),
    '## Wichtigste Schlussfolgerungen',
    ...conclusions.map((c) => `- **${c.title}:** ${c.text}`),
  ].join('\n');

  return {
    headline,
    subheadline,
    badgeLabel: `${scores.bias} (${fmtSigned(scores.confluence, 0)})`,
    score: scores.confluence,
    compactSummary,
    paragraphs,
    conclusions,
    markdown,
    generatedAt: new Date().toISOString(),
  };
}

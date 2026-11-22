import type { AssetClass, MacroOverview, QuoteSummary, Timeframe } from '../../shared/types.ts';
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
  const nlT = fmtNum(nl.currentT, 2);

  // Compact Executive Summary (max 2 crisp sentences)
  const compactSummary =
    regime.regime === 'expansion'
      ? `Frische Marktliquidität (${nlT} Bio. $) und entspannte Kreditmärkte (${cs.hyOasBps} bps) geben Rückenwind. Kapital fließt in Risikoanlagen — Rücksetzer werden tendenziell aufgefangen.`
      : regime.regime === 'risk-off'
        ? `Knapper werdende Liquidität (${nlT} Bio. $) und steigender Kreditstress (${cs.hyOasBps} bps) setzen Risikoanlagen unter Druck. Sicherheit hat aktuell Vorrang vor Renditejagd.`
        : `Gemischtes Bild bei ${nlT} Bio. $ Liquidität und ${cs.hyOasBps} bps Kreditaufschlägen: Weder Panik noch breite Rally — entscheidend ist jetzt selektive Titelauswahl.`;

  // 1. Geldfluss & Liquidität
  const liqFlow =
    nl.delta4wB > 25
      ? `In den letzten vier Wochen flossen +${fmtNum(nl.delta4wB, 0)} Mrd. $ netto ins System zurück.`
      : nl.delta4wB < -25
        ? `In den letzten vier Wochen wurden dem Markt ${fmtNum(Math.abs(nl.delta4wB), 0)} Mrd. $ Liquidität entzogen.`
        : 'Die US-Marktliquidität bewegt sich auf 4-Wochen-Sicht stabil seitwärts.';

  const driverMeaning =
    nl.tgaB > nl.rrpB * 4
      ? 'Hauptbremsklotz bleibt das US-Finanzministerium, das über seine Staatskasse (TGA) Geld bindet.'
      : 'Abflüsse aus dem Geldmarkt (ON RRP) federn die restriktive Fed-Bilanz spürbar ab.';

  const m2Meaning =
    m2.status === 'expanding'
      ? `Parallel wächst die Geldmenge M2 (${fmtSigned(m2.yoyPercent, 1, ' %')} YoY) — ein mittelfristiges Polster für knappe Sachwerte.`
      : m2.status === 'contracting'
        ? 'Die schrumpfende Geldmenge M2 entzieht Spekulationen zusätzlichen Treibstoff.'
        : 'M2 stagniert und liefert weder Inflationsschub noch Deflationsdruck.';

  // 2. Zinsen, Dollar & Risikoappetit
  const ratesEffect =
    y10.yieldPercent >= 4.75
      ? `Hohe 10J-Renditen (${fmtNum(y10.yieldPercent, 2)} %) drücken auf die Bewertung wachstumsstarker Aktien.`
      : y10.change1mBps <= -15
        ? `Nachgebende 10J-Renditen (${fmtNum(y10.yieldPercent, 2)} %) entlasten Aktien und zinsloses Gold.`
        : `Stabile 10J-Renditen (${fmtNum(y10.yieldPercent, 2)} %) wirken aktuell neutral auf die Märkte.`;

  const curveNote =
    y10.spread2s10sBps !== null && y10.spread2s10sBps < 0
      ? ' Die invertierte Zinskurve mahnt konjunkturell jedoch weiter zur Wachsamkeit.'
      : '';

  const creditAndDollar =
    cs.regime === 'risk-on'
      ? `Ruhige Kreditmärkte signalisieren fehlende Rezessionspanik, während ${
          dxy.trend === 'bearish'
            ? 'ein schwächerer Dollar Edelmetalle stützt.'
            : dxy.trend === 'bullish'
              ? 'ein fester Dollar Rohstoffe ausbremst.'
              : 'ein stabiler Dollar kaum Gegenwind erzeugt.'
        }`
      : cs.regime === 'stress'
        ? 'Steigende Ausfallprämien am Anleihemarkt warnen hingegen vor akutem Liquiditätsstress.'
        : `Wachsame Kreditaufschläge und ein ${
            dxy.trend === 'bearish' ? 'weicher' : dxy.trend === 'bullish' ? 'fester' : 'neutraler'
          } Dollar bremsen zu große Risiken.`;

  // 3. Was das für die Märkte bedeutet
  const sortedAssets = [...assetSummaries].sort((a, b) => b.confluence - a.confluence);
  const strongest = sortedAssets[0];
  const weakest = sortedAssets[sortedAssets.length - 1];

  const crossAssetBody =
    assetSummaries.length > 0 && strongest && weakest
      ? `Am stärksten überzeugt aktuell ${strongest.name} (${strongest.bias}), während ${weakest.name} im Vergleich hinterherhinkt. Solange Kreditzinsen ruhig bleiben, bestimmen vor allem Dollar-Richtung und Netto-Liquidität die relative Stärke zwischen Edelmetallen, Aktien und Krypto.`
      : 'Solange Kreditzinsen ruhig bleiben, bestimmen Dollar-Richtung und Netto-Liquidität die Rotation zwischen Edelmetallen, Aktien und Krypto.';

  const paragraphs: ProseParagraph[] = [
    {
      heading: '1. Geldfluss & Liquidität',
      body: `${liqFlow} ${driverMeaning} ${m2Meaning}`,
    },
    {
      heading: '2. Zinsen, Dollar & Risikoappetit',
      body: `${ratesEffect}${curveNote} ${creditAndDollar}`,
    },
    {
      heading: '3. Was das für die Märkte bedeutet',
      body: crossAssetBody,
    },
  ];

  const conclusions: ProseConclusion[] = [
    {
      type: 'bias',
      title: 'Grundtendenz',
      text:
        regime.regime === 'expansion'
          ? 'Konstruktives Umfeld — Liquidität trägt Aufwärtstrends, Rücksetzer bleiben tendenziell Kaufchancen.'
          : regime.regime === 'risk-off'
            ? 'Vorsicht geboten — Kapitalerhalt, geringere Positionsgrößen und Qualität haben Vorrang.'
            : 'Rotationsphase — breiter Rückenwind fehlt, daher selektiv auf trendstarke Einzelwerte setzen.',
    },
    {
      type: 'opportunity',
      title: 'Rückenwind',
      text:
        dxy.trend === 'bearish' || m2.status === 'expanding'
          ? 'Nachlassender Dollar-Druck und wachsendes M2 spielen vor allem Gold, Silber und liquiditätsnahen Assets in die Karten.'
          : 'Stabile Kreditmärkte stützen führende Qualitätsaktien und große Indizes bei kontrolliertem Risiko.',
    },
    {
      type: 'risk',
      title: 'Hauptrisiko',
      text: `Ein Sprung der Kreditaufschläge über ${
        cs.hyOasBps < 400 ? '400 bps' : '500 bps'
      } oder schnell steigende Anleiherenditen würden Tech-Aktien und Krypto direkt belasten.`,
    },
    {
      type: 'trigger',
      title: 'Worauf achten',
      text: `Kippt die 4-Wochen-Liquidität unter -75 Mrd. $ oder bricht der DXY klar über ${fmtNum(
        dxy.sma50 ?? dxy.quote.price + 1.5,
        2,
      )}, droht Gegenwind.`,
    },
  ];

  const headline = `Makro-Briefing: ${regime.regimeLabel}`;
  const subheadline = `Liquidität ${nlT} Bio. $ · Spreads ${cs.hyOasBps} bps · US10Y ${fmtNum(
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

function explainMacroConnection(
  assetClass: AssetClass,
  macroScore: number,
  macroRegime: MacroRegimeEvaluation | null,
): string {
  if (!macroRegime) {
    return 'Makro-Daten werden geladen, um den äußeren Rücken- oder Gegenwind einzuordnen.';
  }

  const classDriver: Record<AssetClass, string> = {
    precious_metals: 'Edelmetalle hängen stark an Dollar-Richtung, Realzinsen und Geldmengenwachstum',
    commodities: 'Rohstoffe reagieren sensibel auf Dollarstärke und globale Liquiditätszyklen',
    crypto: 'Krypto reagiert besonders direkt auf frische Netto-Liquidität und Risikoappetit',
    bonds: 'Langlaufende Anleihen profitieren von sinkenden Renditen und ruhigen Kreditmärkten',
    forex: 'Währungspaare spiegeln primär die relative Zins- und Dollar-Dynamik wider',
    equities: 'Einzelaktien folgen dem Zusammenspiel aus Marktliquidität, Zinsniveau und Kreditvertrauen',
    etf: 'Dieser Titel folgt dem Zusammenspiel aus Marktliquidität und Zinsniveau',
    indices: 'Aktienindizes werden von Netto-Liquidität und stabilen Kreditmärkten getragen',
  };

  const driver = classDriver[assetClass] ?? classDriver.equities;

  if (macroScore >= 15) {
    return `${driver} — das aktuelle Umfeld liefert spürbaren Rückenwind.`;
  }
  if (macroScore <= -15) {
    return `${driver} — genau von dort kommt derzeit Gegenwind, der Aufwärtsbewegungen bremst.`;
  }
  return `${driver} — aktuell wirken diese Faktoren neutral, die Charttechnik gibt den Takt vor.`;
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
  const { latest, fibonacci, elliott, scores, assetClass } = analysis;

  const techBull = scores.trend >= 15;
  const techBear = scores.trend <= -15;
  const macroBull = scores.macro >= 15;
  const macroBear = scores.macro <= -15;

  // Compact Summary: price + interplay between chart & macro
  let compactSummary: string;
  if (techBull && macroBull) {
    compactSummary = `${assetName} liegt im ${tfText} klar auf Kurs: Charttrend und Makro-Umfeld ziehen am selben Strang. Rücksetzer treffen bisher auf aktive Käufer.`;
  } else if (techBull && macroBear) {
    compactSummary = `${assetName} zeigt im ${tfText} zwar Aufwärtsstärke, stößt aber auf Makro-Gegenwind. Steile Bewegungen bleiben daher anfällig für Gewinnmitnahmen.`;
  } else if (techBear && macroBull) {
    compactSummary = `${assetName} schwächelt im Chart noch, erhält vom Makro-Umfeld aber bereits Rückenwind. Erste Stabilisierungszeichen verdienen Aufmerksamkeit.`;
  } else if (techBear && macroBear) {
    compactSummary = `${assetName} steht unter doppeltem Druck: Sowohl Chartstruktur als auch Makro-Lage bremsen derzeit. Vorsicht geht vor voreiligen Käufen.`;
  } else {
    compactSummary = `${assetName} sucht im ${tfText} nach Richtung — Käufer und Verkäufer halten sich die Waage. Erst ein Ausbruch über Schlüsselmarken bringt Klarheit.`;
  }

  // 1. Trend & Marktdynamik (meaning over raw parameter dumps)
  const aboveAllMa =
    (latest.ema21 === null || price >= latest.ema21) &&
    (latest.sma50 === null || price >= latest.sma50) &&
    (latest.sma200 === null || price >= latest.sma200);
  const belowAllMa =
    (latest.ema21 === null || price <= latest.ema21) &&
    (latest.sma50 === null || price <= latest.sma50) &&
    (latest.sma200 === null || price <= latest.sma200);

  let trendSentence: string;
  if (aboveAllMa && latest.supertrendDir === 1) {
    trendSentence = 'Käufer kontrollieren das Bild über allen wichtigen Trendlinien hinweg.';
  } else if (belowAllMa && latest.supertrendDir === -1) {
    trendSentence = 'Verkäufer geben den Takt vor; wichtige Durchschnittslinien wirken als Deckel.';
  } else if (techBull) {
    trendSentence = 'Der übergeordnete Trend zeigt nach oben, einzelne Durchschnittslinien wurden bereits zurückerobert.';
  } else if (techBear) {
    trendSentence = 'Der Abwärtsdruck überwiegt, Erholungen laufen bislang gegen fallende Widerstände.';
  } else {
    trendSentence = 'Der Kurs pendelt ohne klaren Sieger zwischen Unterstützung und Widerstand.';
  }

  const extras: string[] = [];
  if (latest.adx !== null && latest.adx < 20) {
    extras.push('die Trendstärke ist allerdings noch gering (Seitwärtsphase)');
  }
  if (latest.rsi !== null && latest.rsi >= 72) {
    extras.push('kurzfristig heiß gelaufen — kleine Verschnaufpause wäre gesund');
  } else if (latest.rsi !== null && latest.rsi <= 28) {
    extras.push('stark überverkauft — Gegenbewegung jederzeit möglich');
  } else if (latest.macdBullish && scores.momentum > 0) {
    extras.push('das Momentum unterstützt die Bewegung');
  } else if (!latest.macdBullish && scores.momentum < 0) {
    extras.push('die Dynamik lässt spürbar nach');
  }

  const latestDiv = analysis.rsiDivergences[analysis.rsiDivergences.length - 1];
  const divNote = latestDiv
    ? latestDiv.type === 'bullish'
      ? ' Eine bullishe Divergenz deutet auf nachlassenden Verkaufsdruck hin.'
      : ' Eine bärische Divergenz warnt vor schwindender Kaufkraft.'
    : latest.bollingerSqueeze
      ? ' Verengte Bänder kündigen zudem einen größeren Ausbruch an.'
      : '';

  const dynamicBody = `${trendSentence}${
    extras.length > 0 ? ` Dabei gilt: ${extras.join(', ')}.` : ''
  }${divNote}`;

  // 2. Wichtige Marken & Szenario
  const supportPrice =
    fibonacci?.nearestSupport?.price ?? latest.ema21 ?? latest.sma50 ?? price * 0.96;
  const resistancePrice =
    fibonacci?.nearestResistance?.price ?? elliott.primary?.targetZone.high ?? price * 1.04;
  const invalidationPrice =
    elliott.primary?.invalidationLevel ??
    fibonacci?.nearestSupport?.price ??
    latest.sma50 ??
    price * 0.96;

  let zoneSentence = fibonacci?.inGoldenPocket
    ? `Der Kurs testet aktuell die zentrale Entscheidungszone (${fmtNum(
        fibonacci.goldenPocket.low,
        decimals,
      )}–${fmtNum(fibonacci.goldenPocket.high, decimals)}) — hier zeigt sich oft, ob der Haupttrend hält.`
    : `Wichtige Unterstützung liegt bei ${fmtNum(
        supportPrice,
        decimals,
      )}, erster Widerstand wartet um ${fmtNum(resistancePrice, decimals)}.`;

  if (elliott.primary) {
    const ew = elliott.primary;
    zoneSentence += ` Die Wellenstruktur (${ew.activeWave}) zielt auf ${fmtNum(
      ew.targetZone.low,
      decimals,
    )}–${fmtNum(ew.targetZone.high, decimals)}, solange ${fmtNum(
      ew.invalidationLevel,
      decimals,
    )} nicht bricht.`;
  }

  // 3. Einfluss des Makro-Umfelds
  const macroBody = explainMacroConnection(assetClass, scores.macro, macroRegime);

  const paragraphs: ProseParagraph[] = [
    {
      heading: '1. Trend & Marktdynamik',
      body: dynamicBody,
    },
    {
      heading: '2. Wichtige Marken & Szenario',
      body: zoneSentence,
    },
    {
      heading: '3. Einfluss des Makro-Umfelds',
      body: macroBody,
    },
  ];

  const targetLow = elliott.primary?.targetZone.low ?? resistancePrice;
  const targetHigh = elliott.primary?.targetZone.high ?? resistancePrice * 1.02;

  const conclusions: ProseConclusion[] = [
    {
      type: 'bias',
      title: `Auf einen Blick: ${scores.bias}`,
      text: `${
        techBull ? 'Aufwärtstrend intakt' : techBear ? 'Abwärtsdruck aktiv' : 'Richtungsfindung läuft'
      }; das Makro-Umfeld wirkt ${
        macroBull ? 'unterstützend' : macroBear ? 'bremsend' : 'weitgehend neutral'
      }.`,
    },
    {
      type: 'opportunity',
      title: 'Chance',
      text: elliott.primary
        ? `Hält die Struktur, liegt der nächste Zielbereich zwischen ${fmtNum(
            targetLow,
            decimals,
          )} und ${fmtNum(targetHigh, decimals)}.`
        : `Ein Ausbruch über ${fmtNum(resistancePrice, decimals)} eröffnet frisches Aufwärtspotenzial.`,
    },
    {
      type: 'risk',
      title: 'Kipppunkt',
      text: `Fällt der Kurs nachhaltig unter ${fmtNum(
        invalidationPrice,
        decimals,
      )}, ist das aktuelle Szenario hinfällig.`,
    },
    {
      type: 'trigger',
      title: 'Fazit',
      text:
        scores.confluence >= 20
          ? 'Rücksetzer an die nächste Unterstützung bieten das sauberste Chance-Risiko-Verhältnis.'
          : scores.confluence <= -20
            ? 'Defensiv bleiben, bis Käufer die kurzfristigen Trendmarken zurückerobern.'
            : 'Abwarten, bis der Ausbruch aus der aktuellen Spanne Klarheit schafft.',
    },
  ];

  const headline = `${assetName} — Marktanalyse`;
  const subheadline = `${fmtNum(price, decimals)} (${fmtSigned(chgPct, 2, ' %')}) · ${tfText}`;

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

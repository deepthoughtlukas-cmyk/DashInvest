# DashInvest — Markt-, Charttechnik- & Makro-Analyse Dashboard

**DashInvest** ist eine modulare Full-Stack-Webanwendung (React 19, TypeScript, TradingView Lightweight Charts v5, React-Grid-Layout v2, Tailwind CSS v4 & Node/Express-Proxy) für technische Chartanalyse, Makro-Liquiditätsüberwachung, regelbasierte Signale und verständlich ausformulierte Marktanalysen in Prosa.

---

## Kernfunktionen

### 1. Fortschrittliches Chart-Terminal (`src/components/chart/`)
- **Abgedeckte Kernmärkte:** Gold (`GC=F`), Silber (`SI=F`), S&P 500 (`^GSPC`), Nasdaq 100 (`^NDX`)
- **Timeframes & Charttypen:** `15m`, `1H`, `4H`, `1D`, `1W` · Kerzen, Heikin-Ashi, Linie · Linear-/Log-Skala · Vollbild-Modus
- **Fibonacci-Engine:** Automatische Swing-Erkennung (Retracements, hervorgehobenes Golden Pocket `0.618–0.650`, Extensions `1.272 / 1.618 / 2.618`) sowie **manuelles Zwei-Punkt-Zeichentool** direkt auf dem Chart
- **Regelkonforme Elliott-Wellen-Analyse:** ATR-adaptiver ZigZag (`Minor`, `Intermediate`, `Primary`) mit strikter Durchsetzung der 3 Elliott-Kernregeln (W2-Retracement, W3 nicht kürzeste Impulswelle, keine W4/W1-Überschneidung), Invalidierungslinie, Zielkorridor, Konfidenz-Score und Alternativzählung
- **Gleitende Durchschnitte & Trend-/Momentum-Indikatoren:** EMA 21, SMA 50, SMA 200, VWAP, Supertrend, Bollinger Bänder (inkl. Squeeze), Ichimoku Cloud, Golden/Death Crosses sowie Multi-Pane-Subcharts für **Volumen**, **RSI (14) inkl. Divergenzen**, **MACD** und **ADX / DI+ / DI−**

### 2. Flexibles Widget-Grid & Makro-Indikatoren (`src/components/widgets/`)
Frei verschieb- und skalierbare Widgets (`react-grid-layout`) mit 3 Presets (*Analyse-Fokus*, *2×2 Multi-Chart*, *Makro-Cockpit*), `+ Widgets`-Katalog-Drawer, Layout-Sperre und `localStorage`-Persistenz:
- **US-Marktliquidität (Fed Net Liquidity):** Berechnung aus `WALCL` (Fed-Bilanz, Mio. → Mrd. USD), `WTREGEN` (TGA, Mio. → Mrd. USD) und `RRPONTSYD` (ON RRP, Mrd. USD) inkl. 4W/13W-Impuls und normalisiertem Vergleichs-Overlay gegen S&P 500 oder Gold:
  $$\text{Net Liquidity (Mrd. USD)} = \frac{\text{WALCL}}{1{.}000} - \frac{\text{WTREGEN}}{1{.}000} - \text{RRPONTSYD}$$
- **US-Dollar-Index (`DXY`):** Live-Kurs, 1T/1W/YTD-Performance, SMA 50/200 Trendstatus
- **US-Geldmenge `M2` (`M2SL`):** Stand in Bio. USD, YoY-Wachstum & 3M-annualisierte Dynamik
- **10J US-Anleiherenditen (`^TNX` / `DGS10`):** Live-Rendite, bps-Veränderung und `2s10s`-Spread (`T10Y2Y`)
- **Credit Spreads (`BAMLH0A0HYM2`):** US High-Yield OAS in `bps`, 5-Jahres-Perzentil & Risk-On/Neutral/Stress-Ampel
- **Confluence-Matrix & Signal-Feed:** Gewichteter Gesamtscore (`-100` bis `+100`) und aktive Chart-/Makrosignale
- **Markt- & Makro-Briefing (Prosa):** Automatisch generierte deutsche Profi-Analyse inkl. *Wichtigste Schlussfolgerungen*, *Kompakt/Ausführlich*-Modus, Markdown-Export und Vollbild-Lesemodus

---

## Datenquellen & Konfiguration

DashInvest startet **ohne Pflicht-API-Keys** über serverseitig geproxiedte Yahoo-Finance- und öffentliche FRED-CSV-Endpunkte (`fredgraph.csv`). Optionale API-Key-Slots befinden sich in [`.env.example`](.env.example).

---

## Lokaler Start & Entwicklung

```bash
npm install
npm run dev
```

- Frontend (Vite): `http://localhost:5173`
- API-Proxy (Express): `http://localhost:3001`

---

## Tests & Build

```bash
# Unit-, Provider-, Store- & API-Integrationstests (Vitest)
npm test

# End-to-End Browser-Tests in Google Chrome (Playwright)
npm run test:e2e

# Komplette Test-Suite (Vitest + Playwright)
npm run test:all

# TypeScript-Check & Produktions-Build
npm run build
```

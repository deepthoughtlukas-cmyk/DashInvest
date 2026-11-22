# DashInvest — Markt-, Charttechnik- & Makro-Analyse Dashboard

**DashInvest** ist eine modulare Full-Stack-Webanwendung (React 19, TypeScript, TradingView Lightweight Charts v5, React-Grid-Layout v2, Tailwind CSS v4 & Node/Express-Proxy) für technische Chartanalyse, Makro-Liquiditätsüberwachung, regelbasierte Signale und verständlich ausformulierte Marktanalysen in Prosa.

---

## Kernfunktionen

### 1. Erweiterbarer Wertpapier-Katalog, Ordnerstruktur & Chart-Terminal (`src/components/chart/` & `src/components/widgets/CatalogExplorerWidget.tsx`)
- **Starter-Katalog mit 35+ Werten in hierarchischen Ordnern & Unterordnern:** Rohstoffe & Edelmetalle (Gold, Silber, Platin, Palladium, Öl, Erdgas, Kupfer), Aktienindizes (S&P 500, Nasdaq 100, DAX 40, EuroStoxx 50, Nikkei 225 u. a.), Einzelaktien & Tech (NVIDIA, Apple, Microsoft, SAP, Siemens, ASML u. a.), Krypto (Bitcoin, Ethereum, Solana) sowie Devisen & Anleihen (`EUR/USD`, `TLT`, `HYG`)
- **Globale Live-Tickersuche:** Beliebige weltweite Aktien, ETFs, Indizes, Rohstoffe oder Kryptowährungen per Yahoo-Finance-Suche direkt in jeden Ordner hinzufügen
- **Ordner- & Bookmark-Verwaltung:** Eigene Haupt- und Unterordner anlegen, umbenennen, ein-/ausklappen, Werte zwischen Ordnern verschieben, Favoriten mit ⭐ bookmarken (erscheinen automatisch als Schnellzugriff-Tabs im Master-Chart und in der Signal-Matrix)
- **Timeframes & Charttypen:** `15m`, `1H`, `4H`, `1D`, `1W` · Kerzen, Heikin-Ashi, Linie · Linear-/Log-Skala · Vollbild-Modus
- **Einklappbare Fundamentaldaten-Sidebar im Master-Chart:** Aktuelle Dividendenrendite, 10J-Dividendenhistorie (inkl. CAGR & Kontinuität), KGV, Forward KGV, KBV, KUV, PEG, Gewinn- & Umsatzwachstum, ROE/Margen, Free Cashflow sowie Analysten-Konsens inkl. Kursziel-Korridor (`/api/market/fundamentals`)
- **Fibonacci-Engine:** Automatische Swing-Erkennung (Retracements, hervorgehobenes Golden Pocket `0.618–0.650`, Extensions `1.272 / 1.618 / 2.618`) sowie **manuelles Zwei-Punkt-Zeichentool** direkt auf dem Chart
- **Regelkonforme Elliott-Wellen-Analyse:** ATR-adaptiver ZigZag (`Minor`, `Intermediate`, `Primary`) mit strikter Durchsetzung der 3 Elliott-Kernregeln (W2-Retracement, W3 nicht kürzeste Impulswelle, keine W4/W1-Überschneidung), Invalidierungslinie, Zielkorridor, Konfidenz-Score und Alternativzählung
- **Gleitende Durchschnitte & Trend-/Momentum-Indikatoren:** EMA 21, SMA 50, SMA 200, VWAP, Supertrend, Bollinger Bänder (inkl. Squeeze), Ichimoku Cloud, Golden/Death Crosses sowie Multi-Pane-Subcharts für **Volumen**, **RSI (14) inkl. Divergenzen**, **MACD** und **ADX / DI+ / DI−**

### 2. Flexibles Widget-Grid & Makro-Indikatoren (`src/components/widgets/`)
Frei verschieb- und skalierbare Widgets (`react-grid-layout`) mit 3 Presets (*Analyse-Fokus*, *2×2 Multi-Chart*, *Makro-Cockpit*), `+ Widgets`-Katalog-Drawer, Layout-Sperre, `localStorage`-Persistenz sowie **optionalem normalisiertem S&P-500- & Gold-Vergleichsoverlay in allen 5 Makro-Widgets**:
- **US-Marktliquidität (Fed Net Liquidity):** Berechnung aus `WALCL` (Fed-Bilanz, Mio. → Mrd. USD), `WTREGEN` (TGA, Mio. → Mrd. USD) und `RRPONTSYD` (ON RRP, Mrd. USD) inkl. 4W/13W-Impuls:
  $$\text{Net Liquidity (Mrd. USD)} = \frac{\text{WALCL}}{1{.}000} - \frac{\text{WTREGEN}}{1{.}000} - \text{RRPONTSYD}$$
- **US-Dollar-Index (`DXY`):** Live-Kurs, 1T/1W/YTD-Performance, SMA 50/200 Trendstatus
- **US-Geldmenge `M2` (`M2SL`):** Stand in Bio. USD, YoY-Wachstum & 3M-annualisierte Dynamik
- **10J US-Anleiherenditen (`^TNX` / `DGS10`):** Live-Rendite, bps-Veränderung und `2s10s`-Spread (`T10Y2Y`)
- **Credit Spreads (`BAMLH0A0HYM2`):** US High-Yield OAS in `bps`, 5-Jahres-Perzentil & Risk-On/Neutral/Stress-Ampel
- **Confluence-Matrix & Signal-Feed:** Gewichteter Gesamtscore (`-100` bis `+100`) und aktive Chart-/Makrosignale
- **Bookmark-Signale (7 Tage):** Eigenständiges Widget mit allen ausgelösten Trend-, Momentum- und Fibonacci-Signalen der letzten 7 Tage für sämtliche gesetzten Bookmarks inkl. Richtungs-/Asset-Filter und Klick-Fokus in den Master-Chart
- **Markt- & Makro-Briefing (Prosa):** Automatisch generierte deutsche Profi-Analyse inkl. *Wichtigste Schlussfolgerungen*, *Kompakt/Ausführlich*-Modus, Markdown-Export und Vollbild-Lesemodus

### 3. Benutzerprofile, Anmeldung & kontinuierliche Speicherung (`server/profileStore.ts` & `src/hooks/useProfileSync.ts`)
- **Profil-Anmeldung & Registrierung:** Profile können mit Benutzername, Passwort (`scrypt`-Hash) und `HttpOnly`-Session-Cookie erstellt und gewechselt werden (`/api/auth/*`)
- **Kontinuierliche Auto-Speicherung:** Jede Änderung an Widgets, Layouts, aktiven Symbolen, Chart-Einstellungen, manuellen Fibonacci-Ankern, Ordnern und Bookmarks wird automatisch per Debounce + `keepalive` auf den Server synchronisiert (`/api/profile/workspace`, lokal persistiert unter `data/`) und bleibt nach Neuladen sowie über Profilwechsel hinweg vollständig pro Benutzer erhalten

### 4. GitHub Pages, Live-Worker & Firebase Google-Login (`DEPLOYMENT.md`)
- **GitHub Pages (`.github/workflows/deploy-pages.yml`):** Automatisches Deployment bei jedem Push auf `main` inkl. täglichem Snapshot-Fallback (`.github` Schedule)
- **Live-Kurse via Cloudflare Worker (`worker/index.ts`, `worker/wrangler.toml`):** Kostenloser Edge-Proxy für Yahoo Finance & FRED ohne Kreditkarte
- **Google-Anmeldung & Cloud-Sync (`src/services/firebase.ts`, `firestore.rules`):** Firebase Auth (Google) + Cloud Firestore synchronisieren Bookmarks, Ordner, Chart-Einstellungen und Dashboard-Layout geräteübergreifend
- **Vollständige Schritt-für-Schritt-Anleitung:** Siehe [DEPLOYMENT.md](DEPLOYMENT.md)

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

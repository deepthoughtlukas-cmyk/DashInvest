# DashInvest — GitHub Pages, Cloudflare Worker & Firebase Einrichtung (Variante 2)

Mit dieser Architektur läuft **DashInvest** zu 100 % kostenlos und ohne Kreditkarte im Web:

- **GitHub Pages** hostet das statische Frontend unter `https://deepthoughtlukas-cmyk.github.io/DashInvest/` (automatisches Build & Deploy via `.github/workflows/deploy-pages.yml`).
- **Cloudflare Worker (`worker/index.ts`)** übernimmt als schneller Live-Proxy ohne Cold-Start den Abruf von Yahoo Finance (Live-Kurse, Kerzen `15m`/`1H`/`4H`/`1D`/`1W`, globale Tickersuche, Fundamentaldaten) und FRED (Makro-Indikatoren).
  - *Automatisches Fallback:* Solange noch keine `VITE_API_BASE_URL` hinterlegt ist, erzeugt die GitHub-Pages-Action bei jedem Build & zweimal täglich per Cron (`deploy-pages.yml`) frische JSON-Snapshots (`static-api/`), damit das Dashboard sofort funktioniert.
- **Firebase Spark (Free Tier)** liefert **Google-Anmeldung** (`Firebase Auth`) und **Cloud Firestore** für geräteübergreifende Echtzeit-Speicherung deiner Bookmarks, Ordner, Layouts, Indikatoren und Fibonacci-Zeichnungen (`firestore.rules`).

---

## Schritt 1: GitHub Pages aktivieren (1 Klick)

1. Öffne dein Repository auf GitHub: **Settings → Pages**.
2. Wähle unter **Build and deployment → Source** den Eintrag **GitHub Actions**.
3. Nach dem nächsten Push auf `main` ist das Dashboard direkt unter `https://deepthoughtlukas-cmyk.github.io/DashInvest/` erreichbar.

---

## Schritt 2: Cloudflare Worker für Live-Kurse deployen (kostenlos, ohne Kreditkarte)

1. Kostenloses Konto bei [Cloudflare](https://dash.cloudflare.com/) anlegen.
2. **Option A — Direkt vom PC:**
   ```bash
   npx wrangler login
   npm run deploy:worker
   ```
   Die Konsole zeigt am Ende deine Live-URL an, z. B.:
   `https://dashinvest-api.<dein-subdomain>.workers.dev`
3. **Option B — Automatisch per GitHub Actions (`.github/workflows/deploy-worker.yml`):**
   - Erstelle im Cloudflare Dashboard ein API-Token mit Template **Edit Cloudflare Workers**.
   - Speichere das Token im GitHub Repository unter **Settings → Secrets and variables → Actions → Secrets** als `CLOUDFLARE_API_TOKEN`.
4. **Worker-URL im Repository eintragen:**
   - Gehe auf GitHub zu **Settings → Secrets and variables → Actions → Variables**.
   - Lege die Variable **`VITE_API_BASE_URL`** mit deiner Worker-URL (ohne abschließenden Slash, z. B. `https://dashinvest-api.beispiel.workers.dev`) an.

---

## Schritt 3: Firebase Auth (Google-Login) & Firestore einrichten (Spark Free Tier)

1. Öffne die [Firebase Console](https://console.firebase.google.com/) und erstelle ein neues Projekt (Tarif: **Spark / Kostenlos**, Google Analytics optional).
2. **Google-Anmeldung aktivieren:**
   - Gehe im linken Menü zu **Build → Authentication → Sign-in method**.
   - Aktiviere den Anbieter **Google** und speichere.
   - Öffne **Authentication → Settings → Authorized domains → Add domain** und füge **`deepthoughtlukas-cmyk.github.io`** hinzu.
3. **Cloud Firestore erstellen & absichern:**
   - Gehe zu **Build → Firestore Database → Create database** (Standard-Edition, Produktionsmodus, Region z. B. `eur3`).
   - Öffne den Tab **Rules** und füge den Inhalt von [`firestore.rules`](firestore.rules) ein (stellt sicher, dass jeder User ausschließlich sein eigenes Dokument `/users/{uid}` lesen und schreiben darf), danach **Publish**.
4. **Web-App-Konfiguration in GitHub Variables hinterlegen:**
   - Gehe in Firebase zu **Project Settings → Your apps → Web (`</>` App hinzufügen)** und kopiere die Werte aus `firebaseConfig`.
   - Trage sie im GitHub Repository unter **Settings → Secrets and variables → Actions → Variables** ein:
     - `VITE_FIREBASE_API_KEY`
     - `VITE_FIREBASE_AUTH_DOMAIN`
     - `VITE_FIREBASE_PROJECT_ID`
     - `VITE_FIREBASE_STORAGE_BUCKET`
     - `VITE_FIREBASE_MESSAGING_SENDER_ID`
     - `VITE_FIREBASE_APP_ID`
   - *(Optional für lokale Entwicklung)* dieselben Werte in eine lokale `.env` übernehmen (siehe `.env.example`).

5. Anschließend unter **GitHub → Actions → Deploy DashInvest to GitHub Pages → Run workflow** einen Neubau starten — fertig!

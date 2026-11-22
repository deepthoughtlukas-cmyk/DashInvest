import { expect, test, type Page } from '@playwright/test';

function attachErrorListeners(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedApiResponses: string[] = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      failedApiResponses.push(`${res.status()} ${res.url()}`);
    }
  });

  return { pageErrors, consoleErrors, failedApiResponses };
}

async function waitForDashboardReady(page: Page) {
  await page.goto('/');
  await page.waitForSelector('header');
  await expect(page.getByText(/Makro:/)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText('Fed-Bilanz (WALCL)')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 25_000 });
}

function widgetCard(page: Page, title: string) {
  return page.locator('.react-grid-item', {
    has: page.getByRole('heading', { name: title, exact: true }),
  });
}

async function assertOverlayWorks(card: ReturnType<Page['locator']>) {
  await card.getByRole('button', { name: 'S&P 500', exact: true }).click();
  await expect(card.locator('svg path[data-overlay="sp500"]')).toBeVisible();
  await card.getByRole('button', { name: 'Gold', exact: true }).click();
  await expect(card.locator('svg path[data-overlay="gold"]')).toBeVisible();
  await card.getByRole('button', { name: 'Aus', exact: true }).click();
  await expect(card.locator('svg path[data-overlay]')).toHaveCount(0);
}

test.describe('DashInvest Real-Browser E2E Verification', () => {
  test('loads live market & macro data with zero console/API errors and displays all 5 macro widgets with S&P 500 / Gold overlays', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    // 1. US Net Liquidity widget
    const liquidityCard = widgetCard(page, 'US-Marktliquidität (Fed Net Liquidity)');
    await expect(liquidityCard).toBeVisible();
    await expect(liquidityCard.getByText('Fed-Bilanz (WALCL)')).toBeVisible();
    await expect(liquidityCard.getByText('− TGA (WTREGEN)')).toBeVisible();
    await expect(liquidityCard.getByText('− ON RRP')).toBeVisible();
    await expect(liquidityCard.locator('svg path[data-overlay="sp500"]')).toBeVisible();
    await assertOverlayWorks(liquidityCard);
    await liquidityCard.getByRole('button', { name: 'S&P 500', exact: true }).click();

    // 2. Credit Spreads widget + S&P 500 & Gold overlay
    const creditCard = widgetCard(page, 'Credit Spreads (US High Yield OAS)');
    await expect(creditCard).toBeVisible();
    await expect(creditCard.getByText(/\d+\s+bps/).first()).toBeVisible();
    await expect(creditCard.getByText(/Perzentil/).first()).toBeVisible();
    await expect(creditCard.locator('svg path[data-series="base"]')).toBeVisible();
    await assertOverlayWorks(creditCard);

    // 3. DXY widget + S&P 500 & Gold overlay
    const dxyCard = widgetCard(page, 'US-Dollar-Index (DXY)');
    await expect(dxyCard).toBeVisible();
    await expect(dxyCard.getByText(/SMA 50:/)).toBeVisible();
    await expect(dxyCard.getByText(/SMA 200:/)).toBeVisible();
    await expect(dxyCard.locator('svg path[data-series="base"]')).toBeVisible();
    await assertOverlayWorks(dxyCard);

    // 4. M2 Money Supply widget + S&P 500 & Gold overlay
    const m2Card = widgetCard(page, 'US-Geldmenge M2');
    await expect(m2Card).toBeVisible();
    await expect(m2Card.getByText(/Bio\. \$/).first()).toBeVisible();
    await expect(m2Card.getByText(/YoY/).first()).toBeVisible();
    await expect(m2Card.locator('svg path[data-series="base"]')).toBeVisible();
    await assertOverlayWorks(m2Card);

    // 5. 10Y US Treasury Yield widget + S&P 500 & Gold overlay
    const y10Card = widgetCard(page, '10J US-Anleiherenditen');
    await expect(y10Card).toBeVisible();
    await expect(y10Card.getByText(/2s10s:/).first()).toBeVisible();
    await expect(y10Card.locator('svg path[data-series="base"]')).toBeVisible();
    await assertOverlayWorks(y10Card);

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('renders Master Chart with candlesticks, Fib/Elliott/MAs/sub-panes, asset/timeframe switches & Manual Fib tool', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    const chartCard = widgetCard(page, 'Master Chart Terminal');
    await expect(chartCard).toBeVisible();

    const canvasBox = await chartCard.locator('canvas').first().boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThan(300);
    expect(canvasBox!.height).toBeGreaterThan(150);

    await expect(chartCard.getByText(/GP:/)).toBeVisible();
    await expect(chartCard.getByText(/Score [+-]?\d+/)).toBeVisible();

    for (const assetLabel of ['Silber', 'S&P 500', 'Nasdaq 100']) {
      await chartCard.getByRole('button', { name: new RegExp(`^${assetLabel}`) }).click();
      await expect(chartCard.locator('canvas').first()).toBeVisible();
    }

    await chartCard.getByRole('button', { name: '4H', exact: true }).click();
    await expect(chartCard.locator('canvas').first()).toBeVisible();
    await chartCard.getByRole('button', { name: '1D', exact: true }).click();

    await chartCard.getByRole('button', { name: /^Gold/ }).click();
    await chartCard.getByLabel('Chart-Darstellung').selectOption('heikin_ashi');
    await chartCard.getByLabel('Chart-Darstellung').selectOption('candles');
    await chartCard.getByRole('button', { name: 'LOG', exact: true }).click();
    await chartCard.getByRole('button', { name: 'LOG', exact: true }).click();

    await chartCard.getByRole('button', { name: 'Bollinger', exact: true }).click();
    await chartCard.getByRole('button', { name: 'Ichimoku', exact: true }).click();
    await chartCard.getByRole('button', { name: 'ADX', exact: true }).click();
    await chartCard.getByLabel('Elliott Grad').selectOption('minor');
    await chartCard.getByLabel('Elliott Grad').selectOption('intermediate');

    await chartCard.getByRole('button', { name: 'Manuell-Fib' }).click();
    await expect(chartCard.getByText(/Schritt 1\/2:/)).toBeVisible();

    const mainCanvas = chartCard.locator('canvas').first();
    const box = (await mainCanvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
    await expect(chartCard.getByText(/Schritt 2\/2:/)).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.3);

    await expect(chartCard.getByText(/Schritt 2\/2:/)).toBeHidden();
    const clearFibBtn = chartCard.getByTitle('Manuelles Fibonacci entfernen');
    await expect(clearFibBtn).toBeVisible();
    await clearFibBtn.click();
    await expect(clearFibBtn).toBeHidden();

    await chartCard.getByTitle('Chart maximieren').click();
    await expect(page.getByTitle('Vollbild schließen')).toBeVisible();
    await page.getByTitle('Vollbild schließen').click();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('renders German Prose Briefing (Macro & Asset), Kompakt/Ausführlich, Lesemodus & Signal Matrix', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    const proseCard = widgetCard(page, 'Markt- & Makro-Briefing (Prosa)');
    await expect(proseCard).toBeVisible();

    await expect(proseCard.getByText(/Makro-Briefing:/)).toBeVisible();
    await expect(proseCard.getByText('1. Geldfluss & Liquidität')).toBeVisible();
    await expect(proseCard.getByText('2. Zinsen, Dollar & Risikoappetit')).toBeVisible();
    await expect(proseCard.getByText('Wichtigste Schlussfolgerungen')).toBeVisible();

    await proseCard.getByRole('button', { name: 'Kompakt', exact: true }).click();
    await expect(proseCard.getByText('1. Geldfluss & Liquidität')).toBeHidden();
    await expect(proseCard.getByText('Wichtigste Schlussfolgerungen')).toBeVisible();
    await proseCard.getByRole('button', { name: 'Ausführlich', exact: true }).click();
    await expect(proseCard.getByText('1. Geldfluss & Liquidität')).toBeVisible();

    await proseCard.getByRole('button', { name: 'Asset-Analyse', exact: true }).click();
    await proseCard.getByRole('button', { name: 'Nasdaq 100', exact: true }).click();
    await expect(proseCard.getByText('Nasdaq 100 Index — Marktanalyse')).toBeVisible();
    await expect(proseCard.getByText('2. Wichtige Marken & Szenario')).toBeVisible();

    await proseCard.getByTitle('Im Lesemodus öffnen').click();
    await expect(page.getByTitle('Lesemodus schließen')).toBeVisible();
    await page.getByTitle('Lesemodus schließen').click();

    const matrixCard = widgetCard(page, 'Confluence-Matrix & Signale');
    await expect(matrixCard).toBeVisible();
    await expect(matrixCard.getByText('Aktive Markt-Signale (1D)')).toBeVisible();
    await matrixCard.getByRole('button', { name: /Silber/ }).first().click();
    await expect(proseCard.getByText('Silber (COMEX Futures) — Marktanalyse')).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('switches Presets (2×2 Multi-Chart, Makro-Cockpit, Analyse-Fokus), toggles Layout Lock & Widget Drawer', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    await page.getByRole('button', { name: '2×2 Multi-Chart', exact: true }).click();
    for (const title of [
      'Gold (GC=F)',
      'Silber (SI=F)',
      'S&P 500 (^GSPC)',
      'Nasdaq 100 (^NDX)',
    ]) {
      const card = widgetCard(page, title);
      await expect(card).toBeVisible({ timeout: 20_000 });
      const cBox = await card.locator('canvas').first().boundingBox();
      expect(cBox).not.toBeNull();
      expect(cBox!.width).toBeGreaterThan(200);
      expect(cBox!.height).toBeGreaterThan(120);
    }

    await page.getByRole('button', { name: 'Makro-Cockpit', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'US-Marktliquidität (Fed Net Liquidity)', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Analyse-Fokus', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Master Chart Terminal', exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: /Widgets \(\d+\)/ }).click();
    await expect(page.getByText('Widget-Katalog flexibel anordnen')).toBeVisible();
    const drawer = page.locator('div.fixed', { hasText: 'Widget-Katalog flexibel anordnen' });
    await drawer.getByRole('button', { name: /US-Dollar-Index \(DXY\)/ }).click();
    await drawer.getByRole('button', { name: /US-Dollar-Index \(DXY\)/ }).click();
    await drawer.locator('button').first().click();
    await expect(page.getByText('Widget-Katalog flexibel anordnen')).toBeHidden();

    await page.getByRole('button', { name: 'Flexibel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gesperrt', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Gesperrt', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Flexibel', exact: true })).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('manages multi-asset catalog: nested folders/subfolders, bookmarks, moving assets & live Yahoo symbol search', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    const catalogCard = widgetCard(page, 'Wertpapier-Katalog & Bookmarks');
    const chartCard = widgetCard(page, 'Master Chart Terminal');
    const proseCard = widgetCard(page, 'Markt- & Makro-Briefing (Prosa)');
    await expect(catalogCard).toBeVisible();

    // 1. Nested folders visible & clicking Bitcoin updates Chart + Asset Prose
    await expect(catalogCard.getByRole('button', { name: /^Rohstoffe & Edelmetalle \d+$/ })).toBeVisible();
    await expect(catalogCard.getByRole('button', { name: /^Edelmetalle \d+$/ })).toBeVisible();
    await expect(catalogCard.getByRole('button', { name: /^Aktienindizes \d+$/ })).toBeVisible();
    await expect(catalogCard.getByRole('button', { name: /^Einzelaktien & Tech \d+$/ })).toBeVisible();
    await expect(catalogCard.getByRole('button', { name: /^Krypto \d+$/ })).toBeVisible();

    await catalogCard.getByRole('button', { name: /BTC-USD/ }).click();
    await expect(chartCard.getByText(/Bitcoin USD/).first()).toBeVisible({ timeout: 20_000 });
    await expect(chartCard.locator('canvas').first()).toBeVisible();

    await proseCard.getByRole('button', { name: 'Asset-Analyse', exact: true }).click();
    await expect(proseCard.getByText('Bitcoin USD — Marktanalyse')).toBeVisible();

    // 2. Bookmark toggle on Apple (AAPL) -> appears in Bookmarks tab & Master Chart tabs
    await catalogCard.getByRole('button', { name: 'Bookmark Apple' }).click();
    await catalogCard.getByRole('button', { name: /Bookmarks \(\d+\)/ }).click();
    await expect(catalogCard.getByRole('button', { name: /AAPL/ })).toBeVisible();
    await expect(chartCard.getByRole('button', { name: /^Apple/ })).toBeVisible();

    // Switch back to Ordner & unbookmark Apple
    await catalogCard.getByRole('button', { name: 'Ordner', exact: true }).click();
    await catalogCard.getByRole('button', { name: 'Bookmark Apple' }).click();

    // 3. Create Folder -> Create Subfolder -> Move Apple into Subfolder -> Rename -> Delete Subfolder
    await catalogCard.getByRole('button', { name: '+ Ordner', exact: true }).click();
    await catalogCard.getByPlaceholder(/Ordnername/).fill('Mein Fokus');
    await catalogCard.getByRole('button', { name: 'Erstellen', exact: true }).click();
    await expect(catalogCard.getByRole('button', { name: /^Mein Fokus \d+$/ })).toBeVisible();

    await catalogCard.getByLabel('Unterordner in Mein Fokus erstellen').click();
    await catalogCard.getByPlaceholder(/Ordnername/).fill('Halbleiter');
    await catalogCard.getByRole('button', { name: 'Erstellen', exact: true }).click();
    await expect(catalogCard.getByRole('button', { name: /^Halbleiter \d+$/ })).toBeVisible();

    // Move Apple into Halbleiter subfolder
    const appleFolderSelect = catalogCard.getByLabel('Ordner für Apple');
    const halbleiterVal = await appleFolderSelect
      .locator('option', { hasText: 'Mein Fokus / Halbleiter' })
      .getAttribute('value');
    await appleFolderSelect.selectOption(halbleiterVal!);

    // Rename Halbleiter -> Chips
    await catalogCard.getByLabel('Ordner Halbleiter umbenennen').click();
    await catalogCard.getByLabel('Ordner umbenennen').fill('Chips');
    await catalogCard.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(catalogCard.getByRole('button', { name: /^Chips \d+$/ })).toBeVisible();

    // Delete Chips subfolder (Apple remains in Mein Fokus)
    await catalogCard.getByLabel('Ordner Chips löschen').click();
    await expect(catalogCard.getByRole('button', { name: /^Chips \d+$/ })).toBeHidden();
    await expect(catalogCard.getByRole('button', { name: /AAPL/ })).toBeVisible();

    // 4. Live global Yahoo Finance search for AMD -> Add -> opens in Chart
    const searchInput = catalogCard.getByPlaceholder(/Wert suchen oder Ticker hinzufügen/);
    await searchInput.fill('AMD');
    await expect(catalogCard.getByText('Global hinzufügen (Yahoo Finance)')).toBeVisible({
      timeout: 15_000,
    });
    const addButtons = catalogCard.getByRole('button', { name: '+ Hinzufügen' });
    await expect(addButtons.first()).toBeVisible({ timeout: 15_000 });
    await addButtons.first().click();

    await expect(chartCard.getByText(/Advanced Micro Devices|AMD/).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(chartCard.locator('canvas').first()).toBeVisible();

    // Reset catalog cleanly back to defaults
    await catalogCard.getByRole('button', { name: 'Standard', exact: true }).click();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('displays Bookmark-Signale (7 Tage) widget for all bookmarked assets, filters & toggles cleanly', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    const signalsCard = widgetCard(page, 'Bookmark-Signale (7 Tage)');
    const catalogCard = widgetCard(page, 'Wertpapier-Katalog & Bookmarks');
    const chartCard = widgetCard(page, 'Master Chart Terminal');

    await signalsCard.scrollIntoViewIfNeeded();
    await expect(signalsCard).toBeVisible();
    await expect(
      signalsCard.getByText('Prüfe 7-Tage-Signale aller Bookmarks…'),
    ).toBeHidden({ timeout: 25_000 });

    // All 7 default bookmarks (Gold, Silber, S&P 500, Nasdaq 100, DAX 40, NVIDIA, Bitcoin) must be tracked (> 6!)
    await expect(signalsCard.getByText('7 Bookmarks aktiv')).toBeVisible();
    const assetSelect = signalsCard.getByLabel('Bookmark-Asset filtern');
    await expect(assetSelect.locator('option[value="ALL"]')).toHaveText('Alle Bookmarks (7)');
    await expect(assetSelect.locator('option[value="BTC-USD"]')).toBeAttached();

    // Filter pills respond cleanly
    await signalsCard.getByRole('button', { name: /^Bullisch/ }).click();
    await signalsCard.getByRole('button', { name: /^Bärisch/ }).click();
    await signalsCard.getByRole('button', { name: /^Warnung/ }).click();
    await signalsCard.getByRole('button', { name: /^Alle/ }).click();

    // Toggling a new bookmark in Catalog dynamically adds the 8th asset to the 7-day widget
    await catalogCard.getByRole('button', { name: 'Bookmark Apple' }).click();
    await expect(signalsCard.getByText('8 Bookmarks aktiv')).toBeVisible({ timeout: 15_000 });
    await expect(assetSelect.locator('option[value="ALL"]')).toHaveText('Alle Bookmarks (8)');
    await expect(assetSelect.locator('option[value="AAPL"]')).toBeAttached();

    // Restore bookmark state
    await catalogCard.getByRole('button', { name: 'Bookmark Apple' }).click();
    await expect(signalsCard.getByText('7 Bookmarks aktiv')).toBeVisible();

    // If signals exist within the 7-day window, verify clicking a signal focuses Master Chart
    const signalCountText = await signalsCard.getByText(/\d+ Signale? \(7T\)/).textContent();
    const totalSignals = Number.parseInt(signalCountText ?? '0', 10);
    if (totalSignals > 0) {
      await signalsCard.locator('div.grid button').first().click();
      await expect(chartCard.locator('canvas').first()).toBeVisible();
    }

    // Verify widget can be toggled off and back on via + Widgets drawer
    await page.getByRole('button', { name: /Widgets \(\d+\)/ }).click();
    const drawer = page.locator('div.fixed', { hasText: 'Widget-Katalog flexibel anordnen' });
    await drawer.getByRole('button', { name: /Bookmark-Signale \(7 Tage\)/ }).click();
    await expect(signalsCard).toBeHidden();
    await drawer.getByRole('button', { name: /Bookmark-Signale \(7 Tage\)/ }).click();
    await expect(signalsCard).toBeVisible();
    await drawer.locator('button').first().click();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('renders collapsible Fundamentaldaten-Sidebar in Master Chart Terminal with valuation, growth, dividend history & analyst consensus', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    const chartCard = widgetCard(page, 'Master Chart Terminal');
    const sidebar = chartCard.getByLabel('Fundamentaldaten-Sidebar');

    // 1. Visible by default on initial Gold chart with 52W range & quick-switch buttons
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('52W Spanne')).toBeVisible({ timeout: 20_000 });

    // 2. Quick-switch to AAPL -> loads full fundamental metrics from /api/market/fundamentals
    await sidebar.getByRole('button', { name: 'AAPL · Apple' }).click();
    await expect(sidebar.getByText('KGV (TTM)')).toBeVisible({ timeout: 20_000 });
    await expect(sidebar.getByText('Forward KGV')).toBeVisible();
    await expect(sidebar.getByText('KBV')).toBeVisible();
    await expect(sidebar.getByText('Gewinnwachstum')).toBeVisible();
    await expect(sidebar.getByText('Dividendenrendite')).toBeVisible();
    await expect(sidebar.getByText('Dividendenhistorie')).toBeVisible();
    await expect(sidebar.getByText('Analysten-Konsens')).toBeVisible();
    await expect(sidebar.getByText(/Kursziel \(Ø\)/)).toBeVisible();

    // 3. Measure canvas width with sidebar open, collapse via sidebar button -> canvas widens cleanly
    const expandedBox = (await chartCard.locator('canvas').first().boundingBox())!;
    await sidebar.getByRole('button', { name: 'Fundamental-Sidebar einklappen' }).click();
    await expect(sidebar).toBeHidden();

    // Wait briefly for ResizeObserver to expand chart canvas
    await expect
      .poll(async () => (await chartCard.locator('canvas').first().boundingBox())?.width ?? 0)
      .toBeGreaterThan(expandedBox.width + 100);

    // 4. Re-expand via toolbar Fundamental toggle button
    const toggleBtn = chartCard.getByRole('button', { name: 'Fundamental', exact: true });
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    await toggleBtn.click();
    await expect(sidebar).toBeVisible();
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('registers user profiles, auto-saves view/bookmarks/folders across reload & switches between independent users', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    const runId = Date.now().toString(36);
    const userA = `e2ea_${runId}`;
    const userB = `e2eb_${runId}`;
    const pass = 'testpass123';

    const profileBtn = page.getByLabel('Profil und Anmeldung öffnen');
    const catalogCard = widgetCard(page, 'Wertpapier-Katalog & Bookmarks');
    const chartCard = widgetCard(page, 'Master Chart Terminal');

    // 1. Register User A importing current workspace
    await profileBtn.click();
    const dialog = page.getByRole('dialog', { name: 'Benutzerprofil & Anmeldung' });
    await dialog.getByRole('button', { name: 'Neues Profil', exact: true }).click();
    await dialog.getByPlaceholder('z. B. lukas', { exact: true }).fill(userA);
    await dialog.getByPlaceholder('z. B. Lukas Portfolio').fill('Profil A');
    await dialog.getByPlaceholder('Mindestens 4 Zeichen').fill(pass);
    await dialog.getByRole('button', { name: 'Profil erstellen', exact: true }).click();

    await expect(profileBtn.getByText('Profil A')).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel('Profil-Dialog schließen').click();

    // 2. Customize User A view: bookmark Apple, create folder ProfilA-Fokus, select AAPL, collapse Fundamental sidebar
    await catalogCard.getByRole('button', { name: 'Bookmark Apple' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await catalogCard.getByRole('button', { name: '+ Ordner', exact: true }).click();
    await catalogCard.getByPlaceholder(/Ordnername/).fill('ProfilA-Fokus');
    await catalogCard.getByRole('button', { name: 'Erstellen', exact: true }).click();
    await expect(catalogCard.getByRole('button', { name: /^ProfilA-Fokus \d+$/ })).toBeVisible();

    await catalogCard.getByRole('button', { name: /AAPL/ }).click();
    await expect(chartCard.getByText(/Apple Inc\./).first()).toBeVisible({ timeout: 20_000 });

    await chartCard.getByRole('button', { name: 'Fundamental-Sidebar einklappen' }).click();
    await expect(chartCard.getByLabel('Fundamentaldaten-Sidebar')).toBeHidden();

    // Wait for continuous server auto-save completion
    await expect(profileBtn.getByText('Gespeichert')).toBeVisible({ timeout: 15_000 });

    // 3. Reload browser -> session cookie restores User A + exact saved view & bookmarks
    await page.reload();
    await expect(page.getByText(/Makro:/)).toBeVisible({ timeout: 25_000 });
    await expect(profileBtn.getByText('Profil A')).toBeVisible({ timeout: 15_000 });
    await expect(catalogCard.getByRole('button', { name: /^ProfilA-Fokus \d+$/ })).toBeVisible();
    await expect(chartCard.getByText(/Apple Inc\./).first()).toBeVisible({ timeout: 20_000 });
    await expect(chartCard.getByLabel('Fundamentaldaten-Sidebar')).toBeHidden();

    // 4. Logout User A -> resets cleanly back to guest state
    await profileBtn.click();
    await dialog.getByRole('button', { name: /Abmelden \/ Profil wechseln/ }).click();
    await expect(profileBtn.getByText('Profil / Anmelden')).toBeVisible({ timeout: 15_000 });
    await expect(catalogCard.getByRole('button', { name: /^ProfilA-Fokus \d+$/ })).toBeHidden();

    // 5. Register User B with clean workspace -> add ProfilB-Fokus -> save -> logout
    await dialog.getByRole('button', { name: 'Neues Profil', exact: true }).click();
    await dialog.getByPlaceholder('z. B. lukas', { exact: true }).fill(userB);
    await dialog.getByPlaceholder('z. B. Lukas Portfolio').fill('Profil B');
    await dialog.getByPlaceholder('Mindestens 4 Zeichen').fill(pass);
    const importCheckbox = dialog.getByRole('checkbox');
    if (await importCheckbox.isChecked()) {
      await importCheckbox.uncheck();
    }
    await dialog.getByRole('button', { name: 'Profil erstellen', exact: true }).click();

    await expect(profileBtn.getByText('Profil B')).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel('Profil-Dialog schließen').click();
    await expect(catalogCard.getByRole('button', { name: /^ProfilA-Fokus \d+$/ })).toBeHidden();

    await catalogCard.getByRole('button', { name: '+ Ordner', exact: true }).click();
    await catalogCard.getByPlaceholder(/Ordnername/).fill('ProfilB-Fokus');
    await catalogCard.getByRole('button', { name: 'Erstellen', exact: true }).click();
    await expect(catalogCard.getByRole('button', { name: /^ProfilB-Fokus \d+$/ })).toBeVisible();
    await expect(profileBtn.getByText('Gespeichert')).toBeVisible({ timeout: 15_000 });

    await profileBtn.click();
    await dialog.getByRole('button', { name: /Abmelden \/ Profil wechseln/ }).click();

    // 6. Log back in as User A -> proves server workspace restored ProfilA-Fokus and kept User B isolated
    await dialog.getByPlaceholder('z. B. lukas', { exact: true }).fill(userA);
    await dialog.getByPlaceholder('••••••••').fill(pass);
    await dialog.getByRole('button', { name: 'Jetzt anmelden', exact: true }).click();
    await expect(profileBtn.getByText('Profil A')).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel('Profil-Dialog schließen').click();

    await expect(catalogCard.getByRole('button', { name: /^ProfilA-Fokus \d+$/ })).toBeVisible();
    await expect(catalogCard.getByRole('button', { name: /^ProfilB-Fokus \d+$/ })).toBeHidden();
    await expect(chartCard.getByLabel('Fundamentaldaten-Sidebar')).toBeHidden();

    // 7. Cleanly delete both temporary E2E profiles via UI
    await profileBtn.click();
    await dialog.getByRole('button', { name: /Profil dauerhaft löschen/ }).click();
    await dialog.getByPlaceholder('Passwort bestätigen').fill(pass);
    await dialog.getByRole('button', { name: 'Löschen', exact: true }).click();
    await expect(profileBtn.getByText('Profil / Anmelden')).toBeVisible({ timeout: 15_000 });

    await dialog.getByPlaceholder('z. B. lukas', { exact: true }).fill(userB);
    await dialog.getByPlaceholder('••••••••').fill(pass);
    await dialog.getByRole('button', { name: 'Jetzt anmelden', exact: true }).click();
    await expect(profileBtn.getByText('Profil B')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: /Profil dauerhaft löschen/ }).click();
    await dialog.getByPlaceholder('Passwort bestätigen').fill(pass);
    await dialog.getByRole('button', { name: 'Löschen', exact: true }).click();
    await expect(profileBtn.getByText('Profil / Anmelden')).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel('Profil-Dialog schließen').click();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });
});

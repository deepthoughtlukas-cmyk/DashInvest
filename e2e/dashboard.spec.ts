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
  // Ensure clean initial localStorage state for deterministic runs
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

test.describe('DashInvest Real-Browser E2E Verification', () => {
  test('loads live market & macro data with zero console/API errors and displays all 5 macro widgets', async ({
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

    await liquidityCard.getByRole('button', { name: 'Gold', exact: true }).click();
    await expect(liquidityCard.locator('svg path').first()).toBeVisible();
    await liquidityCard.getByRole('button', { name: 'Aus', exact: true }).click();
    await liquidityCard.getByRole('button', { name: 'S&P 500', exact: true }).click();

    // 2. Credit Spreads widget
    const creditCard = widgetCard(page, 'Credit Spreads (US High Yield OAS)');
    await expect(creditCard).toBeVisible();
    await expect(creditCard.getByText(/\d+\s+bps/).first()).toBeVisible();
    await expect(creditCard.getByText(/Perzentil/).first()).toBeVisible();
    await expect(creditCard.locator('svg path').first()).toBeVisible();

    // 3. DXY widget
    const dxyCard = widgetCard(page, 'US-Dollar-Index (DXY)');
    await expect(dxyCard).toBeVisible();
    await expect(dxyCard.getByText(/SMA 50:/)).toBeVisible();
    await expect(dxyCard.getByText(/SMA 200:/)).toBeVisible();
    await expect(dxyCard.locator('svg path').first()).toBeVisible();

    // 4. M2 Money Supply widget
    const m2Card = widgetCard(page, 'US-Geldmenge M2');
    await expect(m2Card).toBeVisible();
    await expect(m2Card.getByText(/Bio\. \$/).first()).toBeVisible();
    await expect(m2Card.getByText(/YoY/).first()).toBeVisible();
    await expect(m2Card.locator('svg path').first()).toBeVisible();

    // 5. 10Y US Treasury Yield widget
    const y10Card = widgetCard(page, '10J US-Anleiherenditen');
    await expect(y10Card).toBeVisible();
    await expect(y10Card.getByText(/2s10s:/).first()).toBeVisible();
    await expect(y10Card.locator('svg path').first()).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('renders Master Chart with candlesticks, Fib/Elliott/MAs/sub-panes, asset/timeframe switches & Manual Fib tool', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    const chartCard = page.locator('.react-grid-item', {
      hasText: 'Master Chart Terminal',
    });
    await expect(chartCard).toBeVisible();

    // Verify Lightweight Charts canvases have real dimensions
    const canvasBox = await chartCard.locator('canvas').first().boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThan(300);
    expect(canvasBox!.height).toBeGreaterThan(150);

    // Status strip shows Golden Pocket & Confluence Score
    await expect(chartCard.getByText(/GP:/)).toBeVisible();
    await expect(chartCard.getByText(/Score [+-]?\d+/)).toBeVisible();

    // Switch through Silber, S&P 500, Nasdaq 100 and change timeframe to 4H then back to 1D
    for (const assetLabel of ['Silber', 'S&P 500', 'Nasdaq 100']) {
      await chartCard.getByRole('button', { name: new RegExp(`^${assetLabel}`) }).click();
      await expect(chartCard.locator('canvas').first()).toBeVisible();
    }

    await chartCard.getByRole('button', { name: '4H', exact: true }).click();
    await expect(chartCard.locator('canvas').first()).toBeVisible();
    await chartCard.getByRole('button', { name: '1D', exact: true }).click();

    // Back to Gold & test Chart style, LOG, overlays, and sub-panes
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

    // Manual Fibonacci 2-click drawing tool
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

    // Fullscreen modal toggle
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

    const proseCard = page.locator('.react-grid-item', {
      hasText: 'Markt- & Makro-Briefing (Prosa)',
    });
    await expect(proseCard).toBeVisible();

    // Macro Briefing tab
    await expect(proseCard.getByText(/Makro-Briefing:/)).toBeVisible();
    await expect(proseCard.getByText('1. Liquidität & Geldmenge (Fed Net Liquidity & M2)')).toBeVisible();
    await expect(proseCard.getByText('2. Zinsen, US-Dollar & Kreditrisiko')).toBeVisible();
    await expect(proseCard.getByText('Wichtigste Schlussfolgerungen')).toBeVisible();

    // Kompakt / Ausführlich toggle
    await proseCard.getByRole('button', { name: 'Kompakt', exact: true }).click();
    await expect(proseCard.getByText('1. Liquidität & Geldmenge (Fed Net Liquidity & M2)')).toBeHidden();
    await expect(proseCard.getByText('Wichtigste Schlussfolgerungen')).toBeVisible();
    await proseCard.getByRole('button', { name: 'Ausführlich', exact: true }).click();
    await expect(proseCard.getByText('1. Liquidität & Geldmenge (Fed Net Liquidity & M2)')).toBeVisible();

    // Asset-Analyse tab + Nasdaq 100 quick pill
    await proseCard.getByRole('button', { name: 'Asset-Analyse', exact: true }).click();
    await proseCard.getByRole('button', { name: 'Nasdaq 100', exact: true }).click();
    await expect(proseCard.getByText(/Nasdaq 100 Index — Technische & Makro-Analyse/)).toBeVisible();
    await expect(proseCard.getByText('3. Fibonacci & Elliott-Wellen-Struktur')).toBeVisible();

    // Reader Modal
    await proseCard.getByTitle('Im Lesemodus öffnen').click();
    await expect(page.getByTitle('Lesemodus schließen')).toBeVisible();
    await page.getByTitle('Lesemodus schließen').click();

    // Signal Matrix
    const matrixCard = page.locator('.react-grid-item', {
      hasText: 'Confluence-Matrix & Signale',
    });
    await expect(matrixCard).toBeVisible();
    await expect(matrixCard.getByText('Aktive Markt-Signale (1D)')).toBeVisible();
    await matrixCard.getByRole('button', { name: /Silber/ }).first().click();
    await expect(proseCard.getByText(/Silber \(COMEX Futures\) — Technische & Makro-Analyse/)).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });

  test('switches Presets (2×2 Multi-Chart, Makro-Cockpit, Analyse-Fokus), toggles Layout Lock & Widget Drawer', async ({
    page,
  }) => {
    const errors = attachErrorListeners(page);
    await waitForDashboardReady(page);

    // Switch to 2×2 Multi-Chart
    await page.getByRole('button', { name: '2×2 Multi-Chart', exact: true }).click();
    for (const title of [
      'Gold (GC=F)',
      'Silber (SI=F)',
      'S&P 500 (^GSPC)',
      'Nasdaq 100 (^NDX)',
    ]) {
      const card = page.locator('.react-grid-item', { hasText: title });
      await expect(card).toBeVisible({ timeout: 20_000 });
      const cBox = await card.locator('canvas').first().boundingBox();
      expect(cBox).not.toBeNull();
      expect(cBox!.width).toBeGreaterThan(200);
      expect(cBox!.height).toBeGreaterThan(120);
    }

    // Switch to Makro-Cockpit then back to Analyse-Fokus
    await page.getByRole('button', { name: 'Makro-Cockpit', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'US-Marktliquidität (Fed Net Liquidity)' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Analyse-Fokus', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Master Chart Terminal' }),
    ).toBeVisible();

    // Widget Drawer toggle
    await page.getByRole('button', { name: /Widgets \(\d+\)/ }).click();
    await expect(page.getByText('Widget-Katalog flexibel anordnen')).toBeVisible();
    const drawer = page.locator('div.fixed', { hasText: 'Widget-Katalog flexibel anordnen' });
    await drawer.getByRole('button', { name: /US-Dollar-Index \(DXY\)/ }).click();
    await drawer.getByRole('button', { name: /US-Dollar-Index \(DXY\)/ }).click();
    // Close drawer via top-right close X button inside drawer header
    await drawer.locator('button').first().click();
    await expect(page.getByText('Widget-Katalog flexibel anordnen')).toBeHidden();

    // Layout Lock toggle
    await page.getByRole('button', { name: 'Flexibel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gesperrt', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Gesperrt', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Flexibel', exact: true })).toBeVisible();

    expect(errors.pageErrors).toEqual([]);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.failedApiResponses).toEqual([]);
  });
});

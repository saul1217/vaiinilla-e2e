import { expect, test } from '@playwright/test';
import { capturarErrores, sinPantallaBlanca } from '../../helpers/app';

const SLUG = process.env.QA_NEGOCIO_SLUG ?? 'usagi-pruebas';
const PROD_HOST = /^(www\.|app\.)?vaiinilla\.app$|vaiinillaback-production|api\.vaiinilla\.app/;
const RUTAS = ['/', '/soporte', '/pedir', `/e/${SLUG}`, '/acceso', '/registro', '/privacidad', '/terminos', '/eliminar-cuenta'];

test('ruta inexistente muestra algo (404 o inicio), no pantalla blanca', async ({ page }) => {
  const errores = capturarErrores(page);
  await page.goto('/ruta-que-no-existe-e2e-' + Date.now());
  await sinPantallaBlanca(page, errores);
});

test('negocio inexistente /e/<slug> no rompe la app', async ({ page }) => {
  const errores = capturarErrores(page);
  await page.goto('/e/negocio-inexistente-e2e');
  await sinPantallaBlanca(page, errores);
});

for (const ruta of RUTAS) {
  test(`landing ${ruta}: sin errores de consola ni llamadas a producción`, async ({ page }) => {
    const consola: string[] = [];
    const prod: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') consola.push(m.text()); });
    page.on('request', (r) => { try { if (PROD_HOST.test(new URL(r.url()).hostname + new URL(r.url()).pathname)) prod.push(r.url()); } catch { /* data: */ } });
    const errores = capturarErrores(page);
    const resp = await page.goto(ruta);
    expect(resp?.status() ?? 200).toBeLessThan(400);
    await sinPantallaBlanca(page, errores);
    await page.waitForLoadState('networkidle').catch(() => {});
    expect(prod, `develop llamó a producción desde ${ruta}`).toEqual([]);
    // Errores de consola: se reportan como soft para que salgan en el reporte sin tumbar el run.
    expect.soft(consola.filter((t) => !/favicon|Failed to load resource.*(404|401)/i.test(t)), `consola ${ruta}`).toEqual([]);
  });
}

test('enlaces internos de la landing no están rotos', async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const vistos = new Set<string>();
  for (const ruta of ['/', '/soporte', `/e/${SLUG}`]) {
    await page.goto(ruta);
    await page.waitForLoadState('networkidle').catch(() => {});
    for (const h of await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
      const u = new URL(h);
      if (u.origin === new URL(baseURL!).origin && !u.hash) vistos.add(u.origin + u.pathname);
    }
  }
  const rotos: string[] = [];
  for (const u of [...vistos].slice(0, 40)) {
    const r = await request.get(u);
    if (r.status() >= 400) rotos.push(`${r.status()} ${u}`);
  }
  expect(rotos).toEqual([]);
});

test('ningún bundle JS de develop trae URLs de producción', async ({ page }) => {
  const js: string[] = [];
  page.on('response', async (r) => { if (r.url().endsWith('.js')) js.push(await r.text().catch(() => '')); });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  const hits = js.flatMap((t) => t.match(/https:\/\/(www\.|app\.)?vaiinilla\.app[^"'`\s]*/g) ?? []);
  test.info().annotations.push({ type: 'prod-urls', description: [...new Set(hits)].slice(0, 10).join(' ') || 'ninguna' });
  // Conocido: el hotfix de landing #116/#117 deja https://app.vaiinilla.app como fallback de VITE_STAFF_APP_URL.
  // Los enlaces reales de develop no lo usan (ver landing.spec). Cualquier otra URL de producción falla.
  // www.vaiinilla.app: canonical/SEO intencional (landing #144); develop lleva noindex por host y VERCEL_ENV.
  const CONOCIDAS = new Set(['https://app.vaiinilla.app', 'https://www.vaiinilla.app']);
  expect([...new Set(hits)].filter((h) => !CONOCIDAS.has(h)), 'URLs de producción en el bundle de develop').toEqual([]);
});

test('móvil: landing y menú se ven sin desbordar horizontalmente', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true });
  const page = await ctx.newPage();
  for (const ruta of ['/', `/e/${SLUG}`]) {
    await page.goto(ruta);
    await page.waitForLoadState('networkidle').catch(() => {});
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    expect.soft(ancho, `${ruta} desborda`).toBeLessThanOrEqual(380);
  }
  await ctx.close();
});

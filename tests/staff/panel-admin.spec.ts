import { expect, test } from '@playwright/test';
import { capturarErrores, entrar, PASSWORD } from '../../helpers/app';

// Smoke de pantallas de admin: sin pantalla blanca, sin errores de consola/JS, sin llamadas a producción.
const RUTAS = ['/app', '/app/menu', '/app/pedidos', '/app/cashback', '/app/flujo', '/app/espacios', '/app/invitaciones', '/app/configuracion', '/app/reportes', '/app/pos', '/app/cocina'];
const PROD = /(^|\/\/)(app\.|www\.)?vaiinilla\.app|vaiinillaback-production|lklljmierjcjfrjmyjlw/;

test('admin: pantallas sin consola roja ni producción', async ({ page }) => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  test.setTimeout(240_000);
  const errores = capturarErrores(page);
  const consola: string[] = [];
  const prod: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(m.text())) consola.push(m.text().slice(0, 200)); });
  page.on('request', (r) => { if (PROD.test(r.url())) prod.push(r.url()); });
  await entrar(page, 'admin');
  for (const ruta of RUTAS) {
    await page.goto(ruta);
    await expect(page.locator('#root'), ruta).not.toBeEmpty({ timeout: 20_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    expect((await page.locator('#root').innerText()).trim().length, `${ruta} vacío`).toBeGreaterThan(0);
    await expect(page.getByText(/Something went wrong|Unexpected Application Error|Algo salió mal/i), ruta).toHaveCount(0);
    const html = await page.content();
    expect(html.match(/https:\/\/(app\.|www\.)?vaiinilla\.app[^"' <]*/g) ?? [], `${ruta} enlaza producción`).toEqual([]);
  }
  expect(prod, 'peticiones a producción').toEqual([]);
  expect(errores, 'errores de JS').toEqual([]);
  expect.soft(consola, 'console.error').toEqual([]);
});

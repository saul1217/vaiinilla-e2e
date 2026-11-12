import { expect, test } from '@playwright/test';
import { capturarErrores, sinPantallaBlanca } from '../../helpers/app';

const SLUG = process.env.QA_NEGOCIO_SLUG ?? 'usagi-pruebas';
const RUTAS = ['/', '/soporte', '/pedir', '/cuenta', '/acceso/recuperar', '/cuenta/saldo', '/cuenta/pedidos',
  `/e/${SLUG}`, `/e/${SLUG}/carrito`, '/seguimiento/token-inexistente-e2e', '/u/e2e-inexistente'];

// Dominios de producción que no deben aparecer en enlaces de develop.
const PROD = /^https?:\/\/(www\.|app\.)?vaiinilla\.app(\/|$)/;

for (const ruta of RUTAS) {
  test(`landing ${ruta} carga sin pantalla blanca y sin enlaces a producción`, async ({ page }) => {
    const errores = capturarErrores(page);
    await page.goto(ruta);
    await sinPantallaBlanca(page, errores);
    await page.waitForLoadState('networkidle').catch(() => {});
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    const malos = hrefs.filter((h) => PROD.test(h));
    expect(malos, `enlaces a producción en ${ruta}`).toEqual([]);
  });
}

test('menú público de usagi-pruebas muestra productos', async ({ page }) => {
  const errores = capturarErrores(page);
  await page.goto(`/e/${SLUG}`);
  await sinPantallaBlanca(page, errores);
  await expect(page.getByText(/Tacos de birria|\$\s?\d+/).first()).toBeVisible({ timeout: 20_000 });
});

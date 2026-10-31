import { expect, test } from '@playwright/test';
import { capturarErrores, login, PASSWORD, Rol } from '../../helpers/app';

// Rutas de vaiinilla-web (src/app/router.tsx). Cada rol ve lo suyo; si una ruta no le toca,
// la app puede redirigir, pero nunca debe quedar en blanco ni lanzar errores de JS.
const RUTAS: Record<Rol, string[]> = {
  admin: ['/app', '/app/pedidos', '/app/menu', '/app/cashback', '/app/flujo', '/app/espacios', '/app/invitaciones', '/app/cocina', '/app/pos'],
  caja: ['/app', '/app/pedidos', '/app/pos', '/app/espacios'],
  cocina: ['/app', '/app/cocina'],
};

for (const rol of Object.keys(RUTAS) as Rol[]) {
  test(`pantallas de ${rol} cargan sin pantalla blanca`, async ({ page }) => {
    test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
    test.setTimeout(180_000);
    const errores = capturarErrores(page);
    await login(page, rol);
    for (const ruta of RUTAS[rol]) {
      await page.goto(ruta);
      await expect(page.locator('#root'), `${rol} ${ruta}`).not.toBeEmpty({ timeout: 20_000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      const texto = (await page.locator('#root').innerText()).trim();
      expect(texto.length, `${rol} ${ruta} sin contenido`).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: 'Iniciar sesión' }), `${rol} ${ruta} perdió la sesión`).toHaveCount(0);
    }
    expect(errores, `errores de JS: ${errores.join(' | ')}`).toEqual([]);
  });
}

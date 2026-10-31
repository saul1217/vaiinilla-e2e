import { test } from '@playwright/test';
import { capturarErrores, login, PASSWORD, Rol, sinPantallaBlanca } from '../../helpers/app';

test('panel carga la pantalla de inicio de sesión', async ({ page }) => {
  const errores = capturarErrores(page);
  await page.goto('/');
  await sinPantallaBlanca(page, errores);
});

for (const rol of ['admin', 'caja', 'cocina'] as Rol[]) {
  test(`inicia sesión como ${rol}`, async ({ page }) => {
    test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
    const errores = capturarErrores(page);
    await login(page, rol);
    await sinPantallaBlanca(page, errores);
  });
}

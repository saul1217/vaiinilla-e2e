import { expect, Page } from '@playwright/test';

/** Falla si la página quedó en blanco o lanzó errores no atrapados. */
export async function sinPantallaBlanca(page: Page, errores: string[]) {
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20_000 });
  expect(errores, `errores de JS: ${errores.join(' | ')}`).toEqual([]);
}

export function capturarErrores(page: Page) {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  return errores;
}

export type Rol = 'admin' | 'caja' | 'cocina';
export const CUENTAS: Record<Rol, string | undefined> = {
  admin: process.env.QA_ADMIN_EMAIL ?? 'saul.admin@kakaowin.garden',
  caja: process.env.QA_CAJA_EMAIL ?? 'saul.caja@kakaowin.garden',
  cocina: process.env.QA_COCINA_EMAIL ?? 'saul.cocina@kakaowin.garden',
};
export const PASSWORD = process.env.QA_FIREBASE_DEV_PASSWORD;

export async function login(page: Page, rol: Rol) {
  await page.goto('/');
  await page.getByLabel('Correo').fill(CUENTAS[rol]!);
  await page.getByLabel('Contraseña').fill(PASSWORD!);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toHaveCount(0, { timeout: 20_000 });
}

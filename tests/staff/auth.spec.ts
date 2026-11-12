import { expect, test } from '@playwright/test';
import { CUENTAS, entrar, PASSWORD, Rol } from '../../helpers/app';
import { API_URL, firebaseIdToken } from '../../helpers/api';

test('contraseña incorrecta se rechaza en la UI y no abre sesión', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Correo').fill(CUENTAS.caja!);
  await page.getByLabel('Contraseña').fill('contraseña-incorrecta-e2e');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText(/correo o la contraseña no son correctos/i)).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/app/);
});

test('Firebase rechaza contraseña incorrecta (API)', async () => {
  await expect(firebaseIdToken(CUENTAS.caja!, 'contraseña-incorrecta-e2e')).rejects.toThrow(/INVALID|PASSWORD|CREDENTIAL/i);
});

test('API rechaza peticiones sin token o con token basura (401)', async () => {
  for (const h of [{}, { Authorization: 'Bearer basura' }, { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' }]) {
    const r = await fetch(`${API_URL}/pedidos`, { headers: h as Record<string, string> });
    expect(r.status, JSON.stringify(h).slice(0, 30)).toBe(401);
  }
});

test('el token de Firebase solo (sin contexto) no da acceso a pedidos', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const id = await firebaseIdToken(CUENTAS.admin!);
  const r = await fetch(`${API_URL}/pedidos`, { headers: { Authorization: `Bearer ${id}` } });
  expect([401, 403]).toContain(r.status);
});

test('cerrar sesión saca al usuario y las rutas /app ya no abren', async ({ page }) => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  await entrar(page, 'cocina');
  await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
  await expect(page).not.toHaveURL(/\/app/, { timeout: 15_000 });
  await page.goto('/app/cocina');
  await expect(page).not.toHaveURL(/\/app\/cocina/, { timeout: 15_000 });
});

test('sesión expirada/borrada: limpiar almacenamiento obliga a volver a entrar', async ({ page, context }) => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  await entrar(page, 'caja');
  await context.clearCookies();
  await page.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear();
    for (const db of (await (indexedDB as any).databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
  });
  await page.goto('/app/pedidos');
  await expect(page).not.toHaveURL(/\/app\/pedidos/, { timeout: 20_000 });
});

// Guardas de rutas en la UI: cada rol cae en su pantalla, no en la de otro.
const PROHIBIDAS: Record<Rol, string[]> = {
  cocina: ['/app/pedidos', '/app/menu', '/app/pos', '/app/invitaciones', '/app/cashback', '/app/flujo'],
  caja: ['/app/menu', '/app/invitaciones', '/app/cashback', '/app/flujo'],
  admin: [],
};
for (const rol of ['cocina', 'caja'] as Rol[]) {
  test(`${rol} no puede abrir rutas de otros roles en la UI`, async ({ page }) => {
    test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
    test.setTimeout(120_000);
    await entrar(page, rol);
    for (const ruta of PROHIBIDAS[rol]) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect.soft(page, `${rol} quedó en ${ruta}`).not.toHaveURL(new RegExp(ruta.replace(/\//g, '\\/') + '$'), { timeout: 10_000 });
    }
  });
}

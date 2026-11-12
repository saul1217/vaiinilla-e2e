import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff } from '../../helpers/api';

test('búsqueda de clientes: mínimo de caracteres, tope 20, correo enmascarado', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  expect((await caja.get('/wallets/clientes?q=a')).status, 'q de 1 letra').toBe(400);
  expect((await caja.get('/wallets/clientes')).status, 'sin q').toBe(400);
  const r = await caja.get('/wallets/clientes?q=' + encodeURIComponent('%'));
  expect.soft(r.status, 'q=% no debe hacer wildcard SQL').toBeLessThan(500);
  for (const q of ['sa', 'ci', 'e2e']) {
    const s = await caja.get('/wallets/clientes?q=' + q);
    expect(s.status).toBe(200);
    expect(s.data.length).toBeLessThanOrEqual(20);
    for (const c of s.data) {
      expect(c).not.toHaveProperty('correo');
      expect(c).not.toHaveProperty('email');
      expect(c).not.toHaveProperty('telefono');
      if (c.correo_enmascarado) expect(c.correo_enmascarado).toMatch(/^[^@]{0,2}\*{3}@/);
    }
  }
});

// B1 (bajo, abierto): sin rate limit. Soft-check: registra si aparece 429, no falla.
test('B1: enumeración de clientes (rate limit) — informativo', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => caja.get(`/wallets/clientes?q=${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + ((i * 7) % 26))}`)));
  const limitado = rs.some((r) => r.status === 429);
  test.info().annotations.push({ type: 'B1', description: limitado ? 'hay rate limit (429)' : 'sin rate limit en 25 búsquedas (B1 abierto)' });
  expect(rs.every((r) => r.status < 500)).toBe(true);
});

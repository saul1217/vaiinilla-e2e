import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff, productosMixtos } from '../../helpers/api';

// Autorización por rol en la API (develop, usagi-pruebas). Solo lecturas o escrituras que deben fallar.
test('caja y cocina no pueden leer/cambiar configuración ni reportes (403)', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  for (const rol of ['caja', 'cocina'] as const) {
    const a = await apiStaff(rol);
    expect.soft((await a.get('/establecimiento/configuracion')).status, `${rol} GET config`).toBe(403);
    expect.soft((await a.patch('/establecimiento/configuracion', { reparto_activo: false })).status, `${rol} PATCH config`).toBe(403);
    expect.soft((await a.get('/reportes/resumen')).status, `${rol} reportes`).toBe(403);
    expect.soft((await a.post('/wallets/reglas-cashback', {})).status, `${rol} cashback`).toBe(403);
  }
});

test('cocina no puede crear pedidos, cobrar, ver clientes ni confirmar devoluciones', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const cocina = await apiStaff('cocina');
  const caja = await apiStaff('caja');
  const { cocina: pc } = await productosMixtos(caja);
  expect.soft((await cocina.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', items: [{ producto_id: pc.id, cantidad: 1 }] })).status).toBe(403);
  expect.soft((await cocina.get('/wallets/clientes?q=ci')).status).toBe(403);
  expect.soft((await cocina.get('/devoluciones')).status).toBe(403);
  const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e roles', items: [{ producto_id: pc.id, cantidad: 1 }] });
  expect(p.status).toBe(201);
  try {
    expect.soft((await cocina.post(`/pedidos/${p.data.id}/cobros-efectivo`, { monto_recibido: p.data.total, version_esperada: p.data.version })).status).toBe(403);
    expect.soft((await cocina.post(`/pedidos/${p.data.id}/en-camino`)).status).not.toBe(201);
  } finally {
    const a = await caja.get(`/pedidos/${p.data.id}`);
    if (a.data) await caja.post(`/pedidos/${p.data.id}/cancelaciones`, { version_esperada: a.data.version });
  }
});

test('caja no puede ajustar saldos (solo admin)', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const r = await caja.post('/wallets/00000000-0000-4000-8000-000000000000/ajustes', { monto: 1, motivo: 'e2e' });
  expect(r.status).toBe(403);
});

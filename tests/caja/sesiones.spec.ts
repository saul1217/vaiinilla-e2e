import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff, productosMixtos, API_URL } from '../../helpers/api';

// Sesiones de caja. No cerramos la sesión compartida de usagi-pruebas (cambiaría el corte de
// todos); probamos lo que no la altera.
test('doble apertura con sesión activa → rechazada; la sesión no cambia', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const antes = await caja.get('/sesiones-caja/activa');
  test.skip(!antes.data?.id, 'sin sesión activa en usagi-pruebas');
  const r = await caja.post('/sesiones-caja', { monto_inicial: '100.00' });
  expect(r.status, JSON.stringify(r.error)).toBe(409);
  expect((await caja.get('/sesiones-caja/activa')).data.id).toBe(antes.data.id);
});

test('abrir/cerrar: permisos y validaciones', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const cocina = await apiStaff('cocina');
  expect((await cocina.post('/sesiones-caja', { monto_inicial: '100.00' })).status).toBe(403);
  const s = (await cocina.get('/sesiones-caja/activa')).data;
  if (s?.id) expect((await cocina.post(`/sesiones-caja/${s.id}/cerrar`, { monto_final: '0' })).status).toBe(403);
  const caja = await apiStaff('caja');
  expect((await caja.post('/sesiones-caja/00000000-0000-4000-8000-000000000000/cerrar', { monto_final: '1.00' })).status).toBe(404);
  for (const m of ['-5', 'abc']) {
    const r = await caja.post('/sesiones-caja', { monto_inicial: m });
    expect(r.status, `monto_inicial ${m}`).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  }
  expect((await fetch(API_URL + '/sesiones-caja/activa')).status).toBe(401);
});

test('cobrar en efectivo: monto menor al total rechazado; cobro → cancelación devuelve exacto', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const admin = await apiStaff('admin');
  const { barra } = await productosMixtos(caja);
  const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e cajón', items: [{ producto_id: barra.id, cantidad: 2 }] });
  expect(p.status).toBe(201);
  const id = p.data.id;
  try {
    const poco = await caja.post(`/pedidos/${id}/cobros-efectivo`, { monto_recibido: (Number(p.data.total) - 1).toFixed(2), version_esperada: p.data.version });
    expect(poco.status, 'monto insuficiente').toBeGreaterThanOrEqual(400);
    expect(poco.status).toBeLessThan(500);
    const cur = await caja.get(`/pedidos/${id}`);
    const ok = await caja.post(`/pedidos/${id}/cobros-efectivo`, { monto_recibido: (Number(p.data.total) + 100).toFixed(2), version_esperada: cur.data.version });
    expect(ok.status, JSON.stringify(ok.error)).toBe(201);
    test.info().annotations.push({ type: 'cobro', description: JSON.stringify(ok.data).slice(0, 300) });
    const otro = await caja.post(`/pedidos/${id}/cobros-efectivo`, { monto_recibido: p.data.total, version_esperada: (await caja.get(`/pedidos/${id}`)).data.version });
    expect(otro.status, 'cobrar dos veces').toBeGreaterThanOrEqual(400);
    const v = (await admin.get(`/pedidos/${id}`)).data.version;
    const c = await admin.post(`/pedidos/${id}/cancelaciones`, { version_esperada: v, motivo: 'e2e cajón' });
    expect(c.status, JSON.stringify(c.error)).toBe(201);
    const txt = JSON.stringify(c.data);
    test.info().annotations.push({ type: 'cancelacion', description: txt.slice(0, 400) });
    expect(txt, 'la devolución no debe exceder el total').not.toContain((Number(p.data.total) + 100).toFixed(2));
  } finally {
    const a = await admin.get(`/pedidos/${id}`);
    if (a.data && !['cancelado', 'entregado'].includes(a.data.estado)) await admin.post(`/pedidos/${id}/cancelaciones`, { version_esperada: a.data.version });
  }
});

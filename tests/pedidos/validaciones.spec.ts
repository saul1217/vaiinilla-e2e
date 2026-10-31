import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff, cancelar, productosMixtos, transicion } from '../../helpers/api';

test.describe.configure({ mode: 'serial' });
const NULO = '00000000-0000-4000-8000-000000000000';

test('crear pedido: carrito vacío, cantidades inválidas y producto inexistente → 400', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const { cocina: pc } = await productosMixtos(caja);
  const base = { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e validaciones' };
  const casos: [string, unknown][] = [
    ['vacío', []], ['sin items', undefined], ['cantidad 0', [{ producto_id: pc.id, cantidad: 0 }]],
    ['cantidad -1', [{ producto_id: pc.id, cantidad: -1 }]], ['cantidad 1.5', [{ producto_id: pc.id, cantidad: 1.5 }]],
    ['cantidad enorme', [{ producto_id: pc.id, cantidad: 100000 }]], ['cantidad string', [{ producto_id: pc.id, cantidad: '2' }]],
    ['producto inexistente', [{ producto_id: NULO, cantidad: 1 }]], ['producto no uuid', [{ producto_id: 'x', cantidad: 1 }]],
  ];
  for (const [n, items] of casos) {
    const r = await caja.post('/pedidos', { ...base, items });
    if (r.data?.id) await cancelar(caja, r.data.id);
    expect.soft(r.status, `${n}: ${r.error?.code}`).toBe(400);
  }
  for (const [n, extra] of [['método inválido', { metodo_pago: 'bitcoin' }], ['destino inválido', { destino: 'luna' }]] as const) {
    const r = await caja.post('/pedidos', { ...base, ...extra, items: [{ producto_id: pc.id, cantidad: 1 }] });
    if (r.data?.id) await cancelar(caja, r.data.id);
    expect.soft(r.status, n).toBe(400);
  }
});

test('el total lo calcula el servidor (ignora precios enviados por el cliente)', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const { cocina: pc } = await productosMixtos(caja);
  const r = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e precio', total: 1, items: [{ producto_id: pc.id, cantidad: 2, precio: 1, precio_unitario: 1 }] });
  try {
    if (r.status === 400) return; // rechazar campos extra también es válido
    expect(r.status).toBe(201);
    expect(Number(r.data.total)).toBeGreaterThan(2);
  } finally { if (r.data?.id) await cancelar(caja, r.data.id); }
});

test('pedido inexistente o id inválido → 404, no 500', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  for (const id of [NULO, 'no-es-uuid', "1' OR '1'='1"]) {
    const r = await caja.get(`/pedidos/${encodeURIComponent(id)}`);
    expect.soft(r.status, id).toBe(404);
    const c = await caja.post(`/pedidos/${encodeURIComponent(id)}/cobros-efectivo`, { monto_recibido: 100, version_esperada: 1 });
    expect.soft(c.status, `cobro ${id}`).toBeLessThan(500);
  }
});

test('cobro: monto insuficiente rechazado; doble cobro concurrente → solo uno 201', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const admin = await apiStaff('admin');
  const { barra } = await productosMixtos(caja);
  const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e doble cobro', items: [{ producto_id: barra.id, cantidad: 1 }] });
  expect(p.status, JSON.stringify(p.error)).toBe(201);
  try {
    const bajo = await caja.post(`/pedidos/${p.data.id}/cobros-efectivo`, { monto_recibido: 0.01, version_esperada: p.data.version });
    expect(bajo.status, 'monto insuficiente').toBeGreaterThanOrEqual(400);
    const v = (await caja.get(`/pedidos/${p.data.id}`)).data.version;
    const rs = await Promise.all([1, 2, 3, 4].map(() => caja.post(`/pedidos/${p.data.id}/cobros-efectivo`, { monto_recibido: p.data.total, version_esperada: v })));
    const ok = rs.filter((r) => r.status === 201).length;
    expect(ok, rs.map((r) => `${r.status}:${r.error?.code ?? ''}`).join(' ')).toBe(1);
    for (const r of rs) if (r.status !== 201) expect(r.status).toBe(409);
  } finally { await cancelar(admin, p.data.id); }
});

test('entrega: sin pago → 409; doble entrega concurrente → solo una; QR incorrecto rechazado', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const cocina = await apiStaff('cocina');
  const admin = await apiStaff('admin');
  const { cocina: pc } = await productosMixtos(caja);
  const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e doble entrega', items: [{ producto_id: pc.id, cantidad: 1 }] });
  expect(p.status).toBe(201);
  const id = p.data.id;
  try {
    expect((await transicion(cocina, id, 'preparando')).status).toBe(201);
    expect((await transicion(cocina, id, 'listo')).status).toBe(201);
    const sinPago = await transicion(caja, id, 'entregado', { qr_token: p.data.qr_token });
    expect(sinPago.status).toBe(409);
    expect(sinPago.error?.code).toBe('ORDER_PAYMENT_PENDING');
    const a = await caja.get(`/pedidos/${id}`);
    expect((await caja.post(`/pedidos/${id}/cobros-efectivo`, { monto_recibido: a.data.total, version_esperada: a.data.version })).status).toBe(201);
    const malo = await transicion(caja, id, 'entregado', { qr_token: 'qr-falso-e2e' });
    expect.soft(malo.status, 'QR falso').toBeGreaterThanOrEqual(400);
    const v = (await admin.get(`/pedidos/${id}`)).data.version;
    const rs = await Promise.all([1, 2, 3].map(() => caja.post(`/pedidos/${id}/transiciones`, { estado_objetivo: 'entregado', version_esperada: v, qr_token: p.data.qr_token })));
    expect(rs.filter((r) => r.status === 201).length, rs.map((r) => `${r.status}:${r.error?.code ?? ''}`).join(' ')).toBe(1);
    const fin = await admin.get(`/pedidos/${id}`);
    expect(fin.data.estado).toBe('entregado');
    const tarde = await admin.post(`/pedidos/${id}/cancelaciones`, { version_esperada: fin.data.version });
    expect(tarde.status, 'cancelar después de entregado').toBeGreaterThanOrEqual(400);
  } finally { await cancelar(admin, id); }
});

test('cancelar: concurrente solo una vez; cancelado no se puede cobrar ni volver a cancelar', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const { barra } = await productosMixtos(caja);
  const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e cancelar', items: [{ producto_id: barra.id, cantidad: 1 }] });
  expect(p.status).toBe(201);
  const rs = await Promise.all([1, 2, 3].map(() => caja.post(`/pedidos/${p.data.id}/cancelaciones`, { version_esperada: p.data.version, motivo: 'e2e' })));
  expect(rs.filter((r) => r.status === 201).length, rs.map((r) => `${r.status}:${r.error?.code ?? ''}`).join(' ')).toBe(1);
  const admin = await apiStaff('admin');
  const c = await admin.get(`/pedidos/${p.data.id}`);
  expect(c.data.estado).toBe('cancelado');
  expect((await admin.post(`/pedidos/${p.data.id}/cobros-efectivo`, { monto_recibido: p.data.total, version_esperada: c.data.version })).status).toBeGreaterThanOrEqual(400);
  expect((await admin.post(`/pedidos/${p.data.id}/cancelaciones`, { version_esperada: c.data.version })).status).toBeGreaterThanOrEqual(400);
});

test('versión vieja (version_esperada) → 409, no sobrescribe', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const cocina = await apiStaff('cocina');
  const { cocina: pc } = await productosMixtos(caja);
  const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e version', items: [{ producto_id: pc.id, cantidad: 1 }] });
  try {
    expect((await transicion(cocina, p.data.id, 'preparando')).status).toBe(201);
    const viejo = await cocina.post(`/pedidos/${p.data.id}/transiciones`, { estado_objetivo: 'listo', version_esperada: p.data.version });
    expect(viejo.status).toBe(409);
  } finally { await cancelar(await apiStaff('admin'), p.data.id); }
});

test('contrato de visibilidad: caja deja de ver un pedido de cocina ya cobrado; admin y cocina sí', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const admin = await apiStaff('admin');
  const cocina = await apiStaff('cocina');
  const { cocina: pc } = await productosMixtos(caja);
  const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e visibilidad', items: [{ producto_id: pc.id, cantidad: 1 }] });
  try {
    expect((await caja.post(`/pedidos/${p.data.id}/cobros-efectivo`, { monto_recibido: p.data.total, version_esperada: p.data.version })).status).toBe(201);
    expect((await caja.get(`/pedidos/${p.data.id}`)).status).toBe(404); // CONTRACTS §6
    expect((await admin.get(`/pedidos/${p.data.id}`)).status).toBe(200);
    expect((await cocina.get(`/pedidos/${p.data.id}`)).status).toBe(200);
  } finally { await cancelar(admin, p.data.id); }
});

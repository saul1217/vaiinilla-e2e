import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff, transicion, productosMixtos } from '../../helpers/api';

test.describe.configure({ mode: 'serial' });

// Pedido mixto de mostrador en usagi-pruebas (develop). No toca banderas.
test('pedido mixto: preparando → listo → entrega bloqueada sin pago → cobro → entregado', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const cocina = await apiStaff('cocina');
  const { cocina: pc, barra: pb } = await productosMixtos(caja);

  const creado = await caja.post('/pedidos', {
    metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e mixto',
    items: [{ producto_id: pc.id, cantidad: 1 }, { producto_id: pb.id, cantidad: 1 }],
  });
  expect(creado.status, JSON.stringify(creado.error)).toBe(201);
  const id = creado.data.id;
  const qr = creado.data.qr_token;
  expect(creado.data.estado).toBe('por_cobrar');

  try {
    let r = await transicion(cocina, id, 'preparando');
    expect(r.status, JSON.stringify(r.error)).toBe(201);
    r = await transicion(cocina, id, 'listo');
    expect(r.status, JSON.stringify(r.error)).toBe(201);

    r = await transicion(caja, id, 'entregado', { qr_token: qr });
    expect(r.status).toBe(409);
    expect(r.error?.code).toBe('ORDER_PAYMENT_PENDING');

    const p = await caja.get(`/pedidos/${id}`);
    r = await caja.post(`/pedidos/${id}/cobros-efectivo`, { monto_recibido: p.data.total, version_esperada: p.data.version });
    expect(r.status, JSON.stringify(r.error)).toBe(201);

    r = await transicion(caja, id, 'entregado', { qr_token: qr });
    expect(r.status, JSON.stringify(r.error)).toBe(201);
    expect(r.data.estado).toBe('entregado');
  } finally {
    const fin = await caja.get(`/pedidos/${id}`);
    if (fin.data && !['entregado', 'cancelado'].includes(fin.data.estado))
      await caja.post(`/pedidos/${id}/cancelaciones`, { version_esperada: fin.data.version });
  }
});

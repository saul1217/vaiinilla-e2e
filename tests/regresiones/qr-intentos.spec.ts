import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff, productosMixtos, transicion, cancelar } from '../../helpers/api';

// B4: ¿hay tope de intentos de QR/código equivocados al entregar? Se anota sin tumbar CI.
test('QR equivocado repetido: nunca entrega y se anota si no hay rate limit (B4)', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  test.setTimeout(120_000);
  const caja = await apiStaff('caja');
  const admin = await apiStaff('admin');
  const { barra } = await productosMixtos(caja);
  const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e qr intentos', cobrar_ahora: true, items: [{ producto_id: barra.id, cantidad: 1 }] });
  expect(p.status).toBe(201);
  const id = p.data.id;
  try {
    const estados: number[] = [];
    const v = (await caja.get(`/pedidos/${id}`)).data?.version;
    test.info().annotations.push({ type: 'pedido', description: `estado=${p.data.estado} version=${v}` });
    for (let i = 0; i < 15; i++) {
      const r = await caja.post(`/pedidos/${id}/transiciones`, { estado_objetivo: 'entregado', version_esperada: v, qr_token: `qr-malo-${i}` });
      estados.push(r.status);
      if (i === 0) test.info().annotations.push({ type: 'primer intento', description: `${r.status} ${r.error?.code}` });
    }
    expect(estados.every((s) => s >= 400), estados.join(',')).toBe(true);
    expect((await caja.get(`/pedidos/${id}`)).data.estado).not.toBe('entregado');
    test.info().annotations.push({ type: estados.includes(429) ? 'B4 cerrado' : 'B4 abierto', description: `15 QR falsos → ${[...new Set(estados)].join(',')}` });
  } finally { await cancelar(admin, id); }
});

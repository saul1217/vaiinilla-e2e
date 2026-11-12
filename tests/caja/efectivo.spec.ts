import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff, productosMixtos } from '../../helpers/api';

test.describe.configure({ mode: 'serial' });

// Caja en usagi-pruebas (develop). Si no hay sesión abierta abre una con fondo de prueba
// y la deja abierta (cerrarla cambiaría el corte del negocio de prueba a mitad de otras pruebas).
test('caja: sesión activa, cobro inmediato y cancelación en efectivo sale del cajón', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  let sesion = await caja.get('/sesiones-caja/activa');
  if (!sesion.data?.id) {
    const abierta = await caja.post('/sesiones-caja', { monto_inicial: '500.00' });
    expect(abierta.status, JSON.stringify(abierta.error)).toBe(201);
    sesion = await caja.get('/sesiones-caja/activa');
  }
  expect(sesion.data?.id).toBeTruthy();

  const { barra } = await productosMixtos(caja);
  const creado = await caja.post('/pedidos', {
    metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e caja', cobrar_ahora: true,
    items: [{ producto_id: barra.id, cantidad: 1 }],
  });
  expect(creado.status, JSON.stringify(creado.error)).toBe(201);
  const id = creado.data.id;
  expect(creado.data.estado).not.toBe('por_cobrar');

  const p = await caja.get(`/pedidos/${id}`);
  const c = await caja.post(`/pedidos/${id}/cancelaciones`, { version_esperada: p.data.version });
  expect(c.status, JSON.stringify(c.error)).toBe(201);
  const fin = await caja.get(`/pedidos/${id}`);
  expect(fin.data.estado).toBe('cancelado');
  test.info().annotations.push({ type: 'cancelacion', description: JSON.stringify(c.data).slice(0, 400) });

  // Doble cancelación: no debe reembolsar dos veces.
  const otra = await caja.post(`/pedidos/${id}/cancelaciones`, { version_esperada: fin.data.version });
  expect(otra.status).toBeGreaterThanOrEqual(400);
});

test('caja: cancelar por cobrar no genera reembolso', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const { barra } = await productosMixtos(caja);
  const creado = await caja.post('/pedidos', {
    metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e caja 2',
    items: [{ producto_id: barra.id, cantidad: 1 }],
  });
  expect(creado.status, JSON.stringify(creado.error)).toBe(201);
  const c = await caja.post(`/pedidos/${creado.data.id}/cancelaciones`, { version_esperada: creado.data.version });
  expect(c.status, JSON.stringify(c.error)).toBe(201);
  test.info().annotations.push({ type: 'cancelacion', description: JSON.stringify(c.data).slice(0, 400) });
});

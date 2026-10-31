import { expect, test } from '@playwright/test';
import { CUENTAS, PASSWORD } from '../../helpers/app';
import { API_URL, apiStaff, apiStaffCon, NEGOCIO_PRUEBA, productosMixtos, cancelar } from '../../helpers/api';

// Stripe: no hay llaves de prueba en CI ni cuenta conectada en usagi-pruebas, así que no se
// puede completar un checkout. Probamos que el backend rechace intentos inválidos SIN cobrar.
const BASE = API_URL.replace(/\/api\/v1$/, '');

test('webhook de Stripe sin firma o con firma falsa → rechazado', async () => {
  const evento = JSON.stringify({ id: 'evt_e2e', type: 'payment_intent.succeeded', data: { object: { id: 'pi_falso', metadata: {} } } });
  for (const headers of <Record<string, string>[]>[{ 'Content-Type': 'application/json' }, { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=deadbeef' }]) {
    const r = await fetch(BASE + '/webhooks/stripe', { method: 'POST', headers, body: evento });
    expect(r.status, `webhook ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  }
});

test('pago/stripe: pedido inexistente 404, staff 403, sin token 401', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const cliente = await apiStaffCon(CUENTAS.admin!, PASSWORD!, NEGOCIO_PRUEBA, 'cliente');
  const caja = await apiStaff('caja');
  const uuid = '00000000-0000-4000-8000-000000000000';
  expect((await cliente.post(`/pedidos/${uuid}/pago/stripe`)).status).toBe(404);
  expect((await caja.post(`/pedidos/${uuid}/pago/stripe`)).status).toBe(403);
  const r = await fetch(`${API_URL}/pedidos/${uuid}/pago/stripe`, { method: 'POST' });
  expect(r.status).toBe(401);
});

test('pedido con tarjeta en negocio sin Stripe no queda pagado', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const admin = await apiStaff('admin');
  const cfg = await admin.get('/stripe/configuracion');
  test.skip(!!cfg.data?.charges_enabled, 'usagi-pruebas ya tiene Stripe activo; caso no aplica');
  const cliente = await apiStaffCon(CUENTAS.admin!, PASSWORD!, NEGOCIO_PRUEBA, 'cliente');
  const { barra } = await productosMixtos(admin);
  const r = await cliente.post('/pedidos', { metodo_pago: 'tarjeta', destino: 'para_llevar', items: [{ producto_id: barra.id, cantidad: 1 }] });
  try {
    if (r.status === 201) {
      expect(['pagado', 'entregado']).not.toContain(r.data.estado_pago ?? r.data.estado);
      expect(r.data.estado_pago ?? '').not.toBe('pagado');
    } else {
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }
  } finally { if (r.data?.id) await cancelar(admin, r.data.id); }
});

test('Stripe admin-only: onboarding/configuración/comisión → 403 para caja y cocina', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  for (const rol of ['caja', 'cocina'] as const) {
    const api = await apiStaff(rol);
    expect((await api.get('/stripe/configuracion')).status, rol).toBe(403);
    expect((await api.post('/stripe/onboarding', {})).status, rol).toBe(403);
    expect((await api.patch('/stripe/comision-al-cliente', { comision_al_cliente: true })).status, rol).toBe(403);
  }
});

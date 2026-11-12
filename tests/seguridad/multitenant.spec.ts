import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { Api, apiStaff, apiStaffCon, cancelar, productosMixtos } from '../../helpers/api';

// IDOR entre negocios (develop): un pedido de ci-vaiinilla no debe ser visible ni operable
// desde usagi-pruebas, y al revés. Necesita la cuenta admin de CI (OTRO_ADMIN_EMAIL/PASSWORD).
const OTRO_EMAIL = process.env.OTRO_ADMIN_EMAIL ?? process.env.CI_ADMIN_EMAIL;
const OTRO_PASS = process.env.OTRO_ADMIN_PASSWORD ?? process.env.CI_ADMIN_PASSWORD;
const OTRO_SLUG = process.env.OTRO_NEGOCIO_SLUG ?? 'ci-vaiinilla';

async function ataques(api: Api, id: string, total: number) {
  return {
    get: (await api.get(`/pedidos/${id}`)).status,
    cobro: (await api.post(`/pedidos/${id}/cobros-efectivo`, { monto_recibido: total, version_esperada: 1 })).status,
    transicion: (await api.post(`/pedidos/${id}/transiciones`, { estado_objetivo: 'preparando', version_esperada: 1 })).status,
    cancelar: (await api.post(`/pedidos/${id}/cancelaciones`, { version_esperada: 1 })).status,
    lista: JSON.stringify((await api.get('/pedidos')).data ?? []).includes(id),
  };
}

test('IDOR: staff de usagi-pruebas no ve ni opera pedidos de otro negocio (y viceversa)', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  test.skip(!OTRO_EMAIL || !OTRO_PASS, 'Falta OTRO_ADMIN_EMAIL/OTRO_ADMIN_PASSWORD (admin de ci-vaiinilla)');
  const otro = await apiStaffCon(OTRO_EMAIL!, OTRO_PASS!, OTRO_SLUG, 'admin');
  const admin = await apiStaff('admin');
  const caja = await apiStaff('caja');
  const cocina = await apiStaff('cocina');
  expect(otro.establecimientoId).not.toBe(admin.establecimientoId);

  const { barra: pbO } = await productosMixtos(otro);
  const ajeno = await otro.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e idor', items: [{ producto_id: pbO.id, cantidad: 1 }] });
  expect(ajeno.status, JSON.stringify(ajeno.error)).toBe(201);
  const { barra } = await productosMixtos(caja);
  const propio = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e idor', items: [{ producto_id: barra.id, cantidad: 1 }] });
  try {
    for (const [n, a] of [['admin', admin], ['caja', caja], ['cocina', cocina]] as const) {
      const r = await ataques(a, ajeno.data.id, ajeno.data.total);
      expect.soft(r.get, `${n} GET ajeno`).toBe(404);
      for (const k of ['cobro', 'transicion', 'cancelar'] as const) expect.soft([403, 404], `${n} ${k} ajeno = ${r[k]}`).toContain(r[k]);
      expect.soft(r.lista, `${n} ve el pedido ajeno en su lista`).toBe(false);
    }
    const r = await ataques(otro, propio.data.id, propio.data.total);
    expect.soft(r.get, 'otro negocio GET usagi').toBe(404);
    expect.soft([403, 404]).toContain(r.cancelar);
    // El pedido ajeno sigue intacto.
    const sigue = await otro.get(`/pedidos/${ajeno.data.id}`);
    expect(sigue.data.estado).toBe('por_cobrar');
    // Producto de otro negocio no se puede pedir desde usagi.
    const cruz = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', items: [{ producto_id: pbO.id, cantidad: 1 }] });
    if (cruz.data?.id) await cancelar(caja, cruz.data.id);
    expect.soft([400, 404, 422], `producto de otro negocio = ${cruz.status}`).toContain(cruz.status);
  } finally {
    await cancelar(otro, ajeno.data.id);
    if (propio.data?.id) await cancelar(admin, propio.data.id);
  }
});

test('IDOR: wallet de un usuario inexistente/ajeno → 404/403, no datos', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const caja = await apiStaff('caja');
  const r = await caja.get('/wallets/00000000-0000-4000-8000-000000000000');
  expect([403, 404]).toContain(r.status);
});

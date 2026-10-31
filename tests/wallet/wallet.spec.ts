import { expect, test } from '@playwright/test';
import { CUENTAS, PASSWORD } from '../../helpers/app';
import { apiStaff, apiStaffCon, NEGOCIO_PRUEBA } from '../../helpers/api';

test.describe.configure({ mode: 'serial' });
// Wallet en usagi-pruebas. El "cliente" es la cuenta admin de QA con membresía de cliente
// (saldo de prueba, no dinero real). Todo ajuste se revierte con el ajuste contrario.
async function clienteYId() {
  const cli = await apiStaffCon(CUENTAS.admin!, PASSWORD!, NEGOCIO_PRUEBA, 'cliente');
  const me = await cli.get('/wallets/me');
  expect(me.status).toBe(200);
  return { cli, id: me.data.cliente.usuario_id as string, saldo: Number(me.data.wallet.saldo) };
}

test('ajuste: solo admin; caja y cocina 403; cliente no puede verse ajeno', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const { cli, id } = await clienteYId();
  const body = { monto: '10.00', bucket: 'pagada', motivo: 'e2e permisos' };
  expect((await (await apiStaff('caja')).post(`/wallets/${id}/ajustes`, body)).status).toBe(403);
  expect((await (await apiStaff('cocina')).post(`/wallets/${id}/ajustes`, body)).status).toBe(403);
  expect((await cli.post(`/wallets/${id}/ajustes`, body)).status).toBe(403);
  expect((await cli.get('/wallets/00000000-0000-4000-8000-000000000000')).status).toBe(403);
  expect((await (await apiStaff('cocina')).get(`/wallets/${id}`)).status).toBe(403);
});

test('ajuste: validaciones (monto 0, bucket raro, sin motivo, motivo largo, uuid malo)', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const admin = await apiStaff('admin');
  const { id } = await clienteYId();
  for (const b of [
    { monto: '0', bucket: 'pagada', motivo: 'x' },
    { monto: 'abc', bucket: 'pagada', motivo: 'x' },
    { monto: '5', bucket: 'regalo', motivo: 'x' },
    { monto: '5', bucket: 'pagada', motivo: '' },
    { monto: '5', bucket: 'pagada', motivo: 'x'.repeat(241) },
  ]) expect((await admin.post(`/wallets/${id}/ajustes`, b)).status, JSON.stringify(b).slice(0, 80)).toBe(400);
  expect((await admin.post('/wallets/no-es-uuid/ajustes', { monto: '5', bucket: 'pagada', motivo: 'x' })).status).toBe(404);
});

test('ajuste: no deja el saldo negativo y el par +/- regresa al saldo original', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const admin = await apiStaff('admin');
  const { cli, id, saldo } = await clienteYId();
  const negativo = await admin.post(`/wallets/${id}/ajustes`, { monto: `-${(saldo + 1000).toFixed(2)}`, bucket: 'pagada', motivo: 'e2e negativo' });
  expect(negativo.status, JSON.stringify(negativo.error)).toBe(422);
  expect(negativo.error?.code).toBe('INSUFFICIENT_WALLET_BALANCE');
  const mas = await admin.post(`/wallets/${id}/ajustes`, { monto: '7.00', bucket: 'pagada', motivo: 'e2e +7' });
  expect(mas.status, JSON.stringify(mas.error)).toBe(201);
  try {
    expect(Number(mas.data.saldo_nuevo)).toBeCloseTo(saldo + 7, 2);
  } finally {
    const menos = await admin.post(`/wallets/${id}/ajustes`, { monto: '-7.00', bucket: 'pagada', motivo: 'e2e -7 (revierte)' });
    expect(menos.status, JSON.stringify(menos.error)).toBe(201);
  }
  expect(Number((await cli.get('/wallets/me')).data.wallet.saldo)).toBeCloseTo(saldo, 2);
});

test('ajuste: misma Idempotency-Key no duplica el movimiento', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const admin = await apiStaff('admin');
  const { cli, id, saldo } = await clienteYId();
  const key = crypto.randomUUID();
  const post = () => fetch(`${process.env.API_URL ?? 'https://vaiinillaback-development.up.railway.app/api/v1'}/wallets/${id}/ajustes`, {
    method: 'POST', headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ monto: '3.00', bucket: 'pagada', motivo: 'e2e idem' }),
  });
  const [a, b] = [await post(), await post()];
  try {
    expect(a.status).toBe(201);
    expect([200, 201, 409]).toContain(b.status);
    expect(Number((await cli.get('/wallets/me')).data.wallet.saldo)).toBeCloseTo(saldo + 3, 2);
  } finally {
    await admin.post(`/wallets/${id}/ajustes`, { monto: '-3.00', bucket: 'pagada', motivo: 'e2e idem revierte' });
  }
});

test('IDOR: admin de otro negocio no ve ni ajusta la wallet de usagi-pruebas', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const { id, saldo } = await clienteYId();
  const otro = await apiStaffCon(CUENTAS.admin!, PASSWORD!, 'cafe-pruebas', 'admin');
  const v = await otro.get(`/wallets/${id}`);
  expect([403, 404]).toContain(v.status);
  const a = await otro.post(`/wallets/${id}/ajustes`, { monto: '999.00', bucket: 'pagada', motivo: 'e2e idor' });
  if (a.status === 201) await otro.post(`/wallets/${id}/ajustes`, { monto: '-999.00', bucket: 'pagada', motivo: 'e2e idor revierte' });
  expect([403, 404]).toContain(a.status);
  const { saldo: despues } = await clienteYId();
  expect(despues).toBeCloseTo(saldo, 2);
});

test('pagar pedido con saldo insuficiente → rechazado, sin pedido pagado', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const { cli, saldo } = await clienteYId();
  const admin = await apiStaff('admin');
  const { data } = await admin.get('/catalogo');
  const caro = data.productos.filter((p: any) => p.disponible && !p.archivado && !(p.grupos_opcion ?? []).some((g: any) => (g.min_selecciones ?? 0) > 0))
    .sort((x: any, y: any) => Number(y.precio) - Number(x.precio))[0];
  const cantidad = Math.min(50, Math.ceil((saldo + 1) / Math.max(1, Number(caro.precio))) + 1);
  const r = await cli.post('/pedidos', { metodo_pago: 'saldo', destino: 'para_llevar', items: [{ producto_id: caro.id, cantidad }] });
  if (r.data?.id) await admin.post(`/pedidos/${r.data.id}/cancelaciones`, { version_esperada: r.data.version, motivo: 'e2e' });
  expect(r.status, JSON.stringify(r.error)).toBeGreaterThanOrEqual(400);
  expect(r.status).toBeLessThan(500);
  expect(Number((await cli.get('/wallets/me')).data.wallet.saldo)).toBeCloseTo(saldo, 2);
});

test('reglas de cashback: solo admin; valores inválidos → 400', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  expect((await (await apiStaff('caja')).post('/wallets/reglas-cashback', { porcentaje: 5 })).status).toBe(403);
  const admin = await apiStaff('admin');
  for (const b of [{ porcentaje: -5 }, { porcentaje: 1000 }, { porcentaje: 'mucho' }]) {
    const r = await admin.post('/wallets/reglas-cashback', b);
    expect(r.status, JSON.stringify(b)).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  }
});

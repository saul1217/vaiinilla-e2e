import { expect, test } from '@playwright/test';
import { CUENTAS, PASSWORD } from '../../helpers/app';
import { Api, apiStaffCon } from '../../helpers/api';

test.describe.configure({ mode: 'serial' });
// Reservas de cancha en padel-pruebas (develop). Siempre cancelamos lo que creamos.
const SLUG = 'padel-pruebas';
let admin: Api;
const creadas: string[] = [];
const dia = (n: number) => new Date(Date.now() + n * 86400e3).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const OFF = '-06:00';

test.beforeAll(async () => {
  if (!PASSWORD) return;
  admin = await apiStaffCon(CUENTAS.admin!, PASSWORD, SLUG, 'admin');
});
test.afterAll(async () => {
  for (const id of creadas) await admin?.post(`/reservas/${id}/cancelacion`, { motivo: 'e2e limpieza' });
});

async function cancha() {
  const d = await admin.get(`/reservas/disponibilidad?fecha=${dia(5)}`);
  expect(d.status).toBe(200);
  const c = d.data.canchas.find((x: any) => x.rentable);
  expect(c, 'padel-pruebas sin cancha rentable').toBeTruthy();
  return { id: c.espacio.id as number, precio: Number(c.precio_hora), cfg: d.data };
}

test('reservar, monto = precio_hora × duración, aparece ocupada, cancelar libera', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const { id, precio } = await cancha();
  const f = dia(5 + (Date.now() % 7));
  const r = await admin.post('/reservas', { espacio_id: id, inicio: `${f}T08:00:00${OFF}`, duracion_min: 90, nombre_cliente: 'e2e reserva' });
  expect(r.status, JSON.stringify(r.error)).toBe(201);
  creadas.push(r.data.id);
  expect(Number(r.data.monto)).toBeCloseTo(precio * 1.5, 2);
  expect(r.data.estado).toBe('pendiente_pago');
  const doble = await admin.post('/reservas', { espacio_id: id, inicio: `${f}T08:30:00${OFF}`, duracion_min: 90, nombre_cliente: 'e2e doble' });
  if (doble.data?.id) creadas.push(doble.data.id);
  expect(doble.status, 'doble reserva traslapada').toBe(409);
  expect(doble.error?.code).toBe('SLOT_TAKEN');
  const c = await admin.post(`/reservas/${r.data.id}/cancelacion`, { motivo: 'e2e' });
  expect(c.status).toBe(200);
  expect(c.data.estado).toBe('cancelada');
  const otra = await admin.post(`/reservas/${r.data.id}/cancelacion`, {});
  expect(otra.status, 'cancelar dos veces').toBeGreaterThanOrEqual(400);
  const libre = await admin.post('/reservas', { espacio_id: id, inicio: `${f}T08:30:00${OFF}`, duracion_min: 90, nombre_cliente: 'e2e libre' });
  expect(libre.status, 'tras cancelar el horario se libera').toBe(201);
  creadas.push(libre.data.id);
});

test('reservas concurrentes al mismo horario: solo una gana', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const { id } = await cancha();
  const f = dia(9);
  const rs = await Promise.all([1, 2, 3].map((i) => admin.post('/reservas', { espacio_id: id, inicio: `${f}T15:00:00${OFF}`, duracion_min: 90, nombre_cliente: `e2e carrera ${i}` })));
  rs.forEach((r) => r.data?.id && creadas.push(r.data.id));
  expect(rs.filter((r) => r.status === 201).length, rs.map((r) => `${r.status}:${r.error?.code ?? ''}`).join(' ')).toBe(1);
});

test('reglas: fuera de horario, pasado, fuera de rango, bloque, duración, espacio inválido', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const { id, cfg } = await cancha();
  const casos: [string, any, number, string?][] = [
    ['antes de abrir', { inicio: `${dia(3)}T05:00:00${OFF}`, duracion_min: 90 }, 422, 'OUTSIDE_BOOKING_HOURS'],
    ['termina después de cerrar', { inicio: `${dia(3)}T22:00:00${OFF}`, duracion_min: 360 }, 422, 'OUTSIDE_BOOKING_HOURS'],
    ['en el pasado', { inicio: `${dia(-2)}T10:00:00${OFF}`, duracion_min: 90 }, 422, 'RESERVATION_IN_PAST'],
    ['más allá de dias_adelanto', { inicio: `${dia(Number(cfg.dias_adelanto) + 3)}T10:00:00${OFF}`, duracion_min: 90 }, 422, 'DATE_OUT_OF_RANGE'],
    ['fuera de bloque', { inicio: `${dia(3)}T10:10:00${OFF}`, duracion_min: 90 }, 422, 'INVALID_SLOT'],
    ['duración no permitida', { inicio: `${dia(3)}T10:00:00${OFF}`, duracion_min: 45 }, 400],
    ['fecha sin zona', { inicio: `${dia(3)}T10:00:00`, duracion_min: 90 }, 400],
  ];
  for (const [nombre, b, st, code] of casos) {
    const r = await admin.post('/reservas', { espacio_id: id, nombre_cliente: 'e2e regla', ...b });
    if (r.data?.id) creadas.push(r.data.id);
    expect(r.status, `${nombre}: ${r.status} ${r.error?.code}`).toBe(st);
    if (code) expect(r.error?.code, nombre).toBe(code);
  }
  const noCancha = await admin.post('/reservas', { espacio_id: 99999999, inicio: `${dia(3)}T10:00:00${OFF}`, duracion_min: 90, nombre_cliente: 'e2e' });
  expect(noCancha.status).toBe(404);
});

test('permisos: cocina no reserva; caja no cambia configuración; otro negocio no ve la reserva', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const { id } = await cancha();
  const cocina = await apiStaffCon(CUENTAS.cocina!, PASSWORD!, SLUG, 'cocina');
  expect((await cocina.post('/reservas', { espacio_id: id, inicio: `${dia(4)}T10:00:00${OFF}`, duracion_min: 90 })).status).toBe(403);
  const caja = await apiStaffCon(CUENTAS.caja!, PASSWORD!, SLUG, 'cajero');
  expect((await caja.call('PUT', '/reservas/configuracion', { apertura: '00:00' })).status).toBe(403);
  const r = await admin.post('/reservas', { espacio_id: id, inicio: `${dia(11)}T12:00:00${OFF}`, duracion_min: 90, nombre_cliente: 'e2e idor' });
  expect(r.status, JSON.stringify(r.error)).toBe(201);
  creadas.push(r.data.id);
  const otro = await apiStaffCon(CUENTAS.admin!, PASSWORD!, 'usagi-pruebas', 'admin');
  const c = await otro.post(`/reservas/${r.data.id}/cancelacion`, {});
  expect([403, 404], 'cancelar reserva de otro negocio').toContain(c.status);
  const l = await otro.get('/reservas');
  expect(JSON.stringify(l.data ?? [])).not.toContain(r.data.id);
});

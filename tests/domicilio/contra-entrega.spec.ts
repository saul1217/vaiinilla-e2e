import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiCliente, apiStaff, CLIENTE_EMAIL, CLIENTE_PASSWORD, NEGOCIO_PRUEBA, productosMixtos } from '../../helpers/api';

test.describe.configure({ mode: 'serial' });

const FLAGS = ['reparto_activo', 'permite_contra_entrega'] as const;

// Solo usagi-pruebas. Enciende las banderas y las deja en false en el finally.
// El personal no puede crear pedidos a domicilio (403), así que hace falta un cliente verificado:
// QA_CLIENTE_EMAIL / QA_CLIENTE_PASSWORD. Sin ellos se salta.
test('domicilio: pago en la puerta y cancelar después va a devoluciones (no al cajón)', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  test.skip(!CLIENTE_EMAIL || !CLIENTE_PASSWORD, 'Falta QA_CLIENTE_EMAIL/QA_CLIENTE_PASSWORD (cliente verificado de usagi-pruebas)');
  const admin = await apiStaff('admin');
  const conf = await admin.get('/establecimiento/configuracion');
  expect(conf.data?.tienda_url ?? '').toContain(NEGOCIO_PRUEBA); // guarda: nunca otro negocio

  try {
    const on = await admin.patch('/establecimiento/configuracion', { reparto_activo: true, permite_contra_entrega: true });
    expect(on.status, JSON.stringify(on.error)).toBe(200);

    const cliente = await apiCliente();
    const { cocina } = await productosMixtos(admin);
    const creado = await cliente.post('/pedidos', {
      metodo_pago: 'efectivo', al_recibir: true, destino: 'a_domicilio',
      entrega: { direccion: 'Calle Prueba 123 (e2e)', telefono: '6140000000' },
      items: [{ producto_id: cocina.id, cantidad: 1 }],
    });
    expect(creado.status, JSON.stringify(creado.error)).toBe(201);
    const id = creado.data.id;
    expect(creado.data.estado).toBe('cobrado');

    let r = await admin.post(`/pedidos/${id}/en-camino`);
    expect(r.status, JSON.stringify(r.error)).toBe(201);
    r = await admin.post(`/pedidos/${id}/cobrar-entrega`, { metodo: 'efectivo' });
    expect(r.status, JSON.stringify(r.error)).toBe(201);
    r = await admin.post(`/pedidos/${id}/cobrar-entrega`, { metodo: 'efectivo' });
    expect(r.error?.code).toBe('NOTHING_TO_COLLECT');

    // B4: tope de intentos del código de entrega. Si no está arreglado, solo se documenta.
    let intentos = 0;
    for (; intentos < 6; intentos++) {
      const mal = await admin.post(`/pedidos/${id}/entregar-domicilio`, { codigo: '0000' });
      if (mal.status === 429 || mal.error?.code !== 'INVALID_DELIVERY_CODE') break;
    }
    console.log('B4:', intentos >= 6 ? 'sin tope' : `tope tras ${intentos}`);
    test.info().annotations.push({ type: 'B4', description: intentos >= 6 ? 'sin tope de intentos (B4 abierto)' : `tope tras ${intentos} intentos` });

    const p = await admin.get(`/pedidos/${id}`);
    const c = await admin.post(`/pedidos/${id}/cancelaciones`, { version_esperada: p.data.version });
    expect(c.status, JSON.stringify(c.error)).toBe(201);
    const devs = await (await apiStaff('caja')).get('/devoluciones');
    expect(JSON.stringify(devs.data)).toContain(id);
  } finally {
    const off = await admin.patch('/establecimiento/configuracion', { reparto_activo: false, permite_contra_entrega: false });
    expect(off.status, `no se pudieron restaurar ${FLAGS.join(', ')}`).toBe(200);
  }
});

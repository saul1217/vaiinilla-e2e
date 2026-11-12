import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff, productosMixtos, transicion, cancelar } from '../../helpers/api';

// Enciende barra_prepara solo en usagi-pruebas, recorre un pedido de barra y RESTAURA el valor previo.
test('barra_prepara encendida: pedido de barra pasa por preparando → listo y se restaura la bandera', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  test.setTimeout(120_000);
  const admin = await apiStaff('admin');
  const caja = await apiStaff('caja');
  const previo = (await admin.get('/establecimiento/configuracion')).data.barra_prepara;
  let id: string | undefined;
  try {
    const on = await admin.patch('/establecimiento/configuracion', { barra_prepara: true });
    expect(on.status, JSON.stringify(on.error)).toBe(200);
    const { barra } = await productosMixtos(caja);
    const p = await caja.post('/pedidos', { metodo_pago: 'efectivo', destino: 'para_llevar', nombre_cliente: 'e2e barra', cobrar_ahora: true, items: [{ producto_id: barra.id, cantidad: 1 }] });
    expect(p.status, JSON.stringify(p.error)).toBe(201);
    id = p.data.id;
    test.info().annotations.push({ type: 'estado inicial', description: p.data.estado });
    expect(['entregado', 'listo']).not.toContain(p.data.estado);
    const prep = await transicion(caja, id!, 'preparando');
    expect([201, 409]).toContain(prep.status);
    const listo = await transicion(caja, id!, 'listo');
    expect(listo.status, JSON.stringify(listo.error)).toBe(201);
    expect((await caja.get(`/pedidos/${id}`)).data.estado).toBe('listo');
  } finally {
    if (id) await cancelar(admin, id);
    await admin.patch('/establecimiento/configuracion', { barra_prepara: previo });
    expect((await admin.get('/establecimiento/configuracion')).data.barra_prepara, 'bandera restaurada').toBe(previo);
  }
});

test('cocina no puede cambiar banderas del negocio', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const cocina = await apiStaff('cocina');
  const r = await cocina.patch('/establecimiento/configuracion', { barra_prepara: true });
  expect(r.status).toBe(403);
});

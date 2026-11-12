import { expect, test } from '@playwright/test';
import { PASSWORD } from '../../helpers/app';
import { apiStaff, NEGOCIO_PRUEBA } from '../../helpers/api';

// Regresiones de QA reciente (PR 150/151/152). Solo lectura.
test('banderas de usagi-pruebas: barra_prepara apagada y existen las banderas nuevas', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const admin = await apiStaff('admin');
  const c = await admin.get('/establecimiento/configuracion');
  expect(c.status).toBe(200);
  expect(c.data.tienda_url ?? '').toContain(NEGOCIO_PRUEBA);
  expect(c.data.barra_prepara, 'barra_prepara debe estar apagada por defecto').toBe(false);
  for (const k of ['cocina_prepara_sin_cobrar', 'reparto_activo', 'permite_contra_entrega']) expect(typeof c.data[k], k).toBe('boolean');
});

test('PATCH de configuración rechaza tipos inválidos sin cambiar nada', async () => {
  test.skip(!PASSWORD, 'Falta QA_FIREBASE_DEV_PASSWORD');
  const admin = await apiStaff('admin');
  const antes = (await admin.get('/establecimiento/configuracion')).data;
  const r = await admin.patch('/establecimiento/configuracion', { reparto_activo: 'si', barra_prepara: 1 });
  const despues = (await admin.get('/establecimiento/configuracion')).data;
  if (r.status === 200) {
    // Si lo aceptó, al menos que no haya cambiado los valores: restaurar por si acaso.
    await admin.patch('/establecimiento/configuracion', { reparto_activo: antes.reparto_activo, barra_prepara: antes.barra_prepara });
  }
  expect(r.status).toBe(400);
  expect(despues.reparto_activo).toBe(antes.reparto_activo);
  expect(despues.barra_prepara).toBe(antes.barra_prepara);
});

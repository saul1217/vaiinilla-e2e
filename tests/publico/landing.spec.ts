import { test } from '@playwright/test';
import { capturarErrores, sinPantallaBlanca } from '../../helpers/app';

const RUTAS = ['/'];  // agregar aquí las páginas públicas nuevas

for (const ruta of RUTAS) {
  test(`landing ${ruta} carga sin pantalla blanca`, async ({ page }) => {
    const errores = capturarErrores(page);
    await page.goto(ruta);
    await sinPantallaBlanca(page, errores);
  });
}

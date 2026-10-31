import { expect, test } from '@playwright/test';
import { API_URL } from '../../helpers/api';

// Privacidad del directorio público (issue vaiinilla_back#162, hallazgo A1).
const decimales = (n: number) => (String(n).split('.')[1] ?? '').length;

test('directorio: reposterías visibles nunca exponen coordenada exacta (≤2 decimales)', async () => {
  for (const q of ['', '?lat=28.6353&lng=-106.0889']) {
    const r = await fetch(`${API_URL}/publico/establecimientos${q}`);
    expect(r.status).toBe(200);
    const lista: any[] = (await r.json()).data;
    for (const e of lista) {
      if (e.latitud == null) continue;
      if (e.tipo === 'reposteria') {
        expect(decimales(Number(e.latitud)), `${e.slug} latitud`).toBeLessThanOrEqual(2);
        expect(decimales(Number(e.longitud)), `${e.slug} longitud`).toBeLessThanOrEqual(2);
      }
    }
    for (const e of lista) for (const k of ['email', 'telefono_admin', 'stripe_account_id', 'propietario_id']) expect(e[k], `${e.slug}.${k}`).toBeUndefined();
  }
});

test('A1 (informativo): el orden por distancia usa la coordenada pública, no la exacta', async () => {
  // Si dos consultas a ~100 m dentro de la misma celda de 0.01° cambian el orden, el backend
  // ordena con la coordenada exacta (A1 abierto). Se anota sin tumbar CI hasta cerrar #162.
  const orden = async (lat: number, lng: number) => ((await (await fetch(`${API_URL}/publico/establecimientos?lat=${lat}&lng=${lng}`)).json()).data as any[]).map((e) => e.slug).join(',');
  const a = await orden(28.6341, -106.0881), b = await orden(28.6349, -106.0889);
  test.info().annotations.push({ type: a === b ? 'A1 sin señal' : 'A1 abierto', description: a === b ? 'orden estable dentro de la celda' : 'el orden cambia dentro de la misma celda pública' });
});

test('directorio: parámetros basura no rompen (sin 500)', async () => {
  for (const q of ['?lat=abc&lng=1', '?lat=999&lng=999', "?lat=1'--&lng=1", '?lat=NaN&lng=Infinity']) {
    const r = await fetch(`${API_URL}/publico/establecimientos${q}`);
    expect(r.status, q).toBeLessThan(500);
  }
});

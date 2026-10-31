import { randomUUID } from 'node:crypto';
import { STAFF_URL } from '../playwright.config';
import { CUENTAS, PASSWORD, Rol } from './app';

// Solo develop. El config ya bloquea dominios de producción.
export const API_URL = process.env.API_URL ?? 'https://vaiinillaback-development.up.railway.app/api/v1';
if (/vaiinillaback-production|api\.vaiinilla\.app/.test(API_URL)) throw new Error('API de producción bloqueada');
export const NEGOCIO_PRUEBA = process.env.QA_NEGOCIO_SLUG ?? 'usagi-pruebas';

let apiKeyCache: string | undefined;
/** La llave web de Firebase es pública (va en el bundle de develop); la leemos de ahí para no versionarla. */
async function firebaseKey(): Promise<string> {
  if (process.env.FIREBASE_WEB_API_KEY) return process.env.FIREBASE_WEB_API_KEY;
  if (apiKeyCache) return apiKeyCache;
  const html = await (await fetch(STAFF_URL)).text();
  const pend = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  const vistos = new Set<string>();
  while (pend.length && vistos.size < 60) {
    const u = new URL(pend.shift()!, STAFF_URL).href;
    if (vistos.has(u)) continue;
    vistos.add(u);
    const js = await (await fetch(u)).text();
    const k = js.match(/AIza[0-9A-Za-z_-]{35}/);
    if (k) return (apiKeyCache = k[0]);
    for (const m of js.matchAll(/["'`](?:\.\/|\/assets\/)?([\w.-]+\.js)["'`]/g)) pend.push('/assets/' + m[1]);
  }
  throw new Error('No encontré la llave web de Firebase en el bundle de develop');
}

export async function firebaseIdToken(email: string, password = PASSWORD!): Promise<string> {
  const key = await firebaseKey();
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: STAFF_URL + '/' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`Firebase login ${email}: ${j?.error?.message}`);
  return j.idToken;
}

export type Resp = { status: number; data: any; error: any };

export class Api {
  constructor(public token: string, public rol: string, public establecimientoId: string) {}

  async call(method: string, path: string, body?: unknown, idem = true): Promise<Resp> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
    if (idem && method !== 'GET') h['Idempotency-Key'] = randomUUID();
    const r = await fetch(API_URL + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    let j: any = {};
    try { j = await r.json(); } catch { /* sin cuerpo */ }
    return { status: r.status, data: j?.data, error: j?.error };
  }
  get(p: string) { return this.call('GET', p); }
  post(p: string, b: unknown = {}) { return this.call('POST', p, b); }
  patch(p: string, b: unknown) { return this.call('PATCH', p, b); }
}

/** Login de staff contra la API de develop, siempre en el negocio de prueba. */
export async function apiStaff(rol: Rol): Promise<Api> {
  const idToken = await firebaseIdToken(CUENTAS[rol]!);
  const h = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
  const acc: any = await (await fetch(`${API_URL}/sesiones/accesos`, { headers: h })).json();
  const lista: any[] = acc?.data ?? [];
  const m = lista.find((a) => JSON.stringify(a).includes(NEGOCIO_PRUEBA)) ;
  if (!m) throw new Error(`${rol} no tiene acceso a ${NEGOCIO_PRUEBA}`);
  const r = await fetch(`${API_URL}/sesiones/contexto`, { method: 'POST', headers: h, body: JSON.stringify({ membresia_id: m.membresia_id ?? m.id }) });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`contexto ${rol}: ${r.status} ${j?.error?.code}`);
  const d = j.data;
  return new Api(d.access_token, d.rol ?? d.contexto?.rol ?? rol, d.contexto?.establecimiento_id ?? d.establecimiento_id ?? m.establecimiento_id);
}

/** Un producto de cocina y uno de barra/caja, disponibles y sin opciones obligatorias. */
export async function productosMixtos(api: Api) {
  const { data } = await api.get('/catalogo');
  const ok = (p: any) => p.disponible && !p.archivado && !(p.grupos_opcion ?? []).some((g: any) => (g.min_selecciones ?? 0) > 0);
  const cocina = data.productos.find((p: any) => ok(p) && p.estacion_preparacion === 'cocina' && !p.dias_preparacion);
  const barra = data.productos.find((p: any) => ok(p) && p.estacion_preparacion === 'caja' && !p.dias_preparacion);
  if (!cocina || !barra) throw new Error('usagi-pruebas sin productos de cocina y caja disponibles');
  return { cocina, barra };
}

/** Avanza un pedido releyendo la versión actual. */
export async function transicion(api: Api, id: string, estado: string, extra: Record<string, unknown> = {}) {
  const actual = await api.get(`/pedidos/${id}`);
  return api.post(`/pedidos/${id}/transiciones`, { estado_objetivo: estado, version_esperada: actual.data.version, ...extra });
}

export async function cancelar(api: Api, id: string) {
  const actual = await api.get(`/pedidos/${id}`);
  if (!actual.data || ['cancelado', 'entregado'].includes(actual.data.estado)) return actual;
  return api.post(`/pedidos/${id}/cancelaciones`, { version_esperada: actual.data.version, motivo: 'e2e limpieza' });
}

export const CLIENTE_EMAIL = process.env.QA_CLIENTE_EMAIL;
export const CLIENTE_PASSWORD = process.env.QA_CLIENTE_PASSWORD;

/** Cliente verificado en el negocio de prueba (contexto-cliente). */
export async function apiCliente(): Promise<Api> {
  const idToken = await firebaseIdToken(CLIENTE_EMAIL!, CLIENTE_PASSWORD!);
  const r = await fetch(`${API_URL}/sesiones/contexto-cliente`, {
    method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ establecimiento_slug: NEGOCIO_PRUEBA }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`contexto-cliente: ${r.status} ${j?.error?.code} ${JSON.stringify(j?.error?.details ?? '')}`);
  return new Api(j.data.access_token, 'cliente', j.data.contexto?.establecimiento_id);
}

# vaiinilla-e2e

Pruebas E2E con Playwright para **vaiinilla**: la landing pública y el panel del equipo (Caja, Cocina, admin).

**Solo develop. Nunca producción.** La configuración se niega a correr si alguna URL apunta a `vaiinilla.app`, `www.vaiinilla.app` o `app.vaiinilla.app`.

| Ambiente | URL |
|---|---|
| Landing develop | `https://sand-user.vaiinilla.app` (`LANDING_URL`) |
| Panel develop | `https://dev.vaiinilla.app` (`STAFF_URL`) |

## Correr local

```bash
npm install
npx playwright install chromium
export QA_FIREBASE_DEV_PASSWORD='...'   # nunca la subas al repo
npm test            # todo
npm run test:publico
npm run test:staff
```

Cuentas (Firebase develop `vaiinilla-b3a70`, negocio usagi-pruebas), sobrescribibles con variables:
`QA_ADMIN_EMAIL`, `QA_CAJA_EMAIL`, `QA_COCINA_EMAIL` (por defecto `saul.admin|caja|cocina@kakaowin.garden`).
Sin `QA_FIREBASE_DEV_PASSWORD` las pruebas de login se saltan.

## Estructura

- `tests/publico/` landing
- `tests/staff/` login y pantallas del panel
- `tests/publico/` landing: rutas, `robustez.spec.ts` (404, consola sin errores, sin llamadas/URLs de producción, enlaces internos rotos, móvil 375px)
- `tests/staff/` login, pantallas, `auth.spec.ts` (contraseña incorrecta, 401 sin token, logout, sesión borrada, guardas de rutas por rol en la UI)
- `tests/pedidos/` flujo mixto y `validaciones.spec.ts` (carrito vacío, cantidades inválidas, total calculado en servidor, 404 sin 500, doble cobro/entrega/cancelación concurrente, entrega sin pago 409, QR falso, versión vieja 409, contrato de visibilidad de caja)
- `tests/caja/` cobro en efectivo
- `tests/domicilio/` contra entrega: cobro en puerta → cancelar → devolución pendiente; anota B4 (sin tope de intentos del código). **Restaura el valor previo** de `reparto_activo`/`permite_contra_entrega`.
- `tests/seguridad/` `roles-api.spec.ts` (403 por rol), `multitenant.spec.ts` (IDOR contra ci-vaiinilla, necesita `OTRO_ADMIN_EMAIL/PASSWORD`), `clientes.spec.ts` (mínimo de caracteres, tope 20, correo enmascarado; B1 rate limit informativo)
- `tests/regresiones/` banderas (`barra_prepara` apagada, tipos inválidos en PATCH → 400)

Hallazgos conocidos que se anotan sin tumbar CI: B1 (sin rate limit en búsqueda de clientes), B4 (sin tope de intentos en código de entrega), fallback `https://app.vaiinilla.app` en el bundle de landing develop.

Reglas para flujos: solo en usagi-pruebas, encender banderas solo ahí y restaurarlas al terminar (finally), cuentas sin saldo real.

## CI

- `e2e.yml`: corre en push/PR a `main` y `develop`. Secretos: `QA_FIREBASE_DEV_PASSWORD`, `QA_CLIENTE_EMAIL/PASSWORD` (domicilio), `OTRO_ADMIN_EMAIL/PASSWORD` (IDOR, admin de ci-vaiinilla). Sin ellos esas pruebas se saltan.
- `claude.yml`: menciona `@claude` en un issue o comentario; trabaja sobre `develop`. Secreto: `CLAUDE_CODE_OAUTH_TOKEN`.

## Suites (develop, negocio usagi-pruebas)

| carpeta | qué prueba |
| --- | --- |
| `publico/` | Landing: 11 rutas sin pantalla blanca ni errores JS, sin enlaces a `vaiinilla.app` de producción; menú de usagi-pruebas |
| `staff/` | Login admin/caja/cocina y recorrido de las pantallas de `/app/*` por rol |
| `pedidos/` | Pedido mixto: preparando → listo → entrega bloqueada (409 `ORDER_PAYMENT_PENDING`) → cobro → entregado |
| `caja/` | Sesión de caja activa (la abre si falta), cobro inmediato + cancelación, doble cancelación rechazada |
| `domicilio/` | Enciende `reparto_activo` y `permite_contra_entrega` solo en usagi-pruebas, pago en la puerta, cancelación → devolución pendiente; apaga banderas en `finally`. Documenta B4 (tope de intentos del código) |

Secretos: `QA_FIREBASE_DEV_PASSWORD` (staff) y `QA_CLIENTE_EMAIL`/`QA_CLIENTE_PASSWORD` (cliente para domicilio). Sin ellos, los tests se saltan.

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

## Suites nuevas (ronda 3)

| carpeta | qué prueba |
| --- | --- |
| `pagos/stripe.spec.ts` | Webhook sin firma / firma falsa → 4xx; `pago/stripe` 404/403/401; pedido con tarjeta en negocio sin Stripe no queda pagado; endpoints de Stripe solo admin |
| `wallet/wallet.spec.ts` | Ajustes solo admin (caja/cocina/cliente 403); validaciones (monto 0, bucket, motivo); nunca saldo negativo (422 `INSUFFICIENT_WALLET_BALANCE`); par +/- restaura saldo; Idempotency-Key no duplica; IDOR desde cafe-pruebas; pagar con saldo insuficiente; reglas de cashback solo admin y rechazo de valores inválidos |
| `reservas/padel.spec.ts` | padel-pruebas: reservar (monto = precio×duración), traslape 409 `SLOT_TAKEN`, carrera de 3 → solo 1, cancelar libera y no se cancela dos veces, fuera de horario/pasado/fuera de rango/bloque/duración/sin zona, permisos e IDOR. Cancela todo en `afterAll` |
| `caja/sesiones.spec.ts` | Doble apertura → 409 sin cambiar la sesión; cocina no abre/cierra; cerrar id inexistente 404; montos inválidos; cobro insuficiente rechazado; doble cobro rechazado; cancelación tras cobro con cambio no devuelve más del total |
| `cocina/barra.spec.ts` (proyecto `banderas`) | Enciende `barra_prepara`, pedido de barra pasa por preparando → listo, **restaura el valor previo**; cocina no puede cambiar banderas. Corre después de `staff` para no interferir |
| `staff/panel-admin.spec.ts` | Admin recorre menú, pedidos, cashback, flujo, espacios, invitaciones, configuración, reportes, POS, cocina: sin pantalla blanca, sin pantalla de error, sin errores JS, sin `console.error`, sin peticiones ni enlaces a producción |
| `publico/directorio.spec.ts` | Reposterías del directorio nunca con más de 2 decimales de coordenada; sin campos privados; parámetros basura sin 500; A1 informativo (orden por coordenada exacta, issue back#162) |
| `regresiones/qr-intentos.spec.ts` | 15 QR falsos al entregar: nunca entrega; anota B4 (hoy: todos 422, sin 429) |

## Huecos conocidos (no cubribles hoy)

- **Checkout real de Stripe**: no hay llaves de prueba de Stripe en CI ni cuenta conectada en usagi-pruebas. Solo se prueba que el backend rechace pagos inválidos sin cobrar. Para cubrirlo: llaves `sk_test`/`pk_test` en develop + cuenta Connect de prueba.
- **Cobrar sin sesión de caja abierta / cierre de caja**: todos los negocios de prueba tienen la sesión abierta y cerrarla cambia el corte compartido. Se necesita un negocio de prueba exclusivo para e2e.
- **Cashback ganado al pagar un pedido**: requiere cobrar un pedido real con regla activa y luego revertir el abono; pendiente de un negocio dedicado.
- **App iOS / staff nativa**: Playwright solo cubre web. Requiere XCUITest/Detox o Maestro.
- **B1** (sin rate limit en búsqueda de clientes), **B4** (sin tope de intentos de QR/código) y **A1** (#162) siguen abiertos y se anotan sin tumbar CI.

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

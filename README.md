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
- `tests/pedidos/`, `tests/caja/`, `tests/domicilio/` flujos (por agregar)

Reglas para flujos: solo en usagi-pruebas, encender banderas solo ahí y restaurarlas al terminar (finally), cuentas sin saldo real.

## CI

- `e2e.yml`: corre en push/PR a `main` y `develop`. Secreto: `QA_FIREBASE_DEV_PASSWORD`.
- `claude.yml`: menciona `@claude` en un issue o comentario; trabaja sobre `develop`. Secreto: `CLAUDE_CODE_OAUTH_TOKEN`.

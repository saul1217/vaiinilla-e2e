import { defineConfig, devices } from '@playwright/test';

// Solo develop. Nunca apuntar a producción.
export const LANDING_URL = process.env.LANDING_URL ?? 'https://sand-user.vaiinilla.app';
export const STAFF_URL = process.env.STAFF_URL ?? 'https://dev.vaiinilla.app';

for (const u of [LANDING_URL, STAFF_URL]) {
  const host = new URL(u).hostname;
  if (['vaiinilla.app', 'www.vaiinilla.app', 'app.vaiinilla.app'].includes(host)) {
    throw new Error(`Bloqueado: ${u} es producción. Este repo solo corre contra develop.`);
  }
}

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'] },
  projects: [
    { name: 'publico', testMatch: /publico\/.*\.spec\.ts/, use: { baseURL: LANDING_URL } },
    { name: 'staff', testMatch: /(staff|pedidos|caja|domicilio|seguridad|regresiones)\/.*\.spec\.ts/, use: { baseURL: STAFF_URL } },
  ],
});

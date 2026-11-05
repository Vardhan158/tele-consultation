/* global process */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'live.webrtc.spec.js',
  timeout: 60_000,
  use: { baseURL: 'https://127.0.0.1:5173', ignoreHTTPSErrors: true },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'https://127.0.0.1:5173',
    reuseExistingServer: false,
    ignoreHTTPSErrors: true,
    env: { ...process.env, VITE_HTTPS: '1', VITE_API_BASE_URL: 'https://127.0.0.1:8443' },
  },
  projects: [{ name: 'chromium-live', use: { ...devices['Desktop Chrome'], permissions: ['camera', 'microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } } }],
});

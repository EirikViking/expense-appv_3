import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:5199',
        trace: 'off',
        screenshot: 'off',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: [
        {
            command: 'pnpm dev:worker',
            port: 8788,
            timeout: 30000,
            reuseExistingServer: !process.env.CI,
        },
        {
            command: 'pnpm dev:web',
            port: 5199,
            timeout: 30000,
            reuseExistingServer: !process.env.CI,
        },
    ],
});

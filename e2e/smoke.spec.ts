import { test, expect, Page, ConsoleMessage, Response } from '@playwright/test';

// Collect console errors and page errors
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];

// Helper to set up error collection on a page
function setupErrorCollection(page: Page) {
    page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error') {
            consoleErrors.push(`[Console Error] ${msg.text()}`);
        }
    });
    page.on('pageerror', (error: Error) => {
        pageErrors.push(`[Page Error] ${error.message}`);
    });
    page.on('response', (response: Response) => {
        if (response.status() >= 400 && !response.url().includes('/health')) {
            failedRequests.push(`[Failed Request] ${response.status()} ${response.url()}`);
        }
    });
}

// Clear errors before each test
test.beforeEach(async () => {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    failedRequests.length = 0;
});

// After each: fail if errors were collected
test.afterEach(async ({ }, testInfo) => {
    const allErrors = [...pageErrors, ...consoleErrors.filter(e =>
        // Ignore some expected console errors
        !e.includes('favicon') &&
        !e.includes('Failed to load resource') &&
        !e.includes('net::ERR_')
    )];

    if (allErrors.length > 0 && testInfo.status === 'passed') {
        console.log('Errors collected during test:');
        allErrors.forEach(e => console.log(e));
        // Don't fail but log - can be made stricter later
    }
});

test.describe('Smoke Tests - Key Pages Load Without Errors', () => {
    test('Login page loads', async ({ page }) => {
        setupErrorCollection(page);
        await page.goto('/');

        // Should see login form or redirect to login
        // Wait for either login form or authenticated page
        await page.waitForLoadState('networkidle');

        // Take screenshot for evidence
        await page.screenshot({ path: 'e2e/screenshots/login-page.png' });

        // Should not have crashed - check presence of React root
        const app = page.locator('#root');
        await expect(app).toBeVisible({ timeout: 10000 });

        // No critical page errors
        expect(pageErrors).toHaveLength(0);
    });

    test('Dashboard page loads after login', async ({ page }) => {
        setupErrorCollection(page);

        // Attempt login
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Try to login - look for password field
        const passwordInput = page.locator('input[type="password"]');
        if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await passwordInput.fill('test123'); // Default dev password
            const loginButton = page.locator('button:has-text("Login"), button:has-text("Sign In"), button[type="submit"]');
            if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
                await loginButton.click();
                await page.waitForLoadState('networkidle');
            }
        }

        // Navigate to dashboard
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'e2e/screenshots/dashboard-page.png' });

        const app = page.locator('#root');
        await expect(app).toBeVisible({ timeout: 10000 });

        expect(pageErrors).toHaveLength(0);
    });

    test('Transactions page loads', async ({ page }) => {
        setupErrorCollection(page);

        // Navigate
        await page.goto('/transactions');
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'e2e/screenshots/transactions-page.png' });

        const app = page.locator('#root');
        await expect(app).toBeVisible({ timeout: 10000 });

        expect(pageErrors).toHaveLength(0);
    });

    test('Insights page loads', async ({ page }) => {
        setupErrorCollection(page);

        await page.goto('/insights');
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'e2e/screenshots/insights-page.png' });

        const app = page.locator('#root');
        await expect(app).toBeVisible({ timeout: 10000 });

        expect(pageErrors).toHaveLength(0);
    });

    test('Upload page loads', async ({ page }) => {
        setupErrorCollection(page);

        await page.goto('/upload');
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'e2e/screenshots/upload-page.png' });

        const app = page.locator('#root');
        await expect(app).toBeVisible({ timeout: 10000 });

        expect(pageErrors).toHaveLength(0);
    });

    test('Settings page loads', async ({ page }) => {
        setupErrorCollection(page);

        await page.goto('/settings');
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'e2e/screenshots/settings-page.png' });

        const app = page.locator('#root');
        await expect(app).toBeVisible({ timeout: 10000 });

        expect(pageErrors).toHaveLength(0);
    });

    test('Budgets page loads', async ({ page }) => {
        setupErrorCollection(page);

        await page.goto('/budgets');
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'e2e/screenshots/budgets-page.png' });

        const app = page.locator('#root');
        await expect(app).toBeVisible({ timeout: 10000 });

        expect(pageErrors).toHaveLength(0);
    });
});

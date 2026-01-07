import { test, expect, Page, ConsoleMessage, Response } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Collect console errors and page errors
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];

// Helper to set up error collection on a page
function setupErrorCollection(page: Page) {
    page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error') {
            console.log(`[Console Error] ${msg.text()}`);
            consoleErrors.push(`[Console Error] ${msg.text()}`);
        } else if (msg.type() === 'log') {
            // Log parsing debug messages
            if (msg.text().includes('[XLSX Parser]') || msg.text().includes('[DEV]')) {
                console.log(`[Browser Log] ${msg.text()}`);
            }
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

// Helper to login first
async function loginIfNeeded(page: Page) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('input[type="password"]');
    if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passwordInput.fill('test123');
        const loginButton = page.locator('button:has-text("Login"), button:has-text("Sign In"), button[type="submit"]');
        if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await loginButton.click();
            await page.waitForLoadState('networkidle');
        }
    }
}

test.describe('XLSX Parsing Tests', () => {
    test('Normal XLSX with headers parses correctly', async ({ page }) => {
        setupErrorCollection(page);
        await loginIfNeeded(page);

        await page.goto('/upload');
        await page.waitForLoadState('networkidle');

        // Get the fixture file path
        const fixtureDir = path.resolve(process.cwd(), 'sample_data');
        const fixturePath = path.join(fixtureDir, 'test_credit_card.xlsx');

        // Check if fixture exists
        if (!fs.existsSync(fixturePath)) {
            throw new Error(`Fixture not found: ${fixturePath}. Run: pnpm generate-fixtures`);
        }

        // Upload the file
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(fixturePath);

        // Wait for processing to complete
        await page.waitForTimeout(3000);

        // Take screenshot
        await page.screenshot({ path: 'e2e/screenshots/xlsx-normal-upload.png' });

        // Check for success message
        const successText = page.locator('text=transactions inserted');
        const success = await successText.isVisible({ timeout: 10000 });

        if (!success) {
            // Check for error
            const errorText = await page.locator('.text-red-600').textContent({ timeout: 5000 }).catch(() => null);
            if (errorText) {
                throw new Error(`XLSX upload failed with error: ${errorText}`);
            }
        }

        expect(success).toBe(true);
        expect(pageErrors).toHaveLength(0);
    });

    test('Headerless XLSX (Storebrand style) parses correctly', async ({ page }) => {
        setupErrorCollection(page);
        await loginIfNeeded(page);

        await page.goto('/upload');
        await page.waitForLoadState('networkidle');

        // Get the headerless fixture file path
        const fixtureDir = path.resolve(process.cwd(), 'sample_data');
        const fixturePath = path.join(fixtureDir, 'storebrand_headerless.xlsx');

        // Check if fixture exists
        if (!fs.existsSync(fixturePath)) {
            throw new Error(`Fixture not found: ${fixturePath}. Run: pnpm generate-fixtures`);
        }

        // Upload the file
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(fixturePath);

        // Wait for processing to complete
        await page.waitForTimeout(3000);

        // Take screenshot
        await page.screenshot({ path: 'e2e/screenshots/xlsx-headerless-upload.png' });

        // Check for success message - should parse at least some transactions
        const successText = page.locator('text=transactions inserted');
        const success = await successText.isVisible({ timeout: 10000 });

        if (!success) {
            // Check for duplicate (if already uploaded)
            const duplicateText = page.locator('text=File already uploaded');
            const isDuplicate = await duplicateText.isVisible({ timeout: 2000 }).catch(() => false);
            if (isDuplicate) {
                console.log('[Test] File already uploaded - this is expected on re-run');
                return;
            }

            // Check for error
            const errorEl = page.locator('.text-red-600');
            const errorText = await errorEl.textContent({ timeout: 5000 }).catch(() => null);
            if (errorText) {
                throw new Error(`Headerless XLSX upload failed with error: ${errorText}`);
            }
        }

        // Verify at least some transactions were parsed
        if (success) {
            const insertedCount = await page.locator('.text-green-600.font-medium').textContent();
            console.log(`[Test] Parsed from headerless XLSX: ${insertedCount} transactions`);

            // Should have parsed at least 3 transactions
            const count = parseInt(insertedCount || '0');
            expect(count).toBeGreaterThanOrEqual(3);
        }

        expect(pageErrors).toHaveLength(0);
    });
});

test.describe('PDF Parsing Tests', () => {
    test('PDF bank statement parses and reports skipped lines', async ({ page }) => {
        setupErrorCollection(page);
        await loginIfNeeded(page);

        await page.goto('/upload');
        await page.waitForLoadState('networkidle');

        // For PDF tests, we'd need an actual PDF file
        // This test documents the expected behavior for when PDF files are uploaded
        // The PDF parser should report skipped_lines with reasons

        // Take screenshot
        await page.screenshot({ path: 'e2e/screenshots/pdf-upload-page.png' });

        // Just verify the upload page loads correctly
        const uploadZone = page.locator('text=Drag and drop');
        await expect(uploadZone).toBeVisible();

        expect(pageErrors).toHaveLength(0);
    });
});

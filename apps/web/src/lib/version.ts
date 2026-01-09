// Version information - auto-updated during build
export const VERSION = '1.1.0';

// These are replaced at build time by Vite define
// Using 'as string' to avoid TS narrowing issues
declare const __BUILD_TIME__: string;
declare const __GIT_COMMIT__: string;

export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();
export const GIT_COMMIT: string = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'local';
const API_URL_STORAGE_KEY = 'expense_api_url';
const PAGES_PROJECT_HOST_SUFFIX = '.expense-appv-3.pages.dev';
const DEFAULT_API_URL = 'https://expense-api.cromkake.workers.dev';

// Get display version string
export function getVersionString(): string {
    const commit = GIT_COMMIT.startsWith('__') ? 'dev' : GIT_COMMIT.slice(0, 7);
    return `v${VERSION} (${commit}) - Built: ${BUILD_TIME}`;
}

export function getStoredApiUrl(): string | null {
    try {
        return localStorage.getItem(API_URL_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function setStoredApiUrl(url: string): void {
    try {
        localStorage.setItem(API_URL_STORAGE_KEY, url);
    } catch {
        // Ignore storage errors
    }
}

function getAutoDetectedApiUrl(): string {
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    if (host === 'expense-appv-3.pages.dev' || host.endsWith(PAGES_PROJECT_HOST_SUFFIX)) {
        return DEFAULT_API_URL;
    }
    return '';
}

// Get API base URL
export function getApiBaseUrl(): string {
    if (import.meta.env.DEV) return '/api';
    const storedUrl = getStoredApiUrl();
    if (storedUrl) return storedUrl;
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) return envUrl;
    return getAutoDetectedApiUrl();
}

// Check if API URL is configured properly
export function isApiUrlConfigured(): boolean {
    if (import.meta.env.DEV) return true; // Dev mode uses proxy
    const storedUrl = getStoredApiUrl();
    if (storedUrl) {
        return storedUrl.startsWith('http');
    }
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) return envUrl.startsWith('http');
    const autoUrl = getAutoDetectedApiUrl();
    return autoUrl.startsWith('http');
}

// Version information - auto-updated during build
export const VERSION = '1.1.0';

// These are replaced at build time by Vite define
// Using 'as string' to avoid TS narrowing issues
declare const __BUILD_TIME__: string;
declare const __GIT_COMMIT__: string;

export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();
export const GIT_COMMIT: string = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'local';

// Get display version string
export function getVersionString(): string {
    const commit = GIT_COMMIT.startsWith('__') ? 'dev' : GIT_COMMIT.slice(0, 7);
    return `v${VERSION} (${commit}) - Built: ${BUILD_TIME}`;
}

// Get API base URL with logging
export function getApiBaseUrl(): string {
    const apiUrl = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '');
    console.log(`API_BASE_URL=${apiUrl}`);
    return apiUrl;
}

// Check if API URL is configured properly
export function isApiUrlConfigured(): boolean {
    if (import.meta.env.DEV) return true; // Dev mode uses proxy
    const apiUrl = import.meta.env.VITE_API_URL;
    return Boolean(apiUrl && apiUrl.startsWith('http'));
}

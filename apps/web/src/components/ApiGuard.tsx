import { AlertTriangle, ExternalLink } from 'lucide-react';
import { isApiUrlConfigured, getApiBaseUrl, getVersionString } from '@/lib/version';

/**
 * API Configuration Guard Screen
 * Shows a visible error when VITE_API_URL is missing or invalid in production
 */
export function ApiGuardScreen() {
    const apiUrl = getApiBaseUrl();
    const versionString = getVersionString();

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
            <div className="max-w-lg w-full space-y-8 text-center">
                {/* Error Icon */}
                <div className="flex justify-center">
                    <div className="p-4 bg-red-500/20 rounded-full border-2 border-red-500/40">
                        <AlertTriangle className="h-16 w-16 text-red-500" />
                    </div>
                </div>

                {/* Error Title */}
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold text-white">
                        API Configuration Error
                    </h1>
                    <p className="text-gray-400 text-lg">
                        The application cannot connect to the backend API
                    </p>
                </div>

                {/* Error Details */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-left space-y-4">
                    <div>
                        <label className="text-gray-500 text-sm">API_BASE_URL</label>
                        <code className="block mt-1 bg-gray-900 text-red-400 p-3 rounded font-mono text-sm break-all">
                            {apiUrl || '(not set)'}
                        </code>
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                        <h3 className="text-white font-medium mb-2">How to fix:</h3>
                        <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
                            <li>Set <code className="bg-gray-900 px-1 py-0.5 rounded text-yellow-400">VITE_API_URL</code> in Cloudflare Pages environment variables</li>
                            <li>The value should be the Worker URL (e.g., <code className="bg-gray-900 px-1 py-0.5 rounded text-green-400">https://expense-api.{'{your-subdomain}'}.workers.dev</code>)</li>
                            <li>Redeploy the Pages site to apply the change (env vars are baked at build time)</li>
                        </ol>
                    </div>
                </div>

                {/* Debug Info */}
                <div className="text-gray-600 text-xs space-y-1">
                    <p>{versionString}</p>
                    <p>Environment: {import.meta.env.MODE}</p>
                </div>

                {/* Docs Link */}
                <a
                    href="https://developers.cloudflare.com/pages/configuration/environment-variables/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                >
                    Cloudflare Pages Environment Variables Documentation
                    <ExternalLink className="h-4 w-4" />
                </a>
            </div>
        </div>
    );
}

/**
 * Wrapper component that shows guard screen if API is not configured
 */
export function withApiGuard<P extends object>(
    WrappedComponent: React.ComponentType<P>
): React.FC<P> {
    return function ApiGuardedComponent(props: P) {
        if (!isApiUrlConfigured()) {
            return <ApiGuardScreen />;
        }
        return <WrappedComponent {...props} />;
    };
}

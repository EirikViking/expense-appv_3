import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const GIT_COMMIT = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || 'local';
const BUILD_TIME = new Date().toISOString();

// Build-time guard plugin that fails if Node crypto is imported
function cryptoImportGuard(): Plugin {
  const forbiddenPatterns = [
    /from\s+["']crypto["']/,
    /from\s+["']node:crypto["']/,
    /require\s*\(\s*["']crypto["']\s*\)/,
    /require\s*\(\s*["']node:crypto["']\s*\)/,
    /import\s+\*\s+as\s+crypto/,
    /import\s+crypto\s+from/,
  ];

  const scanDirectory = (dir: string, violations: string[]): void => {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') {
          scanDirectory(fullPath, violations);
        }
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        // Skip the crypto-shim file itself
        if (entry.name === 'crypto-shim.ts') continue;

        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(content)) {
            violations.push(`${fullPath}: matches ${pattern}`);
          }
        }
      }
    }
  };

  return {
    name: 'crypto-import-guard',
    buildStart() {
      const violations: string[] = [];

      // Scan apps/web/src
      scanDirectory(path.resolve(__dirname, 'src'), violations);

      // Scan packages/shared/src
      const sharedPath = path.resolve(__dirname, '../../packages/shared/src');
      scanDirectory(sharedPath, violations);

      if (violations.length > 0) {
        throw new Error(
          `\n\n❌ CRYPTO IMPORT GUARD FAILED!\n\n` +
          `Found forbidden Node crypto imports:\n` +
          violations.map(v => `  - ${v}`).join('\n') +
          `\n\nUse globalThis.crypto and crypto.subtle instead.\n\n`
        );
      }

      console.log('✅ Crypto import guard passed - no Node crypto imports found');
    },
  };
}

function buildMetadataAsset(commit: string): Plugin {
  return {
    name: 'build-metadata-asset',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build.txt',
        source: `${commit}\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    cryptoImportGuard(),
    buildMetadataAsset(GIT_COMMIT),
    react(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Alias Node crypto to our shim that throws a clear error
      'crypto': path.resolve(__dirname, './src/crypto-shim.ts'),
      'node:crypto': path.resolve(__dirname, './src/crypto-shim.ts'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      // Ensure crypto is treated as external and aliased, not polyfilled
      external: [],
    },
  },
  optimizeDeps: {
    exclude: ['crypto', 'node:crypto'],
  },
  define: {
    // Ensure no Node.js globals are polyfilled
    global: 'globalThis',
    // Inject build-time values (these get replaced in the bundle)
    '__BUILD_TIME__': JSON.stringify(BUILD_TIME),
    '__GIT_COMMIT__': JSON.stringify(GIT_COMMIT),
  },
});

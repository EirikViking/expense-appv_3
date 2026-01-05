/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_DEV_LOGS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

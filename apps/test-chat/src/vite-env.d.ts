/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BALEYUI_API_KEY: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

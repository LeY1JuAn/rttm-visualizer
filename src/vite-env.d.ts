/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly BASE_URL: string
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv
  glob: (pattern: string, options?: { as?: 'raw' | 'url' | 'string'; eager?: boolean }) => Record<string, any>
}

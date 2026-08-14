/// <reference types="vite/client" />

/**
 * `import.meta.env` icin tip tanimi. Vite yalnizca `VITE_` onekli degiskenleri
 * istemciye acar; buraya yazilan her alan .env.example'da da bulunmali.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

// Declaramos las VITE_* del proyecto para poder accederlas con notacion de
// punto: el tsconfig usa noPropertyAccessFromIndexSignature.
interface ImportMetaEnv {
  /** URL base del backend Express (sin barra final). Ej: http://localhost:3001 */
  readonly VITE_API_URL?: string;
  /** "true" = usar datos simulados en vez de pegarle al backend. */
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

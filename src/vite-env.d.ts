/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SSV_SUBGRAPH_API_KEY?: string;
  readonly VITE_SSV_SUBGRAPH_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

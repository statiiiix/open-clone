import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      // The tokenizer is ESM-only, so it is bundled; onnxruntime-node stays external (native binary).
      externalizeDeps: { exclude: ['@huggingface/tokenizers'] },
      rollupOptions: { input: { index: resolve('src/main/index.ts'), worker: resolve('src/engine/worker.ts') } },
    },
  },
  preload: {
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } },
  },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
    plugins: [
      react(),
      {
        // The strict policy blocks the dev server's hot-reload script, so it applies to built files only.
        name: 'csp-in-builds-only',
        transformIndexHtml: (html, ctx) => (ctx.server ? html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '') : html),
      },
    ],
  },
});

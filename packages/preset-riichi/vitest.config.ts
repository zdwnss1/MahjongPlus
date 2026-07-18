import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mahjongplus/world-model': path('../world-model/src/index.ts'),
      '@mahjongplus/world-language': path('../world-language/src/index.ts'),
      '@mahjongplus/world-runtime': path('../world-runtime/src/index.ts'),
    },
  },
});

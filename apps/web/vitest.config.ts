import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['src/test/**', '**/*.d.ts', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@baleyui/db': path.resolve(__dirname, '../../packages/db/src'),
      '@baleyui/db/types': path.resolve(__dirname, '../../packages/db/src/types'),
      // Deep imports into @baleybots/tools DSL (not in package exports map)
      '@baleybots/tools/dsl/lexer': path.resolve(__dirname, '../../packages/baleybots/typescript/packages/tools/dist/esm/baleybots-dsl-v2/lexer.js'),
      '@baleybots/tools/dsl/parser': path.resolve(__dirname, '../../packages/baleybots/typescript/packages/tools/dist/esm/baleybots-dsl-v2/parser.js'),
    },
  },
});

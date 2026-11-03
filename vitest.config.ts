import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/**/*.test.{ts,tsx}'], environment: 'node', testTimeout: 20000, coverage: { provider: 'v8', include: ['packages/*/src/**/*.{ts,tsx}'], exclude: ['**/*.test.*'] } } });

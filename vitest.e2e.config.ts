import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/e2e/**/*.test.ts'],
    // Each test file runs sequentially to avoid DB race conditions
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // E2E tests are slow — give them room
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // No setup files — E2E tests own their own state
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})

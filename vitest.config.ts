import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/__tests__/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Minimum coverage thresholds — enforced on CI
      thresholds: {
        lines:     70,
        functions: 70,
        branches:  60,
        statements: 70,
      },
      // Prioritise critical domains over uniform global coverage
      include: [
        'src/lib/auth/**',
        'src/lib/credits/**',
        'src/lib/security/**',
        'src/lib/agents/**',
        'src/lib/contracts/**',
        'src/lib/jobs/**',
        'src/app/api/**',
      ],
      exclude: [
        'src/__tests__/**',
        'src/app/(auth)/**',
        'src/app/dashboard/**',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})

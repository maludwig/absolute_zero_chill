// Fast config: node-only tests, no DOM. Excludes *.dom.test.{js,jsx}.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: { BUILD_TIME: JSON.stringify('test') },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['**/node_modules/**', '**/*.dom.test.{js,jsx}'],
    setupFiles: ['./test-setup.js'],
    css: false,
  },
})

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // App.jsx references BUILD_TIME as a bare global (injected by the real build).
  define: { BUILD_TIME: JSON.stringify('test') },
  test: {
    environment: 'node',
    globals: true,
    // *.dom.test.{js,jsx} opt in to jsdom via the @vitest-environment docblock comment.
    include: ['src/**/*.test.{js,jsx}', 'src/**/*.dom.test.{js,jsx}'],
    setupFiles: ['./test-setup.js'],
    css: false,
  },
})

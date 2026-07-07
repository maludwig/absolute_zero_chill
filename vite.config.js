import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Build timestamp injected in place of the old Jinja {{ build_time }}.
const BUILD_TIME = new Date()
  .toISOString()
  .replace('T', '_')
  .replace(/:/g, '-')
  .slice(0, 19)

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    // App.jsx references BUILD_TIME as a bare global (was a Jinja var before).
    BUILD_TIME: JSON.stringify(BUILD_TIME),
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000, // inline everything
    cssCodeSplit: false,          // one CSS blob, inlined into each page
    rollupOptions: {
      input: { game: 'index.html' },
    },
  },
})

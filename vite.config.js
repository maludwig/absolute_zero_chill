import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Build timestamp, shown in the footer.
const BUILD_TIME = new Date()
  .toISOString()
  .replace('T', '_')
  .replace(/:/g, '-')
  .slice(0, 19)

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    // App.jsx references BUILD_TIME as a bare global.
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

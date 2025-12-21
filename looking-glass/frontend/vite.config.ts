import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import nodeBackendPlugin from './vite-plugin-deno-backend'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    nodeBackendPlugin(),
    tailwindcss(),
    react(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import denoBackendPlugin from './vite-plugin-deno-backend'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    denoBackendPlugin(),
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

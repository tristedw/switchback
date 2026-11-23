import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is relative so the same build works at / on the pi and at /switchback/ on tristedw.ca
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/live': { target: 'ws://localhost:8787', ws: true },
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: 'node',
  },
})

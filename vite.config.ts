import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/learninnews/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    open: true,
  },
})

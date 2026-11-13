import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: process.env.VITE_HTTPS === '1' ? {
    https: {
      key: fs.readFileSync(path.resolve('../backend/.certs/localhost-key.pem')),
      cert: fs.readFileSync(path.resolve('../backend/.certs/localhost.pem')),
    },
  } : undefined,
})

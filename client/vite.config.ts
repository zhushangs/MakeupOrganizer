import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build output goes straight into the backend's wwwroot, so only one .NET process is needed at runtime
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/MakeupOrganizer.Api/wwwroot',
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:5080',
      '/images': 'http://localhost:5080',
    },
  },
})

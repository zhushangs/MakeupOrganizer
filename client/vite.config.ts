import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build output goes into server/MakeupOrganizer.Api/wwwroot, which the Cloudflare Worker serves (worker/wrangler.toml).
// The ASP.NET Core server around it is legacy; only this folder is still used.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/MakeupOrganizer.Api/wwwroot',
    emptyOutDir: true,
  },
  server: {
    host: true,
    proxy: {
      // the Worker running locally (`npm run dev` in worker/)
      '/api': 'http://localhost:8787',
      '/images': 'http://localhost:8787',
    },
  },
})

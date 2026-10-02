import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 构建产物直接放进后端的 wwwroot，运行时只需要一个 .NET 进程
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

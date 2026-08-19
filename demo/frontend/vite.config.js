import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 로컬에서 dev 서버 포트/백엔드 프록시 대상을 바꾸려면 .env.local에
// VITE_DEV_PORT, VITE_API_HOST, VITE_API_PORT를 설정 (git에 안 올라감)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = `http://${env.VITE_API_HOST || '10.23.128.46'}:${env.VITE_API_PORT || 8086}`

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      global: 'globalThis',
    },
    server: {
      host: true,
      port: Number(env.VITE_DEV_PORT) || 5173,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/ws': { target: apiTarget, changeOrigin: true, ws: true },
      }
    }
  }
})
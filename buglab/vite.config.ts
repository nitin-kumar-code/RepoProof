import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
      proxy: { '/api': env.VITE_BUGLAB_API_PROXY || 'http://127.0.0.1:4317' },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  }
})

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

function blockArtifactRequests(request: { url?: string }, response: { statusCode: number; end: (body?: string) => void }, next: () => void): void {
  let isArtifactPath: boolean
  try {
    const firstSegment = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname.split('/')[1] ?? '')
    isArtifactPath = firstSegment.toLowerCase() === 'artifacts'
  } catch {
    response.statusCode = 400
    response.end('Bad request')
    return
  }
  if (isArtifactPath) {
    response.statusCode = 404
    response.end('Not found')
    return
  }
  next()
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), {
      name: 'buglab-private-artifacts',
      configureServer(server) {
        server.middlewares.use(blockArtifactRequests)
      },
      configurePreviewServer(server) {
        server.middlewares.use(blockArtifactRequests)
      },
    }],
    server: {
      host: process.env.BUGLAB_WEB_HOST || '127.0.0.1',
      allowedHosts: ['host.docker.internal'],
      port: Number(process.env.BUGLAB_WEB_PORT || 4173),
      strictPort: true,
      fs: { deny: ['artifacts/**'] },
      proxy: { '/api': env.VITE_BUGLAB_API_PROXY || 'http://127.0.0.1:4317' },
    },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  }
})

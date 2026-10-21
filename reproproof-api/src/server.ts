import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env'
import { bugsRouter } from './routes/bugs'
import { runsRouter } from './routes/runs'
import { recoverInterruptedRuns, startRunWorker } from './services/run-service'

const app = express()

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: (origin, callback) => {
  if (!origin) return callback(null, false)
  if (env.CORS_ORIGIN && origin === env.CORS_ORIGIN) return callback(null, true)
  const localDevelopmentOrigin = env.APP_ENV === 'development'
    && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  return callback(null, localDevelopmentOrigin)
} }))
app.use(express.json({ limit: '1mb' }))
app.use('/api/bugs', bugsRouter)
app.use('/api/runs', runsRouter)

app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

void recoverInterruptedRuns().then(() => startRunWorker()).catch(cause => {
  console.error('Could not recover interrupted browser runs:', cause)
}).finally(() => {
  app.listen(env.PORT, () => {
    console.log(`Reproproof API listening on http://localhost:${env.PORT}`)
  })
})

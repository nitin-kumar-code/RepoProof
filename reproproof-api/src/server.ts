import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { env } from './config/env'
import { bugsRouter } from './routes/bugs'

const app = express()

app.disable('x-powered-by')
app.use(helmet())
app.use(cors(env.CORS_ORIGIN ? { origin: env.CORS_ORIGIN } : undefined))
app.use(express.json({ limit: '1mb' }))
app.use('/api/bugs', bugsRouter)

app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(env.PORT, () => {
  console.log(`Reproproof API listening on http://localhost:${env.PORT}`)
})

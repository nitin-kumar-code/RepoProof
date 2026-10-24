import 'dotenv/config'
import { createBugLabApp } from './routes.js'

const host = process.env.BUGLAB_HOST || '127.0.0.1'
const port = Number(process.env.BUGLAB_PORT || 4317)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BUGLAB_PORT must be a valid TCP port')
if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
  throw new Error('BugLab only binds to loopback. Put a separately authenticated, network-restricted proxy in front of it for staging.')
}

const app = createBugLabApp()
app.listen(port, host, () => console.log(`BugLab API listening on http://${host}:${port}`))

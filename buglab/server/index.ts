import 'dotenv/config'
import { createBugLabApp } from './routes.js'

const host = process.env.BUGLAB_HOST || '127.0.0.1'
const port = Number(process.env.PORT || process.env.BUGLAB_PORT || 4317)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BUGLAB_PORT must be a valid TCP port')
const publicDeployment = process.env.BUGLAB_PUBLIC_DEPLOYMENT === 'true'
if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !(publicDeployment && host === '0.0.0.0')) {
  throw new Error('BugLab may bind publicly only when BUGLAB_PUBLIC_DEPLOYMENT=true and the destructive approval credentials are configured.')
}
if (publicDeployment && (process.env.APP_ENV !== 'production'
  || !process.env.BUGLAB_APPROVAL_USERNAME
  || process.env.BUGLAB_APPROVAL_USERNAME.includes(':')
  || !process.env.BUGLAB_APPROVAL_PASSWORD
  || process.env.BUGLAB_APPROVAL_PASSWORD.length < 12)) {
  throw new Error('Public BugLab deployment requires APP_ENV=production and valid server-side approval credentials.')
}

const app = createBugLabApp(undefined, Date.now, {
  approvalUsername: process.env.BUGLAB_APPROVAL_USERNAME,
  approvalPassword: process.env.BUGLAB_APPROVAL_PASSWORD,
})
app.listen(port, host, () => console.log(`BugLab API listening on http://${host}:${port}`))

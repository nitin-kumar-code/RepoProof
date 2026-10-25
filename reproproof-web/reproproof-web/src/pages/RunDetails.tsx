import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CircleAlert, RotateCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getRun } from '../api/runs'
import PlanApproval from '../components/runs/PlanApproval'
import PassportReport from '../components/evidence/PassportReport'
import type { RunRecord } from '../types/run'

export default function RunDetails() {
  const { id = '' } = useParams()
  const [retryCount, setRetryCount] = useState(0)
  const [state, setState] = useState<{ id: string; run: RunRecord | null; error: string }>({ id: '', run: null, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ id, run: null, error: '' })
    void getRun(id, controller.signal).then(result => {
      if (!controller.signal.aborted) setState({ id, run: result, error: '' })
    }).catch(cause => {
      if (controller.signal.aborted) return
      const message = cause instanceof Error ? cause.message : 'Could not load this run.'
      const friendlyMessage = /run_not_found|requested report, run, or evidence was not found/i.test(message)
        ? 'This ID is a demo fixture and is not a run saved by the connected API. Open Test Runs and choose a current run.'
        : /failed to fetch|networkerror|fetch failed/i.test(message)
        ? 'The ReproProof API could not be reached. Start the API service and try again.'
        : message
      setState({ id, run: null, error: friendlyMessage })
    })
    return () => controller.abort()
  }, [id, retryCount])

  const error = state.id === id ? state.error : ''
  const run = state.id === id ? state.run : null
  const updateRun = useCallback((updated: RunRecord) => {
    setState(current => ({ ...current, run: updated }))
  }, [])

  return <div className="page run-detail">
    <div className="back-link"><Link to="/runs"><ArrowLeft size={15} />Back to runs</Link></div>
    {error ? <section className="run-load-state run-load-state-error" role="alert">
      <div className="run-load-icon"><CircleAlert size={22} /></div>
      <div className="run-load-copy">
        <span className="eyebrow">RUN DETAILS UNAVAILABLE</span>
        <h1>We couldn’t load this run</h1>
        <p>{error}</p>
        <div className="run-load-meta"><span>Run ID</span><code>{id || 'Not provided'}</code></div>
        <Link className="secondary-button" to="/runs">Open Test Runs</Link>
        <button className="primary-button" type="button" onClick={() => setRetryCount(count => count + 1)}>
          <RotateCw size={15} />Try again
        </button>
      </div>
    </section>
      : !run ? <section className="run-load-state" role="status">
        <div className="run-load-copy"><span className="eyebrow">RUN DETAILS</span><h1>Loading run plan…</h1><p>Fetching the run record from the ReproProof API.</p></div>
      </section>
        : <>
          <div className="run-title-row"><div><div className="eyebrow">TEST RUN / {run.id}</div><h1>Reproduction plan</h1><p>Bug report {run.bugReportId} · Chromium · Created {new Date(run.createdAt).toLocaleString()}</p></div></div>
          <div className="run-detail-grid"><div className="run-main-column"><PlanApproval run={run} onUpdated={updateRun} /></div><aside className="run-side-column"><PassportReport run={run} /></aside></div>
        </>}
  </div>
}

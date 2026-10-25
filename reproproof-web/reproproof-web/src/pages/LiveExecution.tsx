import { useEffect, useState } from 'react'
import { ArrowLeft, Camera, CircleAlert, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getRun } from '../api/runs'
import type { RunRecord } from '../types/run'

export default function LiveExecution() {
  const { id = '' } = useParams()
  const [run, setRun] = useState<RunRecord | null>(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setRun(null)
    setError('')
    void getRun(id, controller.signal).then(result => {
      if (!controller.signal.aborted) setRun(result)
    }).catch(cause => {
      if (controller.signal.aborted) return
      const message = cause instanceof Error ? cause.message : 'Could not load execution status.'
      setError(/run_not_found|requested report, run, or evidence was not found/i.test(message)
        ? 'This ID is a demo fixture and is not a run saved by the connected API. Open Test Runs and choose a current run.'
        : /failed to fetch|networkerror|fetch failed/i.test(message)
          ? 'The ReproProof API could not be reached. Start the API service and try again.'
          : message)
    })
    return () => controller.abort()
  }, [id, refreshKey])

  if (error) return <main className="page execution-reference-page">
    <section className="run-load-state run-load-state-error" role="alert">
      <div className="run-load-icon"><CircleAlert size={22}/></div>
      <div className="run-load-copy">
        <span className="eyebrow">EXECUTION DETAILS UNAVAILABLE</span>
        <h1>We couldn’t load this run</h1>
        <p>{error}</p>
        <div className="run-load-meta"><span>Run ID</span><code>{id || 'Not provided'}</code></div>
        <Link className="secondary-button" to="/runs"><ArrowLeft size={15}/>Open Test Runs</Link>
        <button className="primary-button" type="button" onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={15}/>Try again</button>
      </div>
    </section>
  </main>

  if (!run) return <main className="page execution-reference-page"><section className="run-load-state" role="status"><div className="run-load-copy"><span className="eyebrow">LIVE EXECUTION</span><h1>Loading run…</h1><p>Fetching the persisted run record from the ReproProof API.</p></div></section></main>

  const verdict = run.status === 'failed' ? 'Infrastructure failure' : run.execution?.result.replaceAll('_', ' ') ?? 'No verdict yet'
  const artifacts = run.execution?.evidenceRecords ?? []

  return <main className="page execution-reference-page">
    <div className="execution-header-card">
      <div><div className="execution-breadcrumb"><Link to={`/runs/${encodeURIComponent(run.id)}`}>{run.id}</Link> / Live Execution</div><h1>Live Execution Monitor</h1><p>{run.plan.summary}</p><div className="execution-tags"><span>● {run.status.replaceAll('_', ' ').toUpperCase()}</span><span>{run.browser}</span><span>{verdict}</span></div></div>
      <div className="execution-header-actions"><button onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={14}/>Refresh</button><Link to={`/evidence/${encodeURIComponent(run.id)}`}><Camera size={15}/>View Evidence Passport</Link></div>
    </div>
    {run.execution?.error && <div className="error-banner" role="alert"><CircleAlert size={15}/>{run.execution.error}</div>}
    <section className="execution-reference-grid">
      <div className="execution-primary-column">
        <section className="browser-monitor-card"><div className="browser-monitor-top"><div><i/><i/><i/><b>Approved plan</b></div><span>{run.plan.steps.length} actions</span></div><ol className="execution-plan-list">{run.plan.steps.map(step=><li key={step.stepOrder}><b>{step.stepOrder}. {step.instruction}</b><small>{step.clarification ?? step.rationale}</small></li>)}</ol><div className="browser-monitor-foot"><span>Run state: {run.status.replaceAll('_', ' ')}</span><span>Verdict: {verdict}</span></div></section>
      </div>
      <aside className="execution-side-column"><section className="execution-side-card"><div className="execution-side-heading"><h2>Evidence artifacts</h2><span>{artifacts.length}</span></div>{artifacts.map(file=><article className="attempt-preview" key={file.id}><div><b>{file.type}</b><span>Attempt {file.attemptNumber}</span></div><Link to={`/evidence/${encodeURIComponent(run.id)}`}>{file.storageKey.split('/').pop()}</Link></article>)}{artifacts.length === 0 && <p>No evidence files have been saved for this run.</p>}<Link to={`/evidence/${encodeURIComponent(run.id)}`}>Open evidence passport</Link></section><section className="execution-side-card"><div className="execution-side-heading"><h2>Run state</h2><span>{run.status}</span></div><p>{run.execution?.error ?? 'Status is read from the persisted API run record.'}</p><small>Updated {new Date(run.updatedAt).toLocaleString()}</small></section></aside>
    </section>
  </main>
}

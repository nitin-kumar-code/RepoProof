import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Camera, CircleAlert, Code2, Link as LinkIcon, RefreshCw, ShieldAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getRun } from '../api/runs'
import { baseUrl } from '../api/client'
import type { RunRecord } from '../types/run'

function active(run: RunRecord): boolean {
  return run.status === 'running' || run.status === 'verifying'
    || run.status === 'approved' && run.progress?.phase === 'queued'
}

export default function LiveExecution() {
  const { id = '' } = useParams()
  const [run, setRun] = useState<RunRecord | null>(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const poll = async () => {
      try {
        const latest = await getRun(id, controller.signal)
        if (controller.signal.aborted) return
        setRun(latest)
        setError('')
        if (active(latest)) timer = window.setTimeout(() => void poll(), 1500)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load execution status.')
      }
    }
    void poll()
    return () => { controller.abort(); if (timer !== undefined) window.clearTimeout(timer) }
  }, [id, refreshKey])

  const result = run?.status === 'failed' ? 'Infrastructure failure' : run?.execution?.result.replaceAll('_', ' ') ?? 'No verdict yet'
  const files = run?.execution?.evidenceRecords ?? []
  const events = run?.execution?.telemetry ?? []

  return <main className="page execution-reference-page">
    <div className="execution-header-card"><div><div className="execution-breadcrumb"><Link to={`/runs/${id}`}>{id}</Link> / Live Execution</div><h1>Live Execution Monitor</h1><p>{run?.plan.summary ?? 'Run status and sanitized execution telemetry from the ReproProof API.'}</p><div className="execution-tags"><span>● {run?.status.replaceAll('_', ' ').toUpperCase() ?? 'LOADING'}</span><span>{run?.browser ?? 'Chromium'}</span><span>{run?.progress?.message ?? result}</span></div></div><div className="execution-header-actions"><button onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={14}/>Refresh</button><Link to={`/evidence/${encodeURIComponent(id)}`}><Camera size={15}/>View Evidence Passport</Link></div></div>
    {error && <div className="error-banner" role="alert"><CircleAlert size={15}/>{error}</div>}
    {run && <><section className="execution-stepper">{['Plan received', 'Approved', 'Attempt 1', 'Reset', 'Attempt 2', 'Fingerprint comparison', 'Verdict'].map((stage, index)=><div key={stage} className={index <= (run.execution?.attempts.length ?? (run.status === 'running' || run.status === 'verifying' ? 2 : run.status === 'approved' ? 1 : 0)) ? 'step-current' : ''}><span>{index + 1}</span><b>{stage}</b><small>{index === 0 ? 'Plan saved' : index === 1 ? run.approval?.decision ?? 'Waiting' : run.execution?.attempts[index - 2]?.result.replaceAll('_', ' ') ?? 'Pending'}</small></div>)}</section>
      <div className="execution-reference-grid"><div className="execution-primary-column"><section className="browser-monitor-card"><div className="browser-monitor-top"><div><i/><i/><i/><b>Chromium execution progress</b></div><span>{run.progress?.currentAttempt ? `Attempt ${run.progress.currentAttempt}` : `${run.progress?.completedAttempts ?? 0}/2 complete`}</span></div><div className="browser-capture-label">{run.progress?.message ?? `Run state: ${run.status}`}</div><div className="browser-viewport"><div className="preview-empty"><Activity size={22}/><b>{run.progress?.completedActions ?? 0} / {run.progress?.totalActions ?? run.plan.steps.length} actions completed</b><small>A live browser stream is not exposed; screenshots and recordings appear in evidence below.</small></div></div><div className="browser-monitor-foot"><span>Plan: {run.plan.steps.length} actions</span><span>Verdict: {result}</span><button onClick={() => setRefreshKey(value => value + 1)}>Refresh status</button></div></section><section className="execution-logs-card"><div className="execution-log-tabs"><b>Sanitized browser events</b><span>{events.length} events</span></div>{events.length ? <ul>{events.slice(-30).reverse().map((event, index)=><li key={`${event.timestamp}-${index}`}><time>{new Date(event.timestamp).toLocaleTimeString()}</time> <b>{event.type.replaceAll('_', ' ')}</b>{event.message && ` · ${event.message}`}{event.failure && ` · ${event.failure}`}{event.status && ` · HTTP ${event.status}`}</li>)}</ul> : <div className="execution-log-empty"><Code2 size={18}/><b>No telemetry events recorded</b><p>Sanitized console and network events are shown here after execution.</p></div>}</section></div><aside className="execution-side-column"><section className="execution-side-card"><div className="execution-side-heading"><h2>Two-run comparison</h2><span>{run.execution?.result.toUpperCase() ?? 'IN PROGRESS'}</span></div>{(run.execution?.attempts ?? []).map(attempt=><article className="attempt-preview" key={attempt.attemptNumber}><div><b>Attempt {attempt.attemptNumber}</b><span>{attempt.completed ? attempt.result.replaceAll('_', ' ') : 'Incomplete'}</span></div><small>Expected failure: {attempt.expectedFailureFound ? 'detected' : 'not detected'}</small><small>Fingerprint: {attempt.fingerprint?.hash.slice(0, 16) ?? 'Not available'}</small>{attempt.error && <small>{attempt.error}</small>}</article>)}{!run.execution?.attempts.length && <p>{run.progress?.message ?? 'Attempts have not started.'}</p>}</section><section className="execution-side-card"><div className="execution-side-heading"><h2>Evidence artifacts</h2><span>{files.length}</span></div>{files.map(file=>{const href=`${baseUrl}/api/runs/${encodeURIComponent(run.id)}/evidence/${encodeURIComponent(file.id)}`;return <div className="attempt-preview" key={file.id}><div><b>{file.type}</b><span>Attempt {file.attemptNumber}</span></div><a href={href} target="_blank" rel="noreferrer"><LinkIcon size={13}/> {file.storageKey.split('/').pop()}</a>{file.type==='screenshot'&&<img className="evidence-preview" src={href} alt={`Attempt ${file.attemptNumber} screenshot`} loading="lazy"/>}{file.type==='video'&&<video className="evidence-preview" src={href} controls preload="metadata"/>}</div>})}{!files.length&&<p>No evidence files have been saved yet.</p>}<Link to={`/evidence/${encodeURIComponent(run.id)}`}>Open evidence passport <ArrowRight size={13}/></Link></section><section className="execution-side-card"><div className="execution-side-heading"><h2>Run state</h2><span>{run.status}</span></div><p>{run.status === 'failed' ? <><ShieldAlert size={13}/> Infrastructure failure. No negative test verdict is inferred.</> : run.execution?.error ?? run.progress?.message ?? 'Waiting for the next state transition.'}</p><small>Last update: {new Date(run.updatedAt).toLocaleString()}</small></section></aside></div></>}
  </main>
}

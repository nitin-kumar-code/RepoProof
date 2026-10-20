import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, CircleAlert, Clock3, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getRuns } from '../api/runs'
import type { RunRecord } from '../types/run'

function isActive(run: RunRecord): boolean {
  return run.status === 'running' || run.status === 'verifying'
    || run.status === 'approved' && run.progress?.phase === 'queued'
}

export default function Runs() {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const load = async () => {
      try {
        const latest = await getRuns(controller.signal)
        if (controller.signal.aborted) return
        setRuns(latest)
        setError('')
        setLoading(false)
        if (latest.some(isActive)) timer = window.setTimeout(() => void load(), 2000)
      } catch (cause) {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Could not load run records.')
        setLoading(false)
      }
    }
    void load()
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [refreshKey])

  const filtered = useMemo(() => runs.filter(run => `${run.id} ${run.bugReportId} ${run.plan.summary}`.toLowerCase().includes(query.toLowerCase())), [runs, query])
  const pending = runs.filter(run => run.status === 'awaiting_approval').length
  const live = runs.filter(isActive).length
  const completed = runs.filter(run => ['reproduced', 'not_reproduced', 'inconclusive'].includes(run.status)).length

  return <main className="page runs-reference-page">
    <div className="runs-reference-heading"><div><h1>Test Runs</h1><p>Plans, approvals, browser execution progress, verdicts, and evidence from the connected API.</p></div><div className="page-toolbar"><button className="secondary-button" onClick={() => { setLoading(true); setRefreshKey(key => key + 1) }}><RefreshCw size={15}/>Refresh</button><Link className="primary-button" to="/new-bug"><Plus size={15}/>New Bug Report</Link></div></div>
    {error && <div className="error-banner" role="alert"><CircleAlert size={15}/> {error}</div>}
    <div className="run-summary-grid"><article><small>TOTAL RUNS</small><strong>{runs.length}<em>records</em></strong><span><Clock3 size={13}/> From the backend</span></article><article><small>PENDING APPROVAL</small><strong>{pending}<em>runs</em></strong><span><ShieldAlert size={13}/> Review the proposed plans</span></article><article><small>LIVE / QUEUED</small><strong>{live}<em>active</em></strong><span><Activity size={13}/> Workers report progress</span></article><article><small>COMPLETED VERDICTS</small><strong>{completed}<em>runs</em></strong><span>Reproduced, not reproduced, or inconclusive</span></article></div>
    <section className="panel run-reference-table-card"><div className="run-filter-row"><label><Search size={15}/><input aria-label="Search runs" placeholder="Search run ID, bug ID, or plan…" value={query} onChange={event => setQuery(event.target.value)}/></label></div><div className="runs-table-wrap"><table className="runs-table"><thead><tr><th>RUN ID</th><th>BUG REPORT / PLAN</th><th>TARGET</th><th>STATUS</th><th>PROGRESS</th><th>VERDICT</th><th>UPDATED</th><th>ACTION</th></tr></thead><tbody>{filtered.map(run=><tr key={run.id}><td><b className="run-id">{run.id.slice(0, 12)}</b></td><td><b>{run.bugReportId}</b><small>{run.plan.summary}</small></td><td><code>{run.plan.preconditions.find(value => value.startsWith('Approved target: '))?.slice('Approved target: '.length) ?? 'Not supplied'}</code></td><td><span className={`fixture-state ${run.status === 'failed' || run.status === 'cancelled' ? 'blocked' : ''}`}><i/>{run.status.replaceAll('_', ' ')}</span></td><td><code>{run.progress?.message ?? (run.execution ? `${run.execution.attempts.length}/2 attempts completed` : run.status === 'awaiting_approval' ? 'Waiting for approval' : '—')}</code></td><td>{run.status === 'failed' ? 'Infrastructure failure' : run.execution?.result.replaceAll('_', ' ') ?? 'Not decided'}</td><td>{new Date(run.updatedAt).toLocaleString()}</td><td><Link to={`/runs/${encodeURIComponent(run.id)}`} className="runs-action">Review <ArrowRight size={13}/></Link></td></tr>)}</tbody></table>{loading && <p className="empty-state" role="status">Loading runs…</p>}{!loading && !error && filtered.length === 0 && <p className="empty-state">No runs match this search.</p>}</div><footer className="run-table-footer">Showing {filtered.length} of {runs.length} API run records</footer></section>
  </main>
}

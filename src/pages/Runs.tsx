import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, RefreshCw, Search } from 'lucide-react'
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
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const load = async () => {
      try {
        const latest = await getRuns(controller.signal)
        if (controller.signal.aborted) return
        setRuns(latest)
        setLoading(false)
        if (latest.some(isActive)) timer = window.setTimeout(() => void load(), 2000)
      } catch {
        if (controller.signal.aborted) return
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
    <div className="runs-reference-heading"><h1>Test Runs</h1><div className="page-toolbar"><button className="secondary-button" onClick={() => { setLoading(true); setRefreshKey(key => key + 1) }}><RefreshCw size={15}/>Refresh</button></div></div>
    <div className="run-summary-grid"><article><small>TOTAL RUNS</small><strong>{runs.length}</strong></article><article><small>PENDING APPROVAL</small><strong>{pending}</strong></article><article><small>LIVE / QUEUED</small><strong>{live}</strong></article><article><small>COMPLETED VERDICTS</small><strong>{completed}</strong></article></div>
    <section className="panel run-reference-table-card"><div className="run-filter-row"><label><Search size={15}/><input aria-label="Search runs" placeholder="Search run ID, bug ID, or plan…" value={query} onChange={event => setQuery(event.target.value)}/></label></div><div className="runs-table-wrap"><table className="runs-table"><thead><tr><th>RUN ID</th><th>BUG REPORT / PLAN</th><th>TARGET</th><th>STATUS</th><th>PROGRESS</th><th>VERDICT</th><th>UPDATED</th><th>ACTION</th></tr></thead><tbody>{filtered.map(run=><tr key={run.id}><td><b className="run-id">{run.id.slice(0, 12)}</b></td><td><b>{run.bugReportId}</b><small>{run.plan.summary}</small></td><td><code>{run.plan.preconditions.find(value => value.startsWith('Approved target: '))?.slice('Approved target: '.length) ?? 'Not supplied'}</code></td><td><span className={`fixture-state ${run.status === 'failed' || run.status === 'cancelled' ? 'blocked' : ''}`}><i/>{run.status.replaceAll('_', ' ')}</span></td><td><code>{run.progress?.message ?? (run.execution ? `${run.execution.attempts.length}/2 attempts completed` : run.status === 'awaiting_approval' ? 'Waiting for approval' : '—')}</code></td><td>{run.status === 'failed' ? 'Infrastructure failure' : run.execution?.result.replaceAll('_', ' ') ?? 'Not decided'}</td><td>{new Date(run.updatedAt).toLocaleString()}</td><td><Link to={`/runs/${encodeURIComponent(run.id)}`} className="runs-action">Review <ArrowRight size={13}/></Link></td></tr>)}</tbody></table>{loading && <p className="empty-state" role="status">Loading runs…</p>}{!loading && filtered.length === 0 && <p className="empty-state">{runs.length === 0 ? 'No runs to display.' : 'No runs match this search.'}</p>}</div></section>
  </main>
}

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CircleAlert, RefreshCw, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getRuns } from '../api/runs'
import type { RunRecord } from '../types/run'

export default function Runs() {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void getRuns().then(records => {
      if (controller.signal.aborted) return
      setRuns(records.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))
      setError('')
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load runs.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refreshKey])

  const filtered = useMemo(() => runs.filter(run => `${run.id} ${run.bugReportId} ${run.plan.summary}`.toLowerCase().includes(query.toLowerCase())), [runs, query])
  const pending = runs.filter(run => run.status === 'awaiting_approval').length
  const completed = runs.filter(run => ['reproduced', 'not_reproduced', 'inconclusive'].includes(run.status)).length

  return <main className="page runs-reference-page">
    <div className="runs-reference-heading"><div><h1>Test Runs</h1><p>Persisted plans, approvals, execution states, verdicts, and evidence from the connected API.</p></div><div className="page-toolbar"><button className="secondary-button" onClick={() => setRefreshKey(key => key + 1)}><RefreshCw size={15}/>Refresh</button></div></div>
    {error && <div className="error-banner" role="alert"><CircleAlert size={15}/>{error}</div>}
    <div className="run-summary-grid"><article><small>TOTAL RUNS</small><strong>{runs.length}<em>records</em></strong><span>From the ReproProof API</span></article><article><small>PENDING APPROVAL</small><strong>{pending}<em>runs</em></strong><span>Plans awaiting review</span></article><article><small>COMPLETED VERDICTS</small><strong>{completed}<em>runs</em></strong><span>Verification completed</span></article></div>
    <section className="panel run-reference-table-card"><div className="run-filter-row"><label><Search size={15}/><input aria-label="Search runs" placeholder="Search run ID, bug report, or plan…" value={query} onChange={event => setQuery(event.target.value)}/></label></div><div className="runs-table-wrap"><table className="runs-table"><thead><tr><th>RUN ID</th><th>BUG REPORT / PLAN</th><th>TARGET</th><th>STATUS</th><th>VERDICT</th><th>UPDATED</th><th>ACTION</th></tr></thead><tbody>{filtered.map(run=><tr key={run.id}><td><b className="run-id">{run.id.slice(0, 12)}</b></td><td><b>{run.bugReportId}</b><small>{run.plan.summary}</small></td><td><code>{run.plan.preconditions.find(item => item.startsWith('Approved target: '))?.slice('Approved target: '.length) ?? 'Not supplied'}</code></td><td><span className="fixture-state"><i/>{run.status.replaceAll('_', ' ')}</span></td><td>{run.status === 'failed' ? 'Infrastructure failure' : run.execution?.result.replaceAll('_', ' ') ?? 'Not decided'}</td><td>{new Date(run.updatedAt).toLocaleString()}</td><td><Link to={`/runs/${encodeURIComponent(run.id)}`} className="runs-action">Review <ArrowRight size={13}/></Link></td></tr>)}</tbody></table>{loading && <p className="empty-state" role="status">Loading runs from the API…</p>}{!loading && !error && filtered.length === 0 && <p className="empty-state">No runs have been created yet.</p>}</div><footer className="run-table-footer">Showing {filtered.length} of {runs.length} API run records</footer></section>
  </main>
}

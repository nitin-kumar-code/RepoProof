import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, BadgeCheck, Bug, CircleHelp, Filter, PlayCircle, RefreshCw, Search, Shield, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getBugs } from '../api/bugs'
import { getRuns } from '../api/runs'
import type { BugReport } from '../types/bug'
import type { RunRecord } from '../types/run'

type FilterName = 'All' | 'Awaiting approval' | 'Active' | 'Completed' | 'No run'

function latestFirst<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

function runForBug(bugId: string, runs: RunRecord[]): RunRecord | undefined {
  return runs.find(run => run.bugReportId === bugId)
}

function statusLabel(run: RunRecord | undefined): string {
  if (!run) return 'No connected run'
  if (run.execution) return run.execution.result.replaceAll('_', ' ')
  if (run.status === 'awaiting_approval') return 'Awaiting approval'
  if (run.status === 'approved') return 'Approved · queued'
  if (run.status === 'running' || run.status === 'verifying') return run.status
  return run.status.replaceAll('_', ' ')
}

function targetHost(bug: BugReport): string {
  try { return new URL(bug.environment.targetUrl).hostname } catch { return bug.environment.targetUrl }
}

function dateLabel(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

export default function Dashboard() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterName>('All')
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([getBugs(controller.signal), getRuns(controller.signal)])
      .then(([bugRecords, runRecords]) => {
        setBugs(latestFirst(bugRecords))
        setRuns([...runRecords].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))
        setError('')
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load dashboard data.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refreshKey])

  const refresh = () => {
    setLoading(true)
    setRefreshKey(value => value + 1)
  }

  const filteredBugs = useMemo(() => bugs.filter(bug => {
    const textMatches = `${bug.id} ${bug.title} ${bug.description} ${bug.environment.targetUrl}`.toLowerCase().includes(query.toLowerCase())
    const run = runForBug(bug.id, runs)
    const statusMatches = filter === 'All'
      || (filter === 'No run' && !run)
      || (filter === 'Awaiting approval' && run?.status === 'awaiting_approval')
      || (filter === 'Active' && Boolean(run && ['approved', 'running', 'verifying'].includes(run.status)))
      || (filter === 'Completed' && Boolean(run?.execution))
    return textMatches && statusMatches
  }), [bugs, runs, query, filter])

  const reproduced = runs.filter(run => run.execution?.result === 'reproduced').length
  const notReproduced = runs.filter(run => run.execution?.result === 'not_reproduced').length
  const inconclusive = runs.filter(run => run.execution?.result === 'inconclusive').length
  const awaitingApproval = runs.filter(run => run.status === 'awaiting_approval').length
  const failed = runs.filter(run => run.status === 'failed' || run.status === 'error').length

  return (
    <main className="page dashboard-page">
      <div className="dash-heading">
        <div>
          <div className="dash-title-line"><h1>Dashboard</h1><span className="env-chip"><i />LIVE API</span></div>
          <p>Monitor investigations, review reproduction workflows, and inspect available evidence.</p>
        </div>
        <div className="dash-actions">
          <button className="secondary-button" onClick={() => document.querySelector<HTMLInputElement>('.investigation-search')?.focus()}><Filter size={16} />Filter Pipeline</button>
          <button className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw size={15} />Refresh</button>
        </div>
      </div>

      {error && <div className="investigation-notice is-warning" role="alert">{error} <button type="button" onClick={refresh}>Try again</button></div>}

      <div className="metrics-grid">
        <article className="metric-card"><div className="metric-label">TOTAL BUG REPORTS <span className="metric-icon blue"><Bug size={18} /></span></div><strong>{bugs.length}</strong><div className="metric-note"><b>Live API records</b><span> · {awaitingApproval} awaiting approval</span></div><div className="metric-line blue-line" /></article>
        <article className="metric-card"><div className="metric-label">REPRODUCED <span className="metric-icon blue"><BadgeCheck size={18} /></span></div><strong>{reproduced}</strong><div className="metric-note">Verified matching failures</div><div className="metric-line mid-line" /></article>
        <article className="metric-card"><div className="metric-label">NOT REPRODUCED <span className="metric-icon soft-blue"><ShieldCheck size={18} /></span></div><strong>{notReproduced}</strong><div className="metric-note">Completed clean attempts</div><div className="metric-line short-line" /></article>
        <article className="metric-card"><div className="metric-label">INCONCLUSIVE <span className="metric-icon grey"><CircleHelp size={18} /></span></div><strong>{inconclusive}</strong><div className="metric-note">Runs needing review</div><div className="metric-line muted-line" /></article>
        <article className="metric-card"><div className="metric-label">EXECUTION FAILURES <span className="metric-icon red"><AlertTriangle size={18} /></span></div><strong>{failed}</strong><div className="metric-note">Infrastructure or execution errors</div><div className="metric-line red-line" /></article>
      </div>

      <div className="pipeline-banner">
        <span className="pipeline-red"><i /> {runs.length} persisted runs</span><b>/</b>
        <span><Shield size={15} /> {awaitingApproval} approvals pending</span><b>/</b>
        <span className="pipeline-blue"><ShieldCheck size={15} /> {runs.filter(run => (run.execution?.evidenceRecords.length ?? 0) > 0).length} runs with evidence</span><b>/</b>
        <span><i className="status-dot" /> Live database records</span>
        <Link to="/settings">View API status <ArrowRight size={15} /></Link>
      </div>

      <div className="dashboard-lower">
        <section className="investigation-panel">
          <div className="investigation-heading">
            <div><h2>Recent Investigations <small>{bugs.length} reports</small></h2></div>
            <div className="investigation-tools">
              <label className="investigation-search-wrap"><Search size={16} /><input className="investigation-search" placeholder="Filter title, target, ID…" value={query} onChange={event => setQuery(event.target.value)} /></label>
              <div className="verdict-filters">{(['All', 'Awaiting approval', 'Active', 'Completed', 'No run'] as const).map(value => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{value}{value === 'All' ? ` (${bugs.length})` : ''}</button>)}</div>
            </div>
          </div>
          {loading && <div className="empty-state" role="status">Loading live investigations…</div>}
          {!loading && <div className="investigation-table-wrap"><table className="investigation-table"><thead><tr><th>BUG ID</th><th>ISSUE SPECIFICATION</th><th>TARGET</th><th>CREATED</th><th>VERDICT</th><th>RUN STATUS</th><th>ACTION</th></tr></thead><tbody>
            {filteredBugs.slice(0, 8).map(bug => {
              const run = runForBug(bug.id, runs)
              const verdict = run?.execution?.result
              return <tr key={bug.id}><td><b className="bug-id">{bug.id.slice(0, 8)}</b></td><td><span className="issue-title">{bug.title}</span><small>{bug.description}</small></td><td>{targetHost(bug)}</td><td>{dateLabel(bug.createdAt)}</td><td><span className="verdict-empty">{verdict ? verdict.replaceAll('_', ' ').toUpperCase() : 'NOT EVALUATED'}</span></td><td><span className="run-status-text">{statusLabel(run)}</span></td><td><Link to={run ? `/runs/${run.id}` : '/investigations'} className="table-action">{run ? 'View run' : 'View report'}</Link></td></tr>
            })}
          </tbody></table>{filteredBugs.length === 0 && <div className="empty-state">{error ? 'Dashboard data is unavailable.' : 'No reports match this filter.'}</div>}</div>}
        </section>

        <aside className="recent-runs-panel">
          <div className="recent-runs-title"><h2><PlayCircle size={20} />Recent Test Runs</h2><Link to="/runs">View All Runs</Link></div>
          {runs.slice(0, 5).map(run => {
            const bug = bugs.find(item => item.id === run.bugReportId)
            const label = statusLabel(run)
            const failure = run.status === 'failed' || run.status === 'error'
            return <Link className="recent-run-card" key={run.id} to={`/runs/${run.id}`}><div className="recent-run-top"><b className={failure ? 'red-text' : ''}>#{run.id.slice(0, 8)}</b><span className={`run-state-chip ${failure ? 'failed' : run.execution?.result ?? run.status}`}>{label}</span></div><strong>{bug?.title ?? `Report ${run.bugReportId.slice(0, 8)}`}</strong><div className="recent-run-bottom"><span>{dateLabel(run.updatedAt)} · {run.browser}</span><span>{run.execution?.attempts.length ?? 0} attempts</span></div></Link>
          })}
          {!loading && runs.length === 0 && <div className="empty-state">No test runs have been created.</div>}
        </aside>
      </div>
    </main>
  )
}

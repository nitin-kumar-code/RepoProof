import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Ban,
  CircleHelp,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { getBugs } from '../api/bugs'
import { getRuns } from '../api/runs'
import type { BugReport } from '../types/bug'
import type { RunRecord } from '../types/run'

const filters = ['All', 'Has runs', 'No runs'] as const

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export default function Investigations() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<(typeof filters)[number]>('All')
  const [records, setRecords] = useState<BugReport[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    void Promise.all([getBugs(), getRuns()])
      .then(([items, runItems]) => {
        if (!active) return
        setRecords(items)
        setRuns(runItems)
        setError('')
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load live API reports.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refreshKey])

  const filtered = useMemo(() => records.filter(bug => (
    `${bug.id} ${bug.title} ${bug.description} ${bug.environment.targetUrl}`.toLowerCase().includes(query.toLowerCase())
    && (status === 'All' || (status === 'Has runs' ? runs.some(run => run.bugReportId === bug.id) : !runs.some(run => run.bugReportId === bug.id)))
  )), [records, runs, query, status])

  const exportCsv = () => {
    const rows = [
      ['Bug ID', 'Title', 'Target', 'Created', 'Latest run status', 'Verdict'],
      ...filtered.map(bug => {
        const run = runs.find(item => item.bugReportId === bug.id)
        return [bug.id, bug.title, bug.environment.targetUrl, bug.createdAt, run?.status ?? 'No run', run?.execution?.result ?? 'Not evaluated']
      }),
    ]
    const csv = `\uFEFF${rows.map(row => row.map(escapeCsv).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'reproproof-investigations.csv'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setNotice(`Exported ${filtered.length} live ${filtered.length === 1 ? 'record' : 'records'} as CSV.`)
  }

  const showSyncNotice = () => setNotice('Jira / GitHub sync is not connected in this workspace.')
  const pendingApprovals = runs.filter(run => run.status === 'awaiting_approval').length
  const evaluated = runs.filter(run => run.execution).length

  return (
    <main className="page investigation-reference-page">
      <div className="investigation-toolbar" aria-label="Investigation actions">
        <button className="secondary-button" onClick={exportCsv}><Download size={14} />Export CSV <small>(Demo)</small></button>
        <button className="secondary-button" onClick={showSyncNotice}><RefreshCw size={14} />Sync Jira / GitHub <small>(Demo)</small></button>
      </div>

      <div className="investigation-page-heading">
        <div>
          <div className="eyebrow">TELEMETRIC RECORDS &amp; STATE PROOFS <span>· Connected API</span></div>
          <h1>Investigations</h1>
          <p>Track reported bugs, reproduction history, and deterministic state checks across staging environments.</p>
        </div>
        <span className="mock-stamp"><i />LIVE API DATA</span>
      </div>

      {error && <div className="investigation-notice is-warning" role="alert">{error} <button type="button" onClick={() => { setLoading(true); setRefreshKey(value => value + 1) }}>Try again</button></div>}
      {notice && <div className="investigation-notice" role="status">{notice}</div>}
      {loading && <p className="investigation-loading" role="status">Loading API reports…</p>}

      <section className="investigation-kpi-grid" aria-label="Investigation summary">
        <article className="investigation-kpi">
          <div><small>BUG REPORT RECORDS</small><span className="kpi-tag">API records</span></div>
          <strong>{records.length}</strong>
          <p>Reports available in this workspace</p>
        </article>
        <article className="investigation-kpi">
          <div><small>RUNS CONNECTED</small><span className="kpi-tag">Run records</span></div>
          <strong>{runs.length}</strong>
          <p>Persisted run records</p>
        </article>
        <article className="investigation-kpi">
          <div><small>VERIFIED VERDICTS</small><span className="kpi-tag">Evidence required</span></div>
          <strong>{evaluated}</strong>
          <p>Runs with backend execution records</p>
        </article>
        <article className="investigation-kpi">
          <div><small>APPROVAL GATE</small><span className="kpi-tag">Backend status</span></div>
          <strong>{pendingApprovals}</strong>
          <p>Runs awaiting a decision</p>
        </article>
      </section>

      <section className="investigation-register" aria-label="Bug report records">
        <div className="investigation-register-heading">
          <div>
            <span className="eyebrow">REGISTER</span>
            <h2>Bug Report Records <span>{filtered.length} shown</span></h2>
          </div>
        </div>
        <div className="investigation-controls">
          <label className="investigation-search"><Search size={16} /><input placeholder="Search by Bug ID, title, or service…" aria-label="Search investigations" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className="register-filters" role="group" aria-label="Filter by report status">
            {filters.map(filter => <button key={filter} type="button" className={status === filter ? 'active' : ''} aria-pressed={status === filter} onClick={() => setStatus(filter)}>{filter}{filter === 'All' ? ` (${records.length})` : ''}</button>)}
          </div>
          <span className="sample-source"><Activity size={13} />LIVE BUG &amp; RUN API</span>
        </div>
        <div className="investigation-table-scroll">
          <table className="investigation-record-table">
            <thead><tr><th>BUG ID</th><th>BUG TITLE &amp; FINGERPRINT</th><th>SERVICE</th><th>SEVERITY</th><th>ENVIRONMENT</th><th>STATUS</th><th>LATEST VERDICT</th><th>UPDATED</th><th>ACTIONS</th></tr></thead>
            <tbody>{filtered.map((bug, index) => (
              <tr key={bug.id} className={index % 2 ? '' : 'record-alt'}>
                <td><b className="bug-id">{bug.id}</b></td>
                <td className="investigation-title-cell"><b>{bug.title}</b><small>API report · verdict depends on completed verification</small></td>
                <td><span className="service-tag">API report</span></td>
                <td><span className="severity-badge">Not supplied</span></td>
                <td><span className="environment-label"><i />{bug.environment.targetUrl}</span></td>
                <td><span className="investigation-status">{runs.some(run => run.bugReportId === bug.id) ? 'Run created' : 'Report saved'}</span></td>
                <td><span className="not-evaluated"><CircleHelp size={13} />{runs.find(run => run.bugReportId === bug.id)?.execution?.result.replaceAll('_', ' ') ?? 'Not evaluated'}</span></td>
                <td className="investigation-updated">{new Date(bug.createdAt).toLocaleString()}</td>
                <td><Link className="investigation-row-action" to={runs.find(run => run.bugReportId === bug.id) ? `/runs/${encodeURIComponent(runs.find(run => run.bugReportId === bug.id)!.id)}` : '/runs'}>{runs.some(run => run.bugReportId === bug.id) ? <><ShieldAlert size={13} />Review Run</> : <>View Runs <ArrowRight size={13} /></>}</Link></td>
              </tr>
            ))}</tbody>
          </table>
          {filtered.length === 0 && !loading && <p className="investigation-empty">No matching bug reports.</p>}
        </div>
      </section>

      <div className="investigation-disclaimer"><Ban size={15} /><span><b>Verdict integrity:</b> a reproduction verdict requires two valid completed attempts and supporting evidence. No verdicts are inferred from fixture or sample rows.</span></div>
    </main>
  )
}

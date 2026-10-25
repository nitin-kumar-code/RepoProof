import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Ban,
  CircleHelp,
  Search,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { getBugs } from '../api/bugs'
import { bugs as sampleBugs } from '../mocks/demoData'
import type { BugStatus, BugSummary } from '../types/bug'

const filters: Array<'All' | BugStatus> = ['All', 'Open', 'In progress', 'Resolved']
type InvestigationRecord = Omit<BugSummary, 'status' | 'severity'> & {
  status: BugStatus | 'Not supplied'
  severity: BugSummary['severity'] | 'Not supplied'
}

export default function Investigations() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<(typeof filters)[number]>('All')
  const [records, setRecords] = useState<InvestigationRecord[]>(sampleBugs)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void getBugs()
      .then(items => {
        if (!active) return
        setRecords(items.map(item => ({
          id: item.id,
          title: item.title,
          project: 'Bug report',
          status: 'Not supplied' as const,
          updatedAt: new Date(item.createdAt).toLocaleDateString(),
          severity: 'Not supplied' as const,
        })))
        setError('')
      })
      .catch(() => {
        if (active) setError('API unavailable. Showing the labelled local sample records.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const filtered = useMemo(() => records.filter(bug => (
    `${bug.id} ${bug.title} ${bug.project}`.toLowerCase().includes(query.toLowerCase())
    && (status === 'All' || status === bug.status)
  )), [records, query, status])

  return (
    <main className="page investigation-reference-page">
      <div className="investigation-page-heading">
        <div>
          <div className="eyebrow">TELEMETRIC RECORDS &amp; STATE PROOFS <span>· Sandbox Node #04</span></div>
          <h1>Investigations</h1>
          <p>Track reported bugs, reproduction history, and deterministic state checks across staging environments.</p>
        </div>
        <span className="mock-stamp"><i />MOCK DATA · NOT LIVE VERIFIED</span>
      </div>

      {error && <div className="investigation-notice is-warning" role="status">{error}</div>}
      {loading && <p className="investigation-loading" role="status">Loading API reports…</p>}

      <section className="investigation-kpi-grid" aria-label="Investigation summary">
        <article className="investigation-kpi">
          <div><small>BUG REPORT RECORDS</small><span className="kpi-tag">{error ? 'Local samples' : 'Indexed'}</span></div>
          <strong>{records.length}</strong>
          <p>{error ? 'Clearly labelled sample reports' : 'Reports available in this workspace'}</p>
        </article>
        <article className="investigation-kpi">
          <div><small>RUNS CONNECTED</small><span className="kpi-tag">Run records</span></div>
          <strong>—</strong>
          <p>Run records are not available here</p>
        </article>
        <article className="investigation-kpi">
          <div><small>VERIFIED VERDICTS</small><span className="kpi-tag">Evidence required</span></div>
          <strong>0</strong>
          <p>No verdicts are inferred from sample rows</p>
        </article>
        <article className="investigation-kpi">
          <div><small>APPROVAL GATE</small><span className="kpi-tag">Backend status</span></div>
          <strong className="kpi-unavailable">Unavailable</strong>
          <p>Requires a supported backend response</p>
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
          <span className="sample-source"><Activity size={13} />{error ? 'LOCAL SAMPLE RECORDS' : 'BUG REPORT RECORDS'}</span>
        </div>
        <div className="investigation-table-scroll">
          <table className="investigation-record-table">
            <thead><tr><th>BUG ID</th><th>BUG TITLE &amp; FINGERPRINT</th><th>SERVICE</th><th>SEVERITY</th><th>ENVIRONMENT</th><th>STATUS</th><th>LATEST VERDICT</th><th>UPDATED</th><th>ACTIONS</th></tr></thead>
            <tbody>{filtered.map((bug, index) => (
              <tr key={bug.id} className={index % 2 ? '' : 'record-alt'}>
                <td><b className="bug-id">{bug.id}</b></td>
                <td className="investigation-title-cell"><b>{bug.title}</b>{error && <small>Local sample</small>}</td>
                <td><span className="service-tag">{bug.project}</span></td>
                <td><span className={`severity-badge ${bug.severity.toLowerCase()}`}>{bug.severity.toUpperCase()}</span></td>
                <td><span className="environment-label"><i />Not supplied</span></td>
                <td><span className={`investigation-status ${bug.status.toLowerCase().replace(' ', '-')}`}>{bug.status}</span></td>
                <td><span className="not-evaluated"><CircleHelp size={13} />Not evaluated</span></td>
                <td className="investigation-updated">{bug.updatedAt}</td>
                <td><Link className="investigation-row-action" to="/runs"><ArrowRight size={13} />View live API runs</Link></td>
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

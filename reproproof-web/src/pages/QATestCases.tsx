import { ArrowRight, ClipboardCheck, Download, LockKeyhole, ShieldAlert, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'

const scenarios = [
  { id: 'TC1', title: 'Bug Reproduced Twice · Race Invalidation', status: 'Not Run', bug: 'BUG-1042', run: 'RUN-8821', detail: 'Confirm two valid completed attempts observe the same expected failure with supporting evidence.', checks: ['Two completed attempts from valid conditions', 'Same failure criteria in both observations', 'Evidence available for each attempt'], tone: 'red', link: '/evidence/RUN-8821' },
  { id: 'TC2', title: 'Cannot Reproduce · Flake vs Truth', status: 'Not Run', bug: 'BUG-1043', run: 'RUN-8820', detail: 'Classify Not Reproduced only after two valid completed attempts without the expected failure.', checks: ['Environment and build details recorded', 'Both attempts completed under valid conditions', 'No expected failure observed in either attempt'], tone: 'grey', link: '/runs/RUN-8820' },
  { id: 'TC3', title: 'Destructive Deletion · Elevated Approval Gate', status: 'Blocked', bug: 'BUG-1044', run: 'RUN-8822', detail: 'Verify dangerous actions remain blocked in mock mode and a real deletion never runs.', checks: ['Prominent warning is shown before review', 'Approval requires a backend-enforced gate', 'Mock UI performs no deletion'], tone: 'blue', link: '/runs/RUN-8822' },
  { id: 'TC4', title: 'Synthetic Token Redaction', status: 'Not Run', bug: 'BUG-1046', run: 'RUN-8818', detail: 'Check synthetic sensitive values do not appear in logs, evidence exports, or client-visible content.', checks: ['Bearer and JWT-like values covered', 'Cookies and API-key patterns covered', 'Exports checked for leaked synthetic values'], tone: 'green', link: '/settings' },
]

function exportMatrix() {
  const csv = ['Scenario,Title,Status,Required validation', ...scenarios.map(s => `${s.id},"${s.title}",${s.status},"${s.checks.join('; ')}"`)].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'reproproof-qa-scenarios.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function QATestCases() {
  return <main className="page qa-reference-page">
    <div className="qa-reference-heading">
      <h1>QA Test Cases &amp; Acceptance Suite</h1>
      <div className="page-toolbar">
        <button className="secondary-button" onClick={exportMatrix}><Download size={14} />Export QA Matrix</button>
        <button className="primary-button" disabled title="A QA runner is not connected"><ClipboardCheck size={15} />Run Full QA Suite</button>
      </div>
    </div>

    <div className="qa-summary-grid">
      <article><small>TOTAL SCENARIOS</small><strong>4</strong></article>
      <article><small>PASSED VALIDATIONS</small><strong>0</strong></article>
      <article><small>UNDER REVIEW / BLOCKED</small><strong>3</strong></article>
      <article><small>REDACTION CHECK</small><strong>Not verified</strong></article>
    </div>

    <div className="qa-protocol-heading"><h2>Official Acceptance Scenarios</h2></div>
    <div className="qa-scenario-list">
      {scenarios.map(s => <article key={s.id} className={`qa-scenario ${s.tone}`}>
        <div className="qa-scenario-main">
          <div className="qa-scenario-title">
            <span>{s.id}</span><h3>{s.title}</h3>
            <b className={`qa-status ${s.status === 'Blocked' ? 'blocked' : ''}`}>
              {s.status === 'Blocked' ? <ShieldAlert size={13} /> : <Timer size={13} />} {s.status.toUpperCase()}
            </b>
          </div>
          <p>{s.detail}</p>
          <div className="qa-metadata"><span>TARGET <b>{s.bug}</b></span><span>RELATED RUN <b>{s.run}</b></span></div>
          <div className="qa-checks">{s.checks.map(check => <span key={check}><LockKeyhole size={13} />{check}</span>)}</div>
          <Link to={s.link}>{s.id === 'TC3' ? 'Review safe plan state' : s.id === 'TC4' ? 'View privacy diagnostics' : s.id === 'TC1' ? 'Open evidence passport' : 'Inspect run record'} <ArrowRight size={14} /></Link>
        </div>
      </article>)}
    </div>
  </main>
}

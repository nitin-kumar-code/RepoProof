import { useState } from 'react'
import { CheckCircle2, CircleHelp, Eraser, HeartPulse, LockKeyhole, Network, ShieldAlert, TimerReset, XCircle } from 'lucide-react'
import { baseUrl } from '../api/client'

export default function SettingsPage({ health, onCheck }: { health: 'checking' | 'online' | 'offline'; onCheck: () => void }) {
  const [checked, setChecked] = useState(false)
  const [cleared, setCleared] = useState(false)

  function runHealthCheck() {
    setChecked(true)
    onCheck()
  }

  function resetDraft() {
    localStorage.removeItem('reproproof-bug-draft')
    setCleared(true)
  }

  return <main className="page settings-reference-page">
    <div className="settings-reference-heading">
      <h1>Settings &amp; Connection Status</h1>
      <div className="page-toolbar">
        <button className="secondary-button" onClick={resetDraft}><TimerReset size={15} />Reset Local Draft</button>
        <button className="primary-button" onClick={runHealthCheck}><HeartPulse size={15} />Run Health Diagnostic</button>
      </div>
    </div>

    {checked && <div className={`settings-check-result ${health}`} role="status">
      {health === 'online' ? <CheckCircle2 size={15} /> : health === 'offline' ? <XCircle size={15} /> : <CircleHelp size={15} />}
      Health check result: {health === 'checking' ? 'checking…' : health === 'online' ? 'API responded successfully' : 'API did not respond'}
    </div>}
    {cleared && <div className="settings-check-result online" role="status"><Eraser size={15} />Local bug-report draft cleared from this browser.</div>}

    <div className="settings-metrics">
      <article><small>API HEALTH</small><strong className={health}>{health === 'online' ? 'Connected' : health === 'checking' ? 'Checking' : 'Offline'}</strong></article>
      <article><small>BUG REPORT API</small><strong>Available</strong></article>
      <article><small>RUN / EVIDENCE API</small><strong>Unavailable</strong></article>
      <article><small>SECURITY VERIFICATION</small><strong>Not checked</strong></article>
    </div>

    <div className="settings-diagnostic-grid">
      <div className="settings-main-column">
        <section className="settings-reference-card">
          <div className="settings-card-heading">
            <div><span className="settings-card-icon"><Network size={17} /></span><div><h2>Connection &amp; Runtime Environment</h2></div></div>
          </div>
          <div className="runtime-mode">
            <div className="active-mode"><i />Configured API target <b>{health === 'online' ? 'ONLINE' : health === 'checking' ? 'CHECKING' : 'OFFLINE'}</b></div>
            <div className="standby-mode">Run orchestration <b>NOT CONNECTED</b></div>
          </div>
          <div className="runtime-record"><span>API Base URL</span><code>{baseUrl}</code></div>
          <div className="runtime-record"><span>Health endpoint</span><code>/health</code></div>
          <div className="runtime-record"><span>Bug reports</span><code>GET /api/bugs · POST /api/bugs</code></div>
          <div className="runtime-record disabled-record"><span>Run, approval, evidence</span><code>Not implemented</code></div>
          <div className="runtime-record"><span>Application</span><code>ReproProof Diagnostics · 0.0.0</code></div>
        </section>

        <section className="settings-reference-card diagnostic-matrix">
          <div className="settings-card-heading">
            <div><span className="settings-card-icon"><HeartPulse size={17} /></span><div><h2>Diagnostic Health-Check Matrix</h2></div></div>
          </div>
          <div className="diagnostic-table">
            <div className="diagnostic-header"><span>DIAGNOSTIC CHECK</span><span>SUBSYSTEM</span><span>RESULT / SUPPORT</span><span>STATUS</span></div>
            <div><span>API health endpoint</span><code>GET /health</code><code>{health === 'online' ? 'HTTP response received' : health === 'checking' ? 'Checking…' : 'Unavailable'}</code><b className={health === 'online' ? 'good' : 'unknown'}>{health === 'online' ? 'RESPONDED' : health === 'checking' ? 'CHECKING' : 'OFFLINE'}</b></div>
            <div><span>Bug report create/list</span><code>Express bug router</code><code>GET /api/bugs · POST /api/bugs</code><b className="good">IMPLEMENTED</b></div>
            <div><span>Plan approval / run execution</span><code>Not configured</code><code>No route registered</code><b className="unknown">UNAVAILABLE</b></div>
            <div><span>Evidence retrieval / verification</span><code>Not configured</code><code>No route registered</code><b className="unknown">UNAVAILABLE</b></div>
          </div>
        </section>
      </div>

      <aside className="settings-side-column">
        <section className="settings-reference-card privacy-card">
          <div className="settings-card-heading">
            <div><span className="settings-card-icon"><LockKeyhole size={17} /></span><div><h2>Privacy &amp; Redaction</h2></div></div>
          </div>
          {[['Bearer / JWT tokens', 'Redaction not verified'], ['API keys and secret-like values', 'No evidence source connected'], ['Session cookies', 'No cookie evidence loaded'], ['Sensitive URL parameters', 'No trace sanitizer endpoint']].map(([name, state]) => (
            <div className="privacy-rule" key={name}><b>{name}</b><span>{state}</span></div>
          ))}
          <div className="privacy-guarantee"><ShieldAlert size={16} /><div><b>Fixture mode is not a security verification.</b></div></div>
        </section>

        <section className="settings-reference-card containment-card">
          <div className="settings-card-heading">
            <div><span className="settings-card-icon"><ShieldAlert size={17} /></span><div><h2>Sandbox &amp; Approval</h2></div></div>
          </div>
          <div className="containment-record"><b>Runner service</b><span>Not connected</span></div>
          <div className="containment-record"><b>Outbound network policy</b><span>Not reported</span></div>
          <div className="containment-record"><b>Destructive operation gate</b><span>Backend enforcement unavailable</span></div>
          <div className="containment-record"><b>Local draft cache</b><span>Only reproproof-bug-draft</span></div>
        </section>
      </aside>
    </div>
  </main>
}

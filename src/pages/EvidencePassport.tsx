import { useCallback, useEffect, useState } from 'react'
import { Activity, ArrowRight, Camera, CheckCircle2, CircleAlert, Code2, Download, Fingerprint, Image, LockKeyhole, Network, RefreshCw, ShieldAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getBug } from '../api/bugs'
import { getEvidence } from '../api/evidence'
import { getRun } from '../api/runs'
import type { BugReport } from '../types/bug'
import type { EvidenceFile } from '../types/evidence'
import type { RunRecord } from '../types/run'

type Tab = 'Overview' | 'Attempt Comparison' | 'Screenshots' | 'Recordings' | 'Console Logs' | 'Network Traces'
const tabs: Tab[] = ['Overview', 'Attempt Comparison', 'Screenshots', 'Recordings', 'Console Logs', 'Network Traces']

function isActive(run: RunRecord): boolean {
  return run.status === 'running' || run.status === 'verifying'
    || run.status === 'approved' && run.progress?.phase === 'queued'
}

export default function EvidencePassport() {
  const { runId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('Overview')
  const [run, setRun] = useState<RunRecord | null>(null)
  const [bug, setBug] = useState<BugReport | null>(null)
  const [files, setFiles] = useState<EvidenceFile[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async (signal?: AbortSignal): Promise<RunRecord> => {
    const latestRun = await getRun(runId, signal)
    const [evidence, report] = await Promise.all([getEvidence(runId, signal), getBug(latestRun.bugReportId, signal)])
    if (signal?.aborted) return latestRun
    setRun(latestRun)
    setBug(report)
    setFiles(evidence.files)
    setError('')
    setLoading(false)
    return latestRun
  }, [runId])

  useEffect(() => {
    const controller = new AbortController()
    let failures = 0
    const poll = async () => {
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(() => void poll(), 5000)
        return
      }
      try {
        const latest = await refresh(controller.signal)
        failures = 0
        if (isActive(latest)) timer = window.setTimeout(() => void poll(), 1500)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load the run evidence.')
          setLoading(false)
          if (failures < 5) {
            const delay = Math.min(1000 * 2 ** failures, 8000)
            failures += 1
            timer = window.setTimeout(() => void poll(), delay)
          }
        }
      }
    }
    let timer: number | undefined
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [refresh, refreshKey])

  if (loading) return <main className="page passport-reference-page"><p role="status">Loading run and evidence…</p></main>
  if (error || !run) return <main className="page passport-reference-page"><section className="passport-content-card" role="alert"><h1>Evidence Passport unavailable</h1><p>{error || 'Run not found.'}</p><button className="secondary-button" onClick={() => { setLoading(true); setRefreshKey(key => key + 1) }}><RefreshCw size={14}/>Retry</button></section></main>

  const verdict = run.status === 'failed' ? 'Infrastructure failure' : run.execution?.result.replaceAll('_', ' ') ?? 'Not available yet'
  const screenshots = files.filter(file => file.type === 'screenshot')
  const recordings = files.filter(file => file.type === 'video')
  const consoleFiles = files.filter(file => file.type === 'console')
  const networkFiles = files.filter(file => file.type === 'network')
  const report = files.find(file => file.type === 'report' && file.storageKey.endsWith('/verification-report.json'))
  const activeFiles = tab === 'Screenshots' ? screenshots : tab === 'Recordings' ? recordings : tab === 'Console Logs' ? consoleFiles : tab === 'Network Traces' ? networkFiles : files

  return <main className="page passport-reference-page">
    <section className="passport-header-card"><div><div className="passport-kicker">EVIDENCE DOSSIER // LIVE RUN RECORD</div><h1>Evidence Passport <span>#{run.id.slice(0, 8).toUpperCase()}</span><b>{run.status.replaceAll('_', ' ').toUpperCase()}</b></h1><div className="passport-meta-line"><span><Code2 size={14}/> Chromium</span><i>·</i><span><b>{run.bugReportId}</b> Bug report</span><i>·</i><span>Updated {new Date(run.updatedAt).toLocaleString()}</span></div></div><div className="passport-header-actions"><button type="button" onClick={() => { setLoading(true); setRefreshKey(key => key + 1) }}><RefreshCw size={14}/>Refresh</button>{report?.downloadUrl && <a href={report.downloadUrl} target="_blank" rel="noreferrer"><Download size={14}/>Download report</a>}</div></section>
    <div className="passport-chain-strip"><LockKeyhole size={15}/><b>SERVER RECORDED STATE</b><span>{files.length} evidence records</span><span className="passport-chain-end"><ShieldAlert size={14}/>Sanitized metadata; artifacts may contain visible synthetic test data</span></div>
    <section className="verdict-dossier"><div className="verdict-leading"><span>{run.status === 'failed' ? <CircleAlert size={18}/> : <CheckCircle2 size={18}/>}</span><div><b>VERDICT: {verdict.toUpperCase()}</b><small>{run.progress?.message ?? (run.execution?.error || 'Verdict is reported by the backend after verification.')}</small></div></div><div className="verdict-rationale"><b>APPROVAL</b><p>{run.approval ? `${run.approval.decision} by ${run.approval.approver} at ${new Date(run.approval.decidedAt).toLocaleString()}` : 'No decision recorded'}</p><code>Plan SHA-256: {run.planHash}</code></div><aside className="verdict-statbox"><b>ATTEMPTS</b><strong>{run.execution?.attempts.length ?? 0} / 2</strong><small>{run.execution?.attempts.filter(attempt => attempt.completed).length ?? 0} completed</small><b>EVIDENCE ARTIFACTS</b><strong>{files.length} available</strong></aside></section>
    {isActive(run) && <div className="passport-content-card" role="status"><Activity size={15}/> {run.progress?.message ?? 'Waiting for browser worker…'} · {run.progress?.completedActions ?? 0}/{run.progress?.totalActions ?? run.plan.steps.length} actions · {run.progress?.completedAttempts ?? 0}/2 attempts</div>}
    <div className="passport-tabbar">{tabs.map(item=><button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'Overview' ? <ShieldAlert size={14}/> : item === 'Attempt Comparison' ? <Fingerprint size={14}/> : item === 'Screenshots' ? <Image size={14}/> : item === 'Recordings' ? <Camera size={14}/> : item === 'Console Logs' ? <Code2 size={14}/> : <Network size={14}/>} {item}{item === 'Screenshots' ? ` ${screenshots.length}` : item === 'Recordings' ? ` ${recordings.length}` : item === 'Console Logs' ? ` ${consoleFiles.length}` : item === 'Network Traces' ? ` ${networkFiles.length}` : ''}</button>)}</div>
    {tab === 'Attempt Comparison' ? <section className="passport-content-card"><div className="passport-content-heading"><div><h2>Attempt Comparison</h2><p>Results and normalized failure fingerprints from the backend.</p></div><span>{run.execution?.result.toUpperCase() ?? 'IN PROGRESS'}</span></div><div className="attempt-dossier-grid">{(run.execution?.attempts ?? []).map(attempt=><article key={attempt.attemptNumber}><header><b>ATTEMPT 0{attempt.attemptNumber}</b><span>{attempt.completed ? attempt.result.replaceAll('_', ' ') : 'Incomplete'}</span></header><h3>{attempt.expectedFailureFound ? 'Expected failure detected' : 'Expected failure absent'}</h3><div><span>Fingerprint</span><b>{attempt.fingerprint?.hash.slice(0, 16) ?? 'Not available'}</b></div><div><span>Evidence</span><b>{attempt.evidenceRecords.length} records</b></div>{attempt.error && <p>{attempt.error}</p>}</article>)}</div>{!run.execution?.attempts.length && <p>No attempts have been saved yet.</p>}</section>
      : tab === 'Overview' ? <><section className="passport-content-card"><div className="passport-content-heading"><div><h2>Evidence Summary</h2><p>Artifact metadata and server verification status.</p></div><span className="availability-pill">{files.length ? 'EVIDENCE AVAILABLE' : 'NO FILES YET'}</span></div><div className="evidence-status-grid"><article><Camera size={17}/><b>Screenshots</b><strong>{screenshots.length}</strong><small>Saved artifacts</small></article><article><Code2 size={17}/><b>Console logs</b><strong>{consoleFiles.length}</strong><small>Sanitized telemetry</small></article><article><Network size={17}/><b>Network traces</b><strong>{networkFiles.length}</strong><small>Sanitized telemetry</small></article><article><CheckCircle2 size={17}/><b>Verdict</b><strong>{verdict}</strong><small>Backend run state: {run.status}</small></article></div></section><section className="passport-content-card passport-steps-card"><h2>Bug Report &amp; Reproduction Context</h2>{bug ? <><h3>{bug.title}</h3><p>{bug.description}</p><div className="verdict-rationale"><b>EXPECTED</b><p>{bug.expectedBehavior}</p><b>REPORTED ACTUAL BEHAVIOR</b><p>{bug.actualBehavior}</p></div><h3>Ordered reproduction steps</h3><ol>{bug.steps.map(step=><li key={step.order}>{step.instruction}</li>)}</ol><p>Target: {bug.environment.targetUrl} · Browser: {bug.environment.browser}{bug.environment.appVersion ? ` · Build ${bug.environment.appVersion}` : ''}</p></> : <p>Bug report details are unavailable.</p>}<p>Run: {run.id} · Created: {new Date(run.createdAt).toLocaleString()}</p><Link to={`/runs/${run.id}/execution`}>Open live execution view <ArrowRight size={13}/></Link></section></>
      : <section className="passport-content-card"><div className="passport-content-heading"><div><h2>{tab}</h2><p>{tab === 'Recordings' ? 'TC1 recordings remain restricted because video frames have not been reviewed for sensitive content.' : 'Evidence download links are short-lived when backed by private Storage.'}</p></div><span className="availability-pill">{activeFiles.length} ITEMS</span></div>{activeFiles.map(file=><article className="evidence-live-item" key={file.id}><b>{file.type}</b><span>Attempt {file.attemptNumber} · {new Date(file.createdAt).toLocaleString()}</span>{file.downloadUrl ? <a href={file.downloadUrl} target="_blank" rel="noreferrer" download><Download size={13}/> {file.storageKey.split('/').pop()}</a> : <span role="note"><LockKeyhole size={13}/> {file.type === 'video' ? 'Restricted: unredacted recording stays private and cannot be downloaded or shared.' : 'Restricted: media redaction unavailable'}</span>}{file.downloadUrl && file.type === 'screenshot' && <a href={file.downloadUrl} target="_blank" rel="noreferrer"><img className="evidence-preview" src={file.downloadUrl} alt={`Attempt ${file.attemptNumber} screenshot`} loading="lazy"/></a>}</article>)}{activeFiles.length === 0 && <div className="evidence-unavailable"><LockKeyhole size={18}/><div><b>No {tab.toLowerCase()} are available</b><small>Nothing has been returned for this run yet.</small></div></div>}</section>}
    <div className="passport-footer-note"><LockKeyhole size={14}/> Verdicts distinguish successful execution from reproduction. “Not reproduced” is a valid completed result; infrastructure failures are reported separately.</div>
  </main>
}

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Download, LockKeyhole, RefreshCw, ShieldAlert, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getBugs } from '../api/bugs'
import { getRuns } from '../api/runs'
import { officialScenarios as scenarios } from '../data/qaScenarios'
import type { BugReport } from '../types/bug'
import type { RunRecord } from '../types/run'

function isActive(run: RunRecord): boolean {
  return ['approved', 'running', 'verifying'].includes(run.status)
}

function runLabel(run?: RunRecord): string {
  if (!run) return 'Not Run'
  if (run.status === 'approved' && run.progress?.phase === 'queued') return 'Queued'
  if (run.status === 'failed') return 'Infrastructure Failure'
  return run.status.replaceAll('_', ' ')
}

function exportMatrix(liveRuns: Record<string, RunRecord | undefined>) {
  const csv = ['Scenario,Title,Current state,Outcome,Run ID,Required validation', ...scenarios.map(s => {
    const run = liveRuns[s.id]
    return `${s.id},"${s.title}","${runLabel(run)}","${run?.execution?.result ?? 'pending'}","${run?.id ?? ''}","${s.checks.join('; ')}"`
  })].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'reproproof-qa-scenarios.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function QATestCases() {
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [latestBugs, latestRuns] = await Promise.all([getBugs(signal), getRuns(signal)])
      if (signal?.aborted) return
      setBugs(latestBugs)
      setRuns(latestRuns)
      setError('')
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Could not load live scenario runs.')
    } finally {
      if (!signal?.aborted) setLoaded(true)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void refresh(controller.signal), 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [refresh])

  const scenarioBugs = new Map(bugs.flatMap(bug => bug.environment.demoScenario ? [[bug.id, bug.environment.demoScenario] as const] : []))
  const liveRuns: Record<string, RunRecord | undefined> = {}
  for (const scenario of scenarios) {
    const reportIds = new Set([...scenarioBugs].filter(([, id]) => id === scenario.id).map(([bugId]) => bugId))
    liveRuns[scenario.id] = runs.filter(run => reportIds.has(run.bugReportId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  }
  const active = Object.values(liveRuns).some(run => run && isActive(run))

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => void refresh(controller.signal), 1500)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [active, refresh, runs])

  const completed = Object.values(liveRuns).filter(run => run && ['reproduced', 'not_reproduced', 'inconclusive', 'failed'].includes(run.status)).length
  const awaiting = Object.values(liveRuns).filter(run => run && ['awaiting_approval', 'approved', 'running', 'verifying'].includes(run.status)).length
  const notStarted = 4 - completed - awaiting

  return <main className="page qa-reference-page">
    <div className="qa-reference-heading"><div><h1>QA Test Cases &amp; Acceptance Suite <span>● LIVE SCENARIO RUNS</span></h1><p>Each scenario creates a normal bug report and plan. Review and approve each proposed plan before its browser run.</p></div><div className="page-toolbar"><button className="secondary-button" onClick={() => exportMatrix(liveRuns)}><Download size={14}/>Export QA Matrix</button><button className="secondary-button" onClick={() => void refresh()}><RefreshCw size={14}/>Refresh</button></div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="qa-summary-grid"><article><small>TOTAL SCENARIOS</small><strong>4 <em>Defined</em></strong><span>TC1–TC4 controlled demo cases</span></article><article><small>COMPLETED RUNS</small><strong>{completed} <em>of 4</em></strong><span><CheckCircle2 size={13}/> Completed outcomes are evidence-backed</span></article><article><small>AWAITING / ACTIVE</small><strong>{awaiting} <em>live</em></strong><span><Timer size={13}/> {notStarted} not started</span></article><article><small>MEDIA POLICY</small><strong>Masked images</strong><span><ShieldAlert size={13}/> Video is disabled without frame redaction</span></article></div>
    <div className="qa-protocol-heading"><h2>Official Acceptance Scenarios</h2><code>SCENARIOS · TC1–TC4</code></div>
    <div className="qa-scenario-list">{scenarios.map(s => {
      const run = liveRuns[s.id]
      const state = runLabel(run)
      const outcome = run?.execution?.result?.replaceAll('_', ' ') ?? 'Pending'
      return <article key={s.id} className={`qa-scenario ${s.tone}`}><div className="qa-scenario-main"><div className="qa-scenario-title"><span>{s.id}</span><h3>{s.title}</h3><b className={`qa-status ${run?.status === 'failed' ? 'blocked' : ''}`}>{state.toUpperCase()}</b></div><p>{s.detail}</p><div className="qa-metadata"><span>TARGET <b>{s.bug}</b></span><span>RELATED RUN <b>{run ? <Link to={`/runs/${encodeURIComponent(run.id)}`}>{run.id.slice(0, 12)}</Link> : 'No run yet'}</b></span><span>OUTCOME <b>{outcome}</b></span></div><div className="qa-checks">{s.checks.map(check => <span key={check}><LockKeyhole size={13}/>{check}</span>)}</div><Link to="/new-bug">Start {s.id} report <ArrowRight size={14}/></Link></div><aside className="qa-proof-panel"><b>{run?.status === 'failed' ? 'INFRASTRUCTURE STATE' : 'LATEST RUN'}</b><strong>{run ? state.toUpperCase() : loaded ? 'NOT RUN' : 'LOADING'}</strong><small>{run?.progress?.message ?? run?.execution?.error ?? (run ? `Verdict: ${outcome}.` : 'Start a report to generate a plan for human review.')}</small><span>{run ? `${s.id} · ${run.execution?.attempts.length ?? 0}/2 attempts` : `${s.id} · result pending`}</span></aside></article>
    })}</div>
    <div className="qa-reference-note"><ShieldAlert size={15}/> “Reproduced,” “Not reproduced,” and “Inconclusive” come from completed browser observations. Infrastructure failures remain separate.</div>
  </main>
}

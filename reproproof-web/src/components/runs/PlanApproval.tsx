import { useEffect, useState } from 'react'
import { CircleDot, Play, Sparkles } from 'lucide-react'
import { decideRunApproval, executeRun, getRun } from '../../api/runs'
import { baseUrl } from '../../api/client'
import type { PlanAction, RunRecord } from '../../types/run'
import './PlanApproval.css'

function describeAction(action: PlanAction | null): string {
  if (!action) return 'No browser action proposed'
  switch (action.type) {
    case 'navigate': return `Navigate to ${action.url}`
    case 'click': return `Click text: ${'text' in action.locator ? action.locator.text : 'name' in action.locator ? action.locator.name : action.locator.value}`
    case 'fill': return `Fill ${'text' in action.locator ? action.locator.text : 'name' in action.locator ? action.locator.name : action.locator.value} with the reported value`
    case 'select': return `Select ${action.value}`
    case 'wait': return `Wait ${action.milliseconds} ms`
    case 'screenshot': return `Capture screenshot: ${action.label}`
    case 'assert': return 'Check the reported assertion'
  }
}

export default function PlanApproval({ run, onUpdated }: { run: RunRecord; onUpdated: (run: RunRecord) => void }) {
  const { plan, status } = run
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')
  const [clock, setClock] = useState(() => Date.now())
  const approvalExpired = new Date(run.approvalExpiresAt).getTime() <= clock

  useEffect(() => {
    if (status !== 'running' && status !== 'verifying') return
    const controller = new AbortController()
    let timer: number | undefined
    const poll = async () => {
      try {
        const latest = await getRun(run.id, controller.signal)
        if (controller.signal.aborted) return
        onUpdated(latest)
        if (latest.status === 'running' || latest.status === 'verifying') {
          timer = window.setTimeout(() => void poll(), 1500)
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not refresh run status.')
      }
    }
    timer = window.setTimeout(() => void poll(), 1200)
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [run.id, status, onUpdated])

  useEffect(() => {
    const remaining = new Date(run.approvalExpiresAt).getTime() - Date.now()
    if (remaining <= 0) return
    const timer = window.setTimeout(() => setClock(Date.now()), remaining)
    return () => window.clearTimeout(timer)
  }, [run.approvalExpiresAt])

  const navigation = plan.steps.find(step => step.action?.type === 'navigate')?.action
  const destination = navigation?.type === 'navigate'
    ? navigation.url
    : plan.preconditions.find(item => item.startsWith('Approved target: '))?.slice('Approved target: '.length)
  const decide = async (decision: 'approved' | 'rejected') => {
    if (new Date(run.approvalExpiresAt).getTime() <= Date.now()) {
      setClock(Date.now())
      return
    }
    if (decision === 'rejected' && !window.confirm('Reject this plan and cancel the run?')) return
    setBusy(true)
    setError('')
    try {
      const updated = await decideRunApproval(run.id, decision, username, password)
      onUpdated(updated)
      setPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this decision.')
    } finally {
      setBusy(false)
    }
  }

  const execute = async () => {
    setExecuting(true)
    setError('')
    try {
      onUpdated(await executeRun(run.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not execute this approved run.')
    } finally {
      setExecuting(false)
    }
  }

  return <section className="panel plan-panel">
    <div className="panel-heading"><div><div className="eyebrow">AI GENERATED PLAN</div><h2>Reproduction plan</h2></div><span className="status-pill approval"><CircleDot size={12} /> {status.replaceAll('_', ' ')}</span></div>
    <p className="muted">{plan.summary}</p>
    {destination && <p className="muted"><b>Destination:</b> {destination}</p>}
    <div className="plan-ai"><Sparkles size={15} /><span>{run.execution ? `Browser attempt finished: ${run.execution.result.replaceAll('_', ' ')}.` : status === 'running' || status === 'verifying' ? 'Chromium is running. This page checks for the result automatically.' : 'Review the proposed actions and approve the plan before running Chromium.'}</span></div>
    {plan.preconditions.length > 0 && <><h3>Preconditions</h3><ul>{plan.preconditions.map(item => <li key={item}>{item}</li>)}</ul></>}
    {plan.clarifications.length > 0 && <div className="clarification-box" role="status"><b>Report details to clarify:</b><ul>{plan.clarifications.map(item => <li key={item}>{item}</li>)}</ul></div>}
    <ol className="plan-steps">{plan.steps.map(step => <li key={step.stepOrder}>
      <span>{step.stepOrder}</span><div><b>{step.instruction}</b><small>{describeAction(step.action)}</small><small>{step.rationale}</small>
        {step.clarification && <small role="status"><b>Clarification needed:</b> {step.clarification}</small>}
      </div>
    </li>)}</ol>
    <h3>Success criteria</h3><ul>{plan.successCriteria.map((criterion, index) => <li key={`${index}-${criterion}`}>{criterion}</li>)}</ul>
    <h3>Failure criteria</h3><ul>{plan.failureCriteria.map((criterion, index) => <li key={`${index}-${criterion}`}>{criterion}</li>)}</ul>
    {run.approval && <p className="muted">Decision {run.approval.decision} by {run.approval.approver} at {new Date(run.approval.decidedAt).toLocaleString()}.</p>}
    {status === 'approved' && !run.execution && <div className="approval-actions">
      {error && <p className="error-banner" role="alert">{error}</p>}
      <button type="button" className="primary-button" disabled={executing} onClick={() => void execute()}><Play size={14} /> {executing ? 'Running browser…' : 'Run approved plan'}</button>
    </div>}
    {run.execution && <div className="execution-evidence">
      <h3>Execution evidence</h3>
      <p className="muted">{new Date(run.execution.startedAt).toLocaleString()} – {new Date(run.execution.completedAt).toLocaleString()} · {run.execution.telemetry.length} telemetry events</p>
      {run.execution.error && <p className="error-banner" role="status">{run.execution.error}</p>}
      <ul className="evidence-files">{run.execution.files.map((file, index) => {
        const filename = file.file.split('/').pop() ?? file.file
        const href = `${baseUrl}/api/runs/${encodeURIComponent(run.id)}/artifacts/${file.kind}/${encodeURIComponent(filename)}`
        return <li key={`${file.kind}-${file.file}-${index}`}>
          <b>{file.kind}</b>{file.actionNumber ? ` · step ${file.actionNumber}` : ''}: <a href={href} target="_blank" rel="noreferrer">{file.file}</a>
          {file.kind === 'screenshot' && <a href={href} target="_blank" rel="noreferrer"><img className="evidence-preview" src={href} alt={`Screenshot ${file.actionNumber ?? 'checkpoint'}`} loading="lazy" /></a>}
          {file.kind === 'recording' && <video className="evidence-preview" src={href} controls preload="metadata" />}
        </li>
      })}</ul>
    </div>}
    {status === 'awaiting_approval' && <div className="approval-controls">
      <h3>Record your decision</h3>
      <p className="muted">Approval expires {new Date(run.approvalExpiresAt).toLocaleString()}. Your server-verified username is recorded with the decision.</p>
      {approvalExpired && <span className="approval-expired-badge" role="status">Approval window expired</span>}
      <div className="approval-credentials">
        <label>Approver username<input disabled={approvalExpired || busy} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
        <label>Password<input disabled={approvalExpired || busy} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="approval-actions">
        <button type="button" className="primary-button" disabled={approvalExpired || busy || !username || !password} onClick={() => void decide('approved')}>{busy ? 'Saving…' : 'Approve plan'}</button>
        <button type="button" className="secondary-button" disabled={approvalExpired || busy || !username || !password} onClick={() => void decide('rejected')}>Reject and cancel</button>
      </div>
    </div>}
  </section>
}

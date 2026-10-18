import { useState } from 'react'
import { ArrowLeft, ArrowRight, Paperclip, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { createBug } from '../../api/bugs'
import { createRun } from '../../api/runs'
import type { BugReportSubmission } from '../../types/bug'

export default function BugReportForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [stepsText, setStepsText] = useState('')
  const [expectedBehavior, setExpectedBehavior] = useState('')
  const [actualBehavior, setActualBehavior] = useState('')
  const [message, setMessage] = useState<string[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pendingBugId, setPendingBugId] = useState('')
  const navigate = useNavigate()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage([])
    const steps = stepsText.split('\n').map(instruction => instruction.trim()).filter(Boolean)
    const report: BugReportSubmission = {
      title,
      description,
      ...(steps.length ? { steps: steps.map((instruction, index) => ({ order: index + 1, instruction })) } : {}),
      ...(expectedBehavior.trim() ? { expectedBehavior: expectedBehavior.trim() } : {}),
      ...(actualBehavior.trim() ? { actualBehavior: actualBehavior.trim() } : {}),
      environment: { ...(targetUrl.trim() ? { targetUrl: targetUrl.trim() } : {}), browser: 'chromium' },
    }
    let savedBugId = pendingBugId
    try {
      if (!savedBugId) {
        const result = await createBug(report)
        if (result.status === 'clarification_required') {
          setMessage(result.clarificationRequests.map(item => item.question))
          return
        }
        savedBugId = result.bugReport.id
        setPendingBugId(savedBugId)
      }
      const run = await createRun(savedBugId)
      navigate(`/runs/${run.id}`)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Unknown error.'
      setError(savedBugId
        ? `Bug report saved, but plan generation failed: ${detail}`
        : `Could not submit the bug report: ${detail}`)
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="page form-page"><div className="back-link"><Link to="/"><ArrowLeft size={15} />Back to overview</Link></div><div className="form-heading"><div className="eyebrow">BUG REPORT</div><h1>What went wrong?</h1><p>Share the approved test target and the details needed for a safe, repeatable reproduction.</p></div>
    <form className="bug-form" onSubmit={submit}>
      <label>Bug title <span className="required">*</span><input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Checkout button does nothing" /></label>
      <label>Description <span className="required">*</span><textarea required maxLength={5000} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue and any useful context." /></label>
      <label>Approved test URL<input type="url" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="https://staging.example.com" /><small className="field-hint">Use a test environment you are authorized to access. Without a URL, the API will ask for clarification.</small></label>
      <label>Reproduction steps<textarea rows={4} value={stepsText} onChange={e => setStepsText(e.target.value)} placeholder={'Enter one action per line, for example:\nOpen the profile settings page\nClick the Save profile button'} /><small className="field-hint">Use specific actions. The API asks for clarification when steps are missing or too vague.</small></label>
      <div className="form-row"><label>Expected behavior<textarea rows={3} value={expectedBehavior} onChange={e => setExpectedBehavior(e.target.value)} placeholder="What should happen?" /></label><label>Actual behavior<textarea rows={3} value={actualBehavior} onChange={e => setActualBehavior(e.target.value)} placeholder="What happened instead?" /></label></div>
      <label>Browser<select value="chromium" disabled><option value="chromium">Chromium</option></select></label>
      <button type="button" className="attach-button"><Paperclip size={15} />Attach screenshot or recording</button>
      <div className="form-note"><Sparkles size={15} />Plans will use validated browser actions and require approval before execution.</div>
      {message.length > 0 && <div className="clarification-box" role="status"><b>A few details are needed before a plan can be prepared:</b><ul>{message.map(question => <li key={question}>{question}</li>)}</ul></div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="form-footer"><span>Provide enough detail to make the reproduction unambiguous.</span><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit bug report'} {!submitting && <ArrowRight size={16} />}</button></div>
    </form>
  </div>
}

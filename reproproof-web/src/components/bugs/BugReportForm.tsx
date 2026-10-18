import { useState } from 'react'
import { ArrowLeft, ArrowRight, Paperclip, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

export default function BugReportForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const navigate = useNavigate()
  function submit(event: React.FormEvent) { event.preventDefault(); if (title.trim()) { setSubmitted(true); window.setTimeout(() => navigate('/'), 1100) } }
  return <div className="page form-page"><div className="back-link"><Link to="/"><ArrowLeft size={15} />Back to overview</Link></div><div className="form-heading"><div className="eyebrow">BUG REPORT</div><h1>What went wrong?</h1><p>Tell us what you found. Reproproof will turn it into a reliable, repeatable test.</p></div>
    {submitted ? <div className="success-banner">✓ Bug report created. Your reproduction plan is being prepared.</div> : <form className="bug-form" onSubmit={submit}>
      <label>Bug title <span className="required">*</span><input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Checkout button does nothing on Safari" /></label>
      <div className="form-row"><label>Project<select defaultValue="Storefront"><option>Storefront</option><option>Accounts</option><option>Payments</option></select></label><label>Severity<select defaultValue="Medium"><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></div>
      <label>Description<textarea rows={5} value={description} onChange={e => setDescription(e.target.value)} placeholder="What did you expect to happen, and what happened instead? Include steps to reproduce if you can." /></label>
      <div className="form-row"><label>Browser<input placeholder="e.g. Safari 17.5" /></label><label>Environment<select defaultValue="Production"><option>Production</option><option>Staging</option><option>Development</option></select></label></div>
      <button type="button" className="attach-button"><Paperclip size={15} />Attach screenshot or recording</button>
      <div className="form-note"><Sparkles size={15} />AI will analyze your report and suggest a reproduction plan for your approval.</div>
      <div className="form-footer"><span>Fields marked <span className="required">*</span> are required</span><button className="primary-button" type="submit">Create bug report <ArrowRight size={16} /></button></div>
    </form>}
  </div>
}

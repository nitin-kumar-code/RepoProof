import { useState } from 'react'
import { ArrowRight, Check, Circle, LockKeyhole, Plus, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { createBug } from '../../api/bugs'
import { createRun } from '../../api/runs'
import type { BugReportSubmission } from '../../types/bug'

type Draft={title:string;description:string;targetUrl:string;stepsText:string;expectedBehavior:string;actualBehavior:string;service:string;severity:string;sandbox:string}
const blankDraft:Draft={title:'',description:'',targetUrl:'',stepsText:'',expectedBehavior:'',actualBehavior:'',service:'',severity:'High',sandbox:'Staging Sandbox'}
function readDraft():Draft{try{return {...blankDraft,...JSON.parse(localStorage.getItem('reproproof-bug-draft')||'{}') as Partial<Draft>}}catch{return blankDraft}}
export default function BugReportForm(){
 const [draft,setDraft]=useState<Draft>(readDraft)
 const [message,setMessage]=useState<string[]>([]);const [error,setError]=useState('');const [submitting,setSubmitting]=useState(false);const [pendingBugId,setPendingBugId]=useState('');const [draftSaved,setDraftSaved]=useState(false);const navigate=useNavigate()
 const set=(key:keyof Draft,value:string)=>setDraft(prev=>({...prev,[key]:value}))
 async function submit(event:React.FormEvent){
  event.preventDefault();setSubmitting(true);setError('');setMessage([])
  const steps=draft.stepsText.split('\n').map(instruction=>instruction.trim()).filter(Boolean)
  const report:BugReportSubmission={title:draft.title,description:draft.description,...(steps.length?{steps:steps.map((instruction,index)=>({order:index+1,instruction}))}:{}),...(draft.expectedBehavior.trim()?{expectedBehavior:draft.expectedBehavior.trim()}:{}),...(draft.actualBehavior.trim()?{actualBehavior:draft.actualBehavior.trim()}:{}),environment:{...(draft.targetUrl.trim()?{targetUrl:draft.targetUrl.trim()}:{}),browser:'chromium'}}
  let savedBugId=pendingBugId
  try{
   if(!savedBugId){
    const result=await createBug(report)
    if(result.status==='clarification_required'){setMessage(result.clarificationRequests.map(item=>item.question));return}
    savedBugId=result.bugReport.id;setPendingBugId(savedBugId);localStorage.removeItem('reproproof-bug-draft')
   }
   const run=await createRun(savedBugId)
   navigate(`/runs/${run.id}`)
  }catch(cause){
   const detail=cause instanceof Error?cause.message:'Unknown error.'
   setError(savedBugId?`Bug report was saved, but plan creation failed: ${detail}`:`Could not submit the bug report: ${detail}`)
  }finally{setSubmitting(false)}
 }
 function saveDraft(){localStorage.setItem('reproproof-bug-draft',JSON.stringify(draft));setDraftSaved(true)}
 return <main className="page form-page intake-page"><div className="intake-heading"><div><h1>New Bug Report</h1></div></div>
 <div className="bug-intake-grid"><form className="bug-form intake-form" onSubmit={submit}>
 <section className="intake-section"><div className="intake-section-title"><span>01</span><h2>Target Environment &amp; Bug Topology</h2><b>REQUIRED</b></div>
  <label><span className="field-label-row"><span>Deterministic Bug Title / Summary <i>*</i></span><code>{draft.title.length} / 120 chars</code></span><input required maxLength={120} value={draft.title} onChange={e=>set('title',e.target.value)} placeholder="Summarize the deterministic failure"/></label>
  <div className="form-row"><label>Target Core Service / Repository<select value={draft.service} onChange={e=>set('service',e.target.value)}><option value="">Select service (local context)</option>{['payments-service','identity-auth-service','ledger-reconciliation','notification-dispatcher'].map(x=><option key={x}>{x}</option>)}</select><small className="field-hint">Saved with local draft only; not sent to API.</small></label><fieldset className="severity-field"><legend>Reproduction Severity <span>LOCAL CONTEXT</span></legend><div className="severity-options">{[['Critical','CRIT'],['High','HIGH'],['Medium','MED'],['Low','LOW']].map(([value,label])=><label key={value} className={draft.severity===value?`severity-selected severity-${value.toLowerCase()}`:''}><input type="radio" name="severity" value={value} checked={draft.severity===value} onChange={()=>set('severity',value)}/>{draft.severity===value&&<i/>}{label}</label>)}</div></fieldset></div>
  <label><span className="field-label-row"><span>Target Route / API Ingress Endpoint</span><span className="safe-label">STAGE PERMITTED · VERIFY YOUR TARGET</span></span><input type="url" value={draft.targetUrl} onChange={e=>set('targetUrl',e.target.value)} placeholder="https://staging.example.com/api/route"/></label>
  <fieldset className="sandbox-field"><legend>Target Environment <span>HOST MUST BE ALLOWLISTED BY THE API</span></legend><div className="sandbox-options">{[['Local Docker','Use only an explicitly configured local development target','Local target policy applies'],['Staging Sandbox','Synthetic data only · use an authorized test target','Approved HTTPS origin required'],['Ephemeral VM','Use only when the target is allowlisted','Separate provisioning is not configured']].map(([name,description,foot])=><label key={name} className={draft.sandbox===name?'sandbox-selected':''}><input type="radio" name="sandbox" value={name} checked={draft.sandbox===name} onChange={()=>set('sandbox',name)}/><span className="sandbox-check">{draft.sandbox===name?<Check size={14}/>:<Circle size={13}/>}</span><b>{name}</b>{name==='Staging Sandbox'&&<em>RECOMMENDED</em>}<small>{description}</small><code>{foot}</code></label>)}</div></fieldset>
  <div className="human-gate-note"><ShieldCheck size={17}/><span><b>Human approval gate:</b> The API validates the target and plan. The browser runs only after you approve the plan.</span></div>
 </section>
 <section className="intake-section protocol-section"><div className="intake-section-title"><span>02</span><h2>Reproduction Steps &amp; Details</h2></div><label><span className="field-label-row"><span>Ordered Steps to Reproduce</span><button type="button" className="text-button" onClick={()=>set('stepsText',[draft.stepsText,'Navigate to the approved test page','Perform the action that triggers the reported issue','Record the observed result'].filter(Boolean).join('\n'))}><Plus size={14}/> Prepend Template</button></span><textarea rows={5} value={draft.stepsText} onChange={e=>set('stepsText',e.target.value)} placeholder={'1. Navigate to the relevant page\n2. Perform the action that triggers the issue\n3. Record what happened'} /></label><div className="protocol-stats"><span>Steps: <b>{draft.stepsText.split('\n').filter(x=>x.trim()).length}</b></span></div><label>Bug description<textarea rows={3} maxLength={5000} value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="What is the issue and when does it occur?" required/></label><div className="form-row"><label>Expected behavior<textarea rows={3} value={draft.expectedBehavior} onChange={e=>set('expectedBehavior',e.target.value)} placeholder="What should happen?"/></label><label>Actual behavior<textarea rows={3} value={draft.actualBehavior} onChange={e=>set('actualBehavior',e.target.value)} placeholder="What happened instead?"/></label></div>
 {message.length>0&&<div className="clarification-box" role="status"><b>More details are needed:</b><ul>{message.map(item=><li key={item}>{item}</li>)}</ul></div>}{error&&<div className="error-banner" role="alert">{error}</div>}{draftSaved&&<div className="draft-saved" role="status">Local draft saved in this browser only.</div>}
 </section><div className="intake-submit-row"><span><LockKeyhole size={16}/> Supported report details are sent to the configured API.</span><div><Link className="intake-cancel" to="/">Cancel</Link><button className="intake-save" type="button" onClick={saveDraft}>Save Draft (Local)</button><button className="primary-button" type="submit" disabled={submitting}><Sparkles size={15}/>{submitting?'Submitting…':'Submit Bug Report'}</button></div></div>
 </form><aside className="intake-aside"><section className="intake-side-card"><div className="aside-heading"><h3>Repro Compliance</h3></div><div className="compliance-status"><span>Target status:</span><b><ShieldCheck size={14}/> Checked on submit</b></div><div className="compliance-bar"><i/></div><ul><li><Circle size={13}/> Report field validation</li><li><Circle size={13}/> Sensitive credential detection</li><li><Circle size={13}/> Approved target check</li></ul></section><section className="intake-side-card cluster-card"><div className="aside-heading"><h3>Backend API</h3><span className="backend-indicator">●</span></div><Link to="/settings">Open connection status <ArrowRight size={14}/></Link></section></aside></div>
 </main>
}

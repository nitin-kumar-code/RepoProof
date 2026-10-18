import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus } from 'lucide-react'
import { bugs } from '../mocks/demoData'
import { getBugs } from '../api/bugs'
import type { BugSummary } from '../types/bug'

export default function Investigations() {
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('All severities')
  const [status, setStatus] = useState('All statuses')
  const [records,setRecords]=useState<BugSummary[]>(bugs)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  useEffect(()=>{let active=true; void getBugs().then(items=>{if(active){setRecords(items.map(item=>({id:item.id,title:item.title,project:'API report',status:'Open' as const,updatedAt:new Date(item.createdAt).toLocaleDateString(),severity:'Medium' as const})));setError('')}}).catch(()=>{if(active){setError('Could not load API reports. Showing labelled local mock records.')}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[])
  const filtered = useMemo(() => records.filter(b => `${b.id} ${b.title}`.toLowerCase().includes(query.toLowerCase()) && (severity === 'All severities' || b.severity === severity) && (status === 'All statuses' || b.status === status)), [records, query, severity, status])
  return <main className="page"><div className="welcome-row"><div><div className="eyebrow">BUG WORKSPACE</div><h1>Investigations</h1><p>Search and review API reports; local mock records appear when the API is unavailable.</p></div><Link className="primary-button" to="/new-bug"><Plus size={16}/>New report</Link></div><div className="panel" style={{marginTop:22}}><div className="panel-heading"><h2>Bug reports <span className="sub-count">{filtered.length}</span></h2><div className="filter-row"><label className="filter-search"><Search size={15}/><input aria-label="Search bug reports" placeholder="Search ID or title" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter severity" value={severity} onChange={e=>setSeverity(e.target.value)}><option>All severities</option>{['Critical','High','Medium','Low'].map(x=><option key={x}>{x}</option>)}</select><select aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option>{['Open','In progress','Resolved'].map(x=><option key={x}>{x}</option>)}</select></div></div>{loading&&<p className="muted">Loading reports…</p>}{error&&<p className="error-banner" role="status">{error}</p>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Bug</th><th>Project</th><th>Severity</th><th>Status</th><th>Updated</th><th>Run</th></tr></thead><tbody>{filtered.map(b=><tr key={b.id}><td><b>{b.id}</b><small>{b.title}</small></td><td>{b.project}</td><td>{b.severity}</td><td>{b.status}</td><td>{b.updatedAt}</td><td><Link to="/runs">View runs</Link></td></tr>)}</tbody></table></div>{filtered.length===0&&!loading&&<p className="empty-state">No reports match these filters.</p>}</div></main>
}

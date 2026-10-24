import { ChevronRight, Search, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { baseUrl } from '../../api/client'
import { getLocalProfile, LOCAL_PROFILE_UPDATED, type LocalProfile } from '../../api/profile'

const labels: Record<string,string>={'/':'Overview','/new-bug':'New Bug Report','/investigations':'Investigations','/runs':'Test Runs','/qa-test-cases':'QA Test Cases','/settings':'Settings & Diagnostics'}
export default function Header({health,onCheck}:{health:'checking'|'online'|'offline';onCheck:()=>void}) {
 const [profile,setProfile]=useState<LocalProfile>(()=>getLocalProfile())
 useEffect(()=>{const update=()=>setProfile(getLocalProfile());window.addEventListener(LOCAL_PROFILE_UPDATED,update);return()=>window.removeEventListener(LOCAL_PROFILE_UPDATED,update)},[])
 const location=useLocation(); const isEvidence=location.pathname.startsWith('/evidence/');const isRun=location.pathname.startsWith('/runs/');const title=labels[location.pathname]||(isEvidence?'Evidence Passports':location.pathname.includes('/execution')?'Live Execution':isRun?'Run Details & Plan Approval':'Overview')
 return <header className="header"><div className="breadcrumbs"><Link to="/">ReproProof</Link><ChevronRight size={14}/><Link to={isRun||isEvidence?'/investigations':'/'}>{isRun||isEvidence?'Investigations':title}</Link>{(isRun||isEvidence)&&<><ChevronRight size={14}/><strong>{isEvidence?location.pathname.split('/').pop():location.pathname.split('/')[2]||'RUN-891'}</strong></>}</div><div className="header-actions"><label className="global-search"><Search size={17}/><input placeholder="Search tests, traces…" aria-label="Search tests and traces"/><kbd>⌘K</kbd></label><Link className="header-new-bug" to="/new-bug">＋ <span>New Bug</span></Link><span className="header-divider"/><span className={`health-pill ${health}`} title={`Backend: ${baseUrl}/health`}><i/>{health==='checking'?'Checking API':health==='online'?'API online':'API offline'}</span><Link className="header-profile-link" to="/profile" aria-label={`Manage ${profile.name}'s profile`}><span className="header-user"><UserRound size={18}/></span><span className="user-copy"><b>{profile.name}</b><small>{profile.role}</small></span></Link><button className="refresh-health" onClick={onCheck} aria-label="Check backend connection">↻</button></div></header>
}

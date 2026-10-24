import { Bell, ChevronDown, Search, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { baseUrl } from '../../api/client'
import { getLocalProfile, LOCAL_PROFILE_UPDATED, type LocalProfile } from '../../api/profile'

export default function Header({health,onCheck}:{health:'checking'|'online'|'offline';onCheck:()=>void}) {
 const [profile,setProfile]=useState<LocalProfile>(()=>getLocalProfile())
 useEffect(()=>{const update=()=>setProfile(getLocalProfile());window.addEventListener(LOCAL_PROFILE_UPDATED,update);return()=>window.removeEventListener(LOCAL_PROFILE_UPDATED,update)},[])
 return <header className="header"><div className="header-actions"><label className="global-search"><Search size={17}/><input placeholder="Search tests, traces…" aria-label="Search tests and traces"/><kbd>⌘K</kbd></label><Link className="header-new-bug" to="/new-bug">＋ <span>New Bug</span></Link><button className="icon-button notification" aria-label="Notifications"><Bell size={19}/><i/></button><span className="header-divider"/><span className={`health-pill ${health}`} title={`Backend: ${baseUrl}/health`}><i/>{health==='checking'?'Checking API':health==='online'?'API online':'API offline'}</span><details className="account-menu"><summary className="account-summary" aria-label={`Manage ${profile.name}'s profile`}><span className="header-user"><UserRound size={18}/></span><span className="user-copy"><b>{profile.name}</b><small>{profile.role}</small></span><ChevronDown className="account-chevron" size={14}/></summary><div className="account-popover"><strong>{profile.name}</strong><span>{profile.role}</span><Link to="/profile">Manage profile</Link><Link to="/settings">Settings &amp; Diagnostics</Link></div></details><button className="refresh-health" onClick={onCheck} aria-label="Check backend connection">↻</button></div></header>
}

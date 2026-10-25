import { Activity, Bug, ClipboardCheck, LayoutDashboard, SearchCheck, Settings2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  return <><NavLink to="/" className="brand"><span className="brand-mark"><Bug size={19}/></span><span>ReproProof<small>DIAGNOSTICS</small></span><b className="brand-version">v1.4.2</b></NavLink><aside className="sidebar">
    <NavLink to="/new-bug" className="sidebar-new-bug"><span>＋</span>New Bug Report</NavLink>
    <nav className="nav-links">
      <NavLink to="/" end><LayoutDashboard size={19}/>Overview / Dashboard</NavLink>
      <NavLink to="/investigations"><SearchCheck size={19}/>Investigations / Bug Reports</NavLink>
      <NavLink to="/runs"><Activity size={19}/>Test Runs</NavLink>
      <NavLink to="/qa-test-cases"><ClipboardCheck size={19}/>QA Test Cases</NavLink>
      <NavLink to="/settings"><Settings2 size={19}/>Settings &amp; Diagnostics</NavLink>
    </nav>
    <div className="sidebar-spacer"/><section className="fixture-vault"><div className="vault-state"><i/> MOCK FIXTURES <b>READ-ONLY</b></div><div className="vault-grid"><span>ENV</span><strong>STAGING · SAFE</strong></div><div className="vault-team"><span>▦</span><div><b>workspace-01</b><small>Eng Team</small></div><span className="vault-chevron">⌃<br/>⌄</span></div></section>
  </aside></>
}

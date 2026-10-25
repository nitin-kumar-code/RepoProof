import { Activity, ClipboardCheck, LayoutDashboard, SearchCheck, Settings2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  return <><NavLink to="/" className="brand"><span className="brand-mark"><img src="/favicon.svg" alt="" aria-hidden="true" /></span><span>ReproProof<small>Evidence over assumptions</small></span></NavLink><aside className="sidebar">
    <NavLink to="/new-bug" className="sidebar-new-bug"><span>＋</span>New Bug Report</NavLink>
    <nav className="nav-links">
      <NavLink to="/" end><LayoutDashboard size={19}/>Overview / Dashboard</NavLink>
      <NavLink to="/investigations"><SearchCheck size={19}/>Investigations / Bug Reports</NavLink>
      <NavLink to="/runs"><Activity size={19}/>Test Runs</NavLink>
      <NavLink to="/qa-test-cases"><ClipboardCheck size={19}/>QA Test Cases</NavLink>
      <NavLink to="/settings"><Settings2 size={19}/>Settings &amp; Diagnostics</NavLink>
    </nav>
    <div className="sidebar-spacer"/>
  </aside></>
}

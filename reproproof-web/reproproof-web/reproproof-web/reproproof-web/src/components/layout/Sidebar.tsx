import { Activity, Bug, CircleHelp, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  return <aside className="sidebar">
    <NavLink to="/" className="brand"><span className="brand-mark"><ShieldCheck size={19} /></span><span>repro<span className="brand-light">proof</span></span></NavLink>
    <div className="workspace"><div className="workspace-avatar">N</div><div><b>Northstar Labs</b><small>Free workspace</small></div><span className="chevron">⌄</span></div>
    <div className="nav-label">WORKSPACE</div>
    <nav className="nav-links">
      <NavLink to="/" end><LayoutDashboard size={17} />Overview</NavLink>
      <NavLink to="/new-bug"><Bug size={17} />Bug reports <span className="nav-count">12</span></NavLink>
      <NavLink to="/runs"><Activity size={17} />Test runs</NavLink>
    </nav>
    <div className="sidebar-spacer" />
    <div className="usage-card"><div className="usage-title">Monthly runs <span>68%</span></div><div className="progress"><i /></div><small>68 of 100 runs used</small><a href="mailto:hello@reproproof.dev">Upgrade plan <span>↗</span></a></div>
    <nav className="nav-links bottom-links"><a href="mailto:support@reproproof.dev"><CircleHelp size={17} />Help center</a><a href="#settings"><Settings size={17} />Settings</a></nav>
    <div className="profile"><div className="profile-avatar">AM</div><div><b>Alex Morgan</b><small>alex@northstar.dev</small></div><span className="chevron">•••</span></div>
  </aside>
}

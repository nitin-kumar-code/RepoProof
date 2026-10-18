import { Bell, ChevronRight, Search } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { baseUrl } from '../../api/client'

const labels: Record<string, string> = { '/': 'Overview', '/new-bug': 'New bug report', '/investigations': 'Investigations', '/runs': 'Test runs', '/qa-test-cases': 'QA test cases', '/settings': 'Settings' }
export default function Header({ health, onCheck }: { health: 'checking' | 'online' | 'offline'; onCheck: () => void }) {
  const location = useLocation()
  const title = labels[location.pathname] || (location.pathname.includes('/execution') ? 'Live execution' : location.pathname.startsWith('/evidence/') ? 'Evidence passport' : location.pathname.startsWith('/runs/') ? 'Run details' : 'Overview')
  return <header className="header"><div className="breadcrumbs"><Link to="/">Workspace</Link><ChevronRight size={14} /><strong>{title}</strong></div><div className="header-actions"><button className="search-button"><Search size={16} /><span>Search anything...</span><kbd>⌘ K</kbd></button><button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><i /></button><span className={`health-pill ${health}`} title={`Backend: ${baseUrl}/health`}><i />{health === 'checking' ? 'Checking API' : health === 'online' ? 'API connected' : 'API offline'}</span><button className="refresh-health" onClick={onCheck} title="Check backend connection">↻</button></div></header>
}

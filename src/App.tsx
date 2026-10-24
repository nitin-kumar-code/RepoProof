import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import Dashboard from './pages/Dashboard'
import NewBug from './pages/NewBug'
import RunDetails from './pages/RunDetails'
import NotFound from './pages/NotFound'
import Runs from './pages/Runs'
import Investigations from './pages/Investigations'
import LiveExecution from './pages/LiveExecution'
import EvidencePassport from './pages/EvidencePassport'
import QATestCases from './pages/QATestCases'
import SettingsPage from './pages/Settings'
import Profile from './pages/Profile'
import { checkHealth } from './api/client'
import './App.css'
import './archival-theme.css'

function AppShell() {
  const location = useLocation()
  const coolRoute = location.pathname.startsWith('/runs') || location.pathname.startsWith('/evidence/')
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const refresh = useCallback(async () => { setHealth(await checkHealth() ? 'online' : 'offline') }, [])
  useEffect(() => {
    let mounted = true
    const updateHealth = () => {
      void checkHealth().then(online => {
        if (mounted) setHealth(online ? 'online' : 'offline')
      })
    }
    updateHealth()
    const timer = window.setInterval(updateHealth, 30000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [])
  return <div className={`app-shell ${location.pathname === '/new-bug' ? 'newbug-shell' : ''} ${coolRoute ? 'cool-shell' : ''}`}><Sidebar /><div className="main-area"><Header health={health} onCheck={() => void refresh()} /><Routes><Route path="/" element={<Dashboard />} /><Route path="/new-bug" element={<NewBug />} /><Route path="/investigations" element={<Investigations />} /><Route path="/runs" element={<Runs />} /><Route path="/runs/:id" element={<RunDetails />} /><Route path="/runs/:id/execution" element={<LiveExecution />} /><Route path="/evidence/:runId" element={<EvidencePassport />} /><Route path="/qa-test-cases" element={<QATestCases />} /><Route path="/settings" element={<SettingsPage health={health} onCheck={() => void refresh()} />} /><Route path="/profile" element={<Profile />} /><Route path="*" element={<NotFound />} /></Routes></div></div>
}
export default function App() { return <BrowserRouter><AppShell /></BrowserRouter> }

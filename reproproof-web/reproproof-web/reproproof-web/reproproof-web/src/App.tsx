import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import Dashboard from './pages/Dashboard'
import NewBug from './pages/NewBug'
import RunDetails from './pages/RunDetails'
import NotFound from './pages/NotFound'
import Runs from './pages/Runs'
import { checkHealth } from './api/client'
import './App.css'

function AppShell() {
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
  return <div className="app-shell"><Sidebar /><div className="main-area"><Header health={health} onCheck={() => void refresh()} /><Routes><Route path="/" element={<Dashboard />} /><Route path="/new-bug" element={<NewBug />} /><Route path="/runs" element={<Runs />} /><Route path="/runs/:id" element={<RunDetails />} /><Route path="*" element={<NotFound />} /></Routes></div></div>
}
export default function App() { return <BrowserRouter><AppShell /></BrowserRouter> }

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
  const refresh = useCallback(async () => { setHealth('checking'); setHealth(await checkHealth() ? 'online' : 'offline') }, [])
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer) }, [refresh])
  return <div className="app-shell"><Sidebar /><div className="main-area"><Header health={health} onCheck={() => void refresh()} /><Routes><Route path="/" element={<Dashboard />} /><Route path="/new-bug" element={<NewBug />} /><Route path="/runs" element={<Runs />} /><Route path="/runs/:id" element={<RunDetails />} /><Route path="*" element={<NotFound />} /></Routes></div></div>
}
export default function App() { return <BrowserRouter><AppShell /></BrowserRouter> }

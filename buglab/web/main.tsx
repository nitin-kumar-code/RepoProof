import React from 'react'
import { createRoot } from 'react-dom/client'
import { BugLab } from './ui'
import './style.css'

createRoot(document.getElementById('root')!).render(<React.StrictMode><BugLab /></React.StrictMode>)

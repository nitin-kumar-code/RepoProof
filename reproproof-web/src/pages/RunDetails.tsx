import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getRun } from '../api/runs'
import PlanApproval from '../components/runs/PlanApproval'
import type { RunRecord } from '../types/run'

export default function RunDetails() {
  const { id = '' } = useParams()
  const [state, setState] = useState<{ id: string; run: RunRecord | null; error: string }>({ id: '', run: null, error: '' })

  useEffect(() => {
    let active = true
    void getRun(id).then(result => {
      if (active) setState({ id, run: result, error: '' })
    }).catch(cause => {
      if (active) setState({ id, run: null, error: cause instanceof Error ? cause.message : 'Could not load this run.' })
    })
    return () => { active = false }
  }, [id])

  const error = state.id === id ? state.error : ''
  const run = state.id === id ? state.run : null

  return <div className="page run-detail">
    <div className="back-link"><Link to="/runs"><ArrowLeft size={15} />Back to runs</Link></div>
    {error ? <div className="error-banner" role="alert">{error}</div>
      : !run ? <p role="status">Loading plan…</p>
        : <>
          <div className="run-title-row"><div><div className="eyebrow">TEST RUN / {run.id}</div><h1>Reproduction plan</h1><p>Bug report {run.bugReportId} · Chromium · Created {new Date(run.createdAt).toLocaleString()}</p></div></div>
          <div className="run-detail-grid"><div className="run-main-column"><PlanApproval run={run} onUpdated={updated => setState(current => ({ ...current, run: updated }))} /></div></div>
        </>}
  </div>
}

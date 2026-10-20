import { Download, ShieldCheck } from 'lucide-react'
import { baseUrl } from '../../api/client'
import type { RunRecord } from '../../types/run'

export default function PassportReport({ run }: { run: RunRecord }) {
  const reportRecord = run.execution?.evidenceRecords.find(record => record.storageKey.endsWith('/verification-report.json'))
  const reportUrl = reportRecord
    ? `${baseUrl}/api/runs/${encodeURIComponent(run.id)}/evidence/${encodeURIComponent(reportRecord.id)}`
    : undefined
  const result = run.execution?.result.replaceAll('_', ' ') ?? 'Not available yet'

  return <section className="passport-card">
    <div className="passport-top">
      <div className="passport-icon"><ShieldCheck size={19} /></div>
      <span>REPRODUCTION PASSPORT</span>
      {reportUrl
        ? <a className="passport-download" href={reportUrl} download aria-label="Download evidence report"><Download size={16} /></a>
        : <button aria-label="Report not available" disabled><Download size={16} /></button>}
    </div>
    <h2>{run.execution ? 'Reproduction evidence' : 'Evidence passport'}</h2>
    <p>A portable report and evidence bundle for this browser run.</p>
    <div className="passport-meta">
      <span>RUN ID<b>{run.id.slice(0, 8).toUpperCase()}</b></span>
      <span>RESULT<b>{result}</b></span>
    </div>
    <div className="passport-footer">
      <span><i /> {reportRecord ? (reportRecord.sanitized ? 'Report sanitized' : 'Report needs review') : 'Evidence pending'}</span>
      {reportUrl && <a href={reportUrl} download>Download report ↗</a>}
    </div>
  </section>
}

import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import AttemptComparison from '../components/runs/AttemptComparison'
import ExecutionTimeline from '../components/runs/ExecutionTimeline'
import PlanApproval from '../components/runs/PlanApproval'
import EvidenceViewer from '../components/evidence/EvidenceViewer'
import PassportReport from '../components/evidence/PassportReport'
export default function RunDetails() {
  const { id = 'RUN-891' } = useParams()
  return <div className="page run-detail"><div className="back-link"><Link to="/runs"><ArrowLeft size={15} />Back to runs</Link></div><div className="run-title-row"><div><div className="eyebrow">RECORDED DEMO · {id}</div><h1>Checkout flow <span className="status-pill">Inconclusive</span></h1><p>Sample details only · not a live execution result</p></div><div className="run-title-actions"><Link className="secondary-button" to={`/runs/${id}/execution`}>View execution</Link><Link className="primary-button" to={`/evidence/${id}`}>Evidence passport</Link></div></div><div className="run-detail-grid"><div className="run-main-column"><PlanApproval /><ExecutionTimeline /><AttemptComparison /><EvidenceViewer /></div><aside className="run-side-column"><PassportReport /><div className="detail-info panel"><div className="eyebrow">RUN DETAILS · SAMPLE</div><dl><dt>Browser</dt><dd>Chromium (fixture)</dd><dt>Environment</dt><dd>Demo only</dd><dt>Execution service</dt><dd>Unavailable</dd></dl></div></aside></div></div>
}

import { ArrowLeft, ExternalLink, MoreHorizontal } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import AttemptComparison from '../components/runs/AttemptComparison'
import ExecutionTimeline from '../components/runs/ExecutionTimeline'
import PlanApproval from '../components/runs/PlanApproval'
import EvidenceViewer from '../components/evidence/EvidenceViewer'
import PassportReport from '../components/evidence/PassportReport'
export default function RunDetails() {
  const { id = 'RUN-891' } = useParams()
  return <div className="page run-detail"><div className="back-link"><Link to="/runs"><ArrowLeft size={15} />Back to runs</Link></div><div className="run-title-row"><div><div className="eyebrow">TEST RUN / {id}</div><h1>Checkout flow <span className="status-pill failed"><i />Failed</span></h1><p>Storefront <span>·</span> Safari 17.5 <span>·</span> Started today at 10:42 AM</p></div><div className="run-title-actions"><button className="secondary-button"><ExternalLink size={15} />Open bug report</button><button className="icon-button"><MoreHorizontal size={18} /></button></div></div><div className="run-detail-grid"><div className="run-main-column"><PlanApproval /><ExecutionTimeline /><AttemptComparison /><EvidenceViewer /></div><aside className="run-side-column"><PassportReport /><div className="detail-info panel"><div className="eyebrow">RUN DETAILS</div><dl><dt>Browser</dt><dd>Safari 17.5</dd><dt>Operating system</dt><dd>macOS 15.1</dd><dt>Viewport</dt><dd>1440 × 900</dd><dt>Agent</dt><dd>Reproproof AI 2.4</dd><dt>Started by</dt><dd>Alex Morgan</dd></dl></div></aside></div></div>
}

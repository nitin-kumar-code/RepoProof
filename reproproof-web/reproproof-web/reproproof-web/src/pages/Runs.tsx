import { ArrowRight, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { runs } from '../mocks/demoData'

export default function Runs() {
  return <div className="page"><div className="welcome-row"><div><div className="eyebrow">AUTOMATED CHECKS</div><h1>Test runs</h1><p>Review browser sessions and reproduction results across your projects.</p></div><button className="primary-button"><Play size={15} />Start a run</button></div><section className="panel runs-list-panel"><div className="panel-heading"><div><div className="eyebrow">RECENT ACTIVITY</div><h2>All test runs</h2></div><span className="sub-count">{runs.length} runs</span></div>{runs.map(run => <Link to={`/runs/${run.id}`} className="run-list-item" key={run.id}><span className={`run-symbol ${run.status.toLowerCase().replaceAll(' ', '-')}`}>{run.status === 'Passed' ? '✓' : run.status === 'Failed' ? '×' : '◷'}</span><span className="run-copy"><b>{run.title}</b><small>{run.id} · {run.project} · {run.duration}</small></span><span className={`status-pill ${run.status.toLowerCase().replaceAll(' ', '-')}`}><i />{run.status}</span><small className="run-time">{run.time}</small><ArrowRight size={15} className="run-list-arrow" /></Link>)}</section></div>
}

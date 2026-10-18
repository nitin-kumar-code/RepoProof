import { CircleDot, Sparkles } from 'lucide-react'
import type { AgentPlan, PlanAction, RunRecord } from '../../types/run'

function describeAction(action: PlanAction | null): string {
  if (!action) return 'No browser action proposed'
  switch (action.type) {
    case 'navigate': return `Navigate to ${action.url}`
    case 'click': return `Click text: ${'text' in action.locator ? action.locator.text : 'name' in action.locator ? action.locator.name : action.locator.value}`
    case 'fill': return `Fill ${'text' in action.locator ? action.locator.text : 'name' in action.locator ? action.locator.name : action.locator.value} with the reported value`
    case 'select': return `Select ${action.value}`
    case 'wait': return `Wait ${action.milliseconds} ms`
    case 'screenshot': return `Capture screenshot: ${action.label}`
    case 'assert': return 'Check the reported assertion'
  }
}

export default function PlanApproval({ plan, status }: { plan: AgentPlan; status: RunRecord['status'] }) {
  return <section className="panel plan-panel">
    <div className="panel-heading"><div><div className="eyebrow">AI GENERATED PLAN</div><h2>Reproduction plan</h2></div><span className="status-pill approval"><CircleDot size={12} /> {status.replaceAll('_', ' ')}</span></div>
    <p className="muted">{plan.summary}</p>
    <div className="plan-ai"><Sparkles size={15} /><span>No browser actions have run. Review the plan before execution is implemented.</span></div>
    {plan.preconditions.length > 0 && <><h3>Preconditions</h3><ul>{plan.preconditions.map(item => <li key={item}>{item}</li>)}</ul></>}
    {plan.clarifications.length > 0 && <div className="clarification-box" role="status"><b>Report details to clarify:</b><ul>{plan.clarifications.map(item => <li key={item}>{item}</li>)}</ul></div>}
    <ol className="plan-steps">{plan.steps.map(step => <li key={step.stepOrder}>
      <span>{step.stepOrder}</span><div><b>{step.instruction}</b><small>{describeAction(step.action)}</small><small>{step.rationale}</small>
        {step.clarification && <small role="status"><b>Clarification needed:</b> {step.clarification}</small>}
      </div>
    </li>)}</ol>
    <h3>Success criteria</h3><ul>{plan.successCriteria.map((criterion, index) => <li key={`${index}-${criterion}`}>{criterion}</li>)}</ul>
    <h3>Failure criteria</h3><ul>{plan.failureCriteria.map((criterion, index) => <li key={`${index}-${criterion}`}>{criterion}</li>)}</ul>
  </section>
}

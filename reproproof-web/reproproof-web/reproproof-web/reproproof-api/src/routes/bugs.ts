import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { bugRepository } from '../db/repository'
import { BugReportSchema, BugReportSubmissionSchema } from '../schemas/bug'

export const bugsRouter = Router()

const clarificationPrompts: Record<string, string> = {
  'environment.targetUrl': 'What approved test URL should the browser use?',
  steps: 'What exact actions should be followed to reproduce the issue?',
  expectedBehavior: 'What should happen when the steps are completed?',
  actualBehavior: 'What happened instead?',
}

function isSpecificStep(instruction: string): boolean {
  const normalized = instruction.trim().toLowerCase().replace(/[.!?]+$/, '')
  const vagueInstructions = new Set(['reproduce bug', 'test it', 'try again', 'check the page', 'do the steps'])
  return normalized.length >= 3 && !vagueInstructions.has(normalized)
}

bugsRouter.get('/', (_request, response) => {
  response.json(bugRepository.list())
})

bugsRouter.get('/:id', (request, response) => {
  const report = bugRepository.get(request.params.id)
  if (!report) {
    response.status(404).json({ error: 'bug_not_found' })
    return
  }
  response.json(report)
})

bugsRouter.post('/', (request, response) => {
  const parsed = BugReportSubmissionSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({
      error: 'invalid_bug_report',
      issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    })
    return
  }

  const submission = parsed.data
  const missing: string[] = []
  if (!submission.environment.targetUrl) missing.push('environment.targetUrl')
  if (!submission.steps?.length) missing.push('steps')
  else {
    submission.steps.forEach((step, index) => {
      if (!isSpecificStep(step.instruction)) missing.push(`steps.${index + 1}`)
    })
  }
  if (!submission.expectedBehavior) missing.push('expectedBehavior')
  if (!submission.actualBehavior) missing.push('actualBehavior')

  if (missing.length > 0) {
    response.status(202).json({
      status: 'clarification_required',
      complete: false,
      clarificationRequests: missing.map(field => {
        const stepOrder = Number(field.match(/^steps\.(\d+)$/)?.[1])
        return {
          field,
          question: Number.isInteger(stepOrder)
            ? `Could you make step ${stepOrder} more specific? Keep the intended action, even if it is brief.`
            : clarificationPrompts[field],
        }
      }),
    })
    return
  }

  const completeReport = BugReportSchema.safeParse({
    id: randomUUID(),
    ...submission,
    steps: submission.steps!,
    environment: { ...submission.environment, targetUrl: submission.environment.targetUrl! },
    expectedBehavior: submission.expectedBehavior!,
    actualBehavior: submission.actualBehavior!,
    createdAt: new Date().toISOString(),
  })

  if (!completeReport.success) {
    response.status(400).json({ error: 'invalid_bug_report', issues: completeReport.error.issues })
    return
  }

  const report = bugRepository.save(completeReport.data)
  response.status(201).json({ status: 'created', complete: true, bugReport: report })
})

import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { bugRepository } from '../db/repository'
import { BugReportSchema, BugReportSubmissionSchema } from '../schemas/bug'
import { containsCredentialMaterial } from '../services/secretDetection'
import { TargetValidationError, validateTargetUrl } from '../services/targetValidation'
import { env } from '../config/env'

export const bugsRouter = Router()

function formatZodIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map(issue => ({ path: issue.path.map(String).join('.'), message: issue.message }))
}

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

bugsRouter.get('/', async (_request, response) => {
  response.json(await bugRepository.list())
})

bugsRouter.get('/:id', async (request, response) => {
  const report = await bugRepository.get(request.params.id)
  if (!report) {
    response.status(404).json({ error: 'bug_not_found' })
    return
  }
  response.json(report)
})

bugsRouter.post('/', async (request, response) => {
  const parsed = BugReportSubmissionSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({
      error: 'invalid_bug_report',
      issues: formatZodIssues(parsed.error.issues),
    })
    return
  }

  const submission = parsed.data
  if (submission.environment.demoScenario) {
    const demoBase = env.BUGLAB_BASE_URL ? new URL(env.BUGLAB_BASE_URL) : undefined
    let target: URL | undefined
    try { target = submission.environment.targetUrl ? new URL(submission.environment.targetUrl) : undefined } catch { /* reported below */ }
    const expectedPath = submission.environment.demoScenario === 'TC3' ? '/sandbox'
      : submission.environment.demoScenario === 'TC4' ? '/scenarios/TC4' : '/'
    if (!demoBase || !target || target.origin !== demoBase.origin || target.pathname !== expectedPath || target.search || target.hash) {
      response.status(403).json({ error: 'buglab_demo_not_configured', message: 'The selected BugLab scenario must use the configured demo origin and its documented route.' })
      return
    }
  }
  const reportText = [submission.title, submission.description, ...(submission.steps ?? []).map(step => step.instruction),
    submission.expectedBehavior ?? '', submission.actualBehavior ?? '', submission.environment.targetUrl ?? '',
    submission.environment.appVersion ?? '', submission.environment.operatingSystem ?? '']
  if (containsCredentialMaterial(reportText)) {
    response.status(400).json({
      error: 'sensitive_data_detected',
      message: 'Remove passwords, API keys, access tokens, and credential values. Keep credentials in server-side configuration.',
    })
    return
  }
  const targetUrl = submission.environment.targetUrl
  if (targetUrl) {
    try {
      await validateTargetUrl(targetUrl)
    } catch (cause) {
      const code = cause instanceof TargetValidationError ? cause.code : 'target_private_or_unresolved'
      response.status(403).json({
        error: code,
        message: 'Target must use an explicitly approved HTTPS origin that resolves only to public addresses.',
      })
      return
    }
  }

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
    response.status(400).json({ error: 'invalid_bug_report', issues: formatZodIssues(completeReport.error.issues) })
    return
  }

  const report = await bugRepository.save(completeReport.data)
  response.status(201).json({ id: report.id, status: 'created', complete: true, bugReport: report })
})

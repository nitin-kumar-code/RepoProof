import { apiRequest } from './client'
import type { EvidenceResponse } from '../types/evidence'
import { evidenceResponseSchema } from '../schemas/api'

export const getEvidence = (runId: string, signal?: AbortSignal) => apiRequest<EvidenceResponse>(`/api/runs/${encodeURIComponent(runId)}/evidence`, { signal }, evidenceResponseSchema)

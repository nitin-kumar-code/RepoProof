import { apiRequest } from './client'
import type { EvidenceItem } from '../types/evidence'

export const getEvidence = (runId: string) => apiRequest<EvidenceItem[]>(`/api/runs/${encodeURIComponent(runId)}/evidence`)

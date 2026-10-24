import type { EvidenceRecord } from './run'

export interface EvidenceFile extends EvidenceRecord {
  downloadUrl: string | null
  restricted: boolean
}

export interface EvidenceResponse {
  runId: string
  files: EvidenceFile[]
}

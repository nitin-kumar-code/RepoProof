import type { EvidenceRecord } from './run'

export interface EvidenceFile extends EvidenceRecord {
  downloadUrl: string
}

export interface EvidenceResponse {
  runId: string
  files: EvidenceFile[]
}

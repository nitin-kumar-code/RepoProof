export interface EvidenceItem {
  id: string
  kind: 'Screenshot' | 'Video' | 'Log'
  label: string
  time: string
}

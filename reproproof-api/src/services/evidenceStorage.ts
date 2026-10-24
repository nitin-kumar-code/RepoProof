import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/env'
import { supabase } from '../db/client'
import type { EvidenceRecordSchema } from '../schemas/run'
import { z } from 'zod'

type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>

const contentTypes: Record<EvidenceRecord['type'], string> = {
  video: 'video/webm',
  screenshot: 'image/png',
  console: 'application/json',
  network: 'application/json',
  report: 'application/json',
}

/** Uploads evidence to the configured private bucket in production. Local runs stay on disk. */
export async function persistEvidenceFiles(runDirectory: string, records: EvidenceRecord[]): Promise<EvidenceRecord[]> {
  if (env.APP_ENV !== 'production' || !supabase) return records
  const uploaded: EvidenceRecord[] = []
  for (const record of records) {
    // Unsafe visual media is never copied to private Storage. The evidence API
    // independently denies access to records marked unsanitized.
    if (!record.sanitized) continue
    const prefix = `${record.runId.replace(/[^a-z0-9-]/gi, '_')}/`
    if (!record.storageKey.startsWith(prefix)) throw new Error('Invalid evidence storage key')
    const relative = record.storageKey.slice(prefix.length)
    const localPath = path.resolve(runDirectory, relative)
    if (!localPath.startsWith(`${path.resolve(runDirectory)}${path.sep}`)) throw new Error('Invalid evidence storage key')
    const content = await readFile(localPath)
    const { error } = await supabase.storage.from(env.EVIDENCE_STORAGE_BUCKET).upload(record.storageKey, content, {
      contentType: contentTypes[record.type],
      upsert: false,
    })
    if (error) throw error
    uploaded.push(record)
  }
  return uploaded
}

/** Returns a short-lived URL from the private evidence bucket. */
export async function createEvidenceDownloadUrl(storageKey: string): Promise<string | undefined> {
  if (env.APP_ENV !== 'production' || !supabase) return undefined
  const { data, error } = await supabase.storage.from(env.EVIDENCE_STORAGE_BUCKET).createSignedUrl(storageKey, 60)
  if (error) throw error
  return data.signedUrl
}


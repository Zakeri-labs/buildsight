"use client"

import type { StageTranslationPageData, StageTranslationRecord } from "@/lib/stage-translations/types"
import type { ReportCcRecipient } from "@/lib/report-cc/types"

const STORAGE_KEY = "buildsight-stage-translation-jobs-v1"
export const STAGE_TRANSLATION_JOB_EVENT = "buildsight:stage-translation-job"
const POLL_MS = 4_000
const MAX_POLL_CYCLES = 105

export type StageTranslationJob = {
  projectId: string
  stageId: string
  responseId: string
  retry?: boolean
}

type TranslationPayload = {
  data?: StageTranslationPageData
  ccRecipients?: ReportCcRecipient[]
  error?: string
}

const activeJobs = new Set<string>()

function jobKey(job: StageTranslationJob) {
  return `${job.projectId}:${job.stageId}:${job.responseId}`
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeJob(value: unknown): StageTranslationJob | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (!validUuid(row.projectId) || !validUuid(row.stageId) || !validUuid(row.responseId)) return null
  return {
    projectId: row.projectId,
    stageId: row.stageId,
    responseId: row.responseId,
    retry: row.retry === true,
  }
}

export function readStageTranslationJobs(): StageTranslationJob[] {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]")
    if (!Array.isArray(parsed)) return []
    const unique = new Map<string, StageTranslationJob>()
    for (const item of parsed) {
      const job = normalizeJob(item)
      if (job) unique.set(jobKey(job), job)
    }
    return Array.from(unique.values())
  } catch {
    return []
  }
}

function writeJobs(jobs: StageTranslationJob[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch {
    // Storage can be unavailable in restricted browser contexts. Automatic
    // preparation must never make an already successful Report submit fail.
  }
}

export function enqueueStageTranslationJob(job: StageTranslationJob) {
  if (typeof window === "undefined") return
  const normalized = normalizeJob(job)
  if (!normalized) return
  try {
    const jobs = readStageTranslationJobs()
    const key = jobKey(normalized)
    const existing = jobs.find((item) => jobKey(item) === key)
    const next = existing
      ? jobs.map((item) => jobKey(item) === key ? { ...item, retry: item.retry || normalized.retry } : item)
      : [...jobs, normalized]
    writeJobs(next)
    window.dispatchEvent(new CustomEvent(STAGE_TRANSLATION_JOB_EVENT))
  } catch {
    // The immediate job below can still run even if persistence/event delivery
    // is unavailable. Never surface queue bookkeeping as a Report save error.
  }
  void Promise.resolve().then(() => processStageTranslationJob(normalized)).catch((error) => {
    console.error("[stage-translation] immediate background worker paused", {
      projectId: normalized.projectId,
      stageId: normalized.stageId,
      responseId: normalized.responseId,
      message: error instanceof Error ? error.message : String(error),
    })
  })
}

export function removeStageTranslationJob(job: StageTranslationJob) {
  if (typeof window === "undefined") return
  const key = jobKey(job)
  writeJobs(readStageTranslationJobs().filter((item) => jobKey(item) !== key))
}

function clearRetryFlag(job: StageTranslationJob) {
  if (typeof window === "undefined") return
  const key = jobKey(job)
  writeJobs(readStageTranslationJobs().map((item) => jobKey(item) === key ? { ...item, retry: false } : item))
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

async function loadTranslation(job: StageTranslationJob, includeRecipients = false) {
  const params = new URLSearchParams({
    projectId: job.projectId,
    stageId: job.stageId,
    responseId: job.responseId,
    background: "1",
    ...(includeRecipients ? {} : { statusOnly: "1" }),
  })
  const response = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
  const payload = await response.json().catch(() => null) as TranslationPayload | null
  if (!response.ok) {
    const error = new Error(payload?.error || "Unable to check translation status.") as Error & { status?: number }
    error.status = response.status
    throw error
  }
  if (!payload?.data) throw new Error("Translation status is unavailable.")
  return { data: payload.data, ccRecipients: payload.ccRecipients ?? [] }
}

async function startTranslation(job: StageTranslationJob, retry: boolean) {
  const response = await fetch("/api/stage-translations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: retry ? "retry" : "start",
      projectId: job.projectId,
      stageId: job.stageId,
      responseId: job.responseId,
      background: true,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || "Unable to start translation.")
}

async function markPdfFailure(job: StageTranslationJob) {
  try {
    const response = await fetch("/api/stage-translations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pdf-failed",
        projectId: job.projectId,
        stageId: job.stageId,
        responseId: job.responseId,
        background: true,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

function allPdfPaths(record: StageTranslationRecord) {
  return Boolean(record.originalPdfPath && record.bilingualPdfPath)
}

async function generateMissingPdfs(
  job: StageTranslationJob,
  data: StageTranslationPageData,
  record: StageTranslationRecord,
  ccRecipients: ReportCcRecipient[],
) {
  const { exportTranslationPdf, storeTranslationPdf } = await import("@/lib/stage-translations/client-pdf")
  let current = { ...record }
  const kinds: Array<"original" | "bilingual"> = ["original", "bilingual"]
  for (const kind of kinds) {
    const existingPath = kind === "original" ? current.originalPdfPath : current.bilingualPdfPath
    if (existingPath) continue
    const exported = await exportTranslationPdf({
      data,
      translation: current,
      kind,
      ccRecipients,
      appendClosingBlock: true,
    })
    const storagePath = await storeTranslationPdf({
      projectId: job.projectId,
      translationId: current.id,
      kind,
      blob: exported.blob,
      filename: exported.filename,
    })
    current = {
      ...current,
      originalPdfPath: kind === "original" ? storagePath : current.originalPdfPath,
      bilingualPdfPath: kind === "bilingual" ? storagePath : current.bilingualPdfPath,
    }
  }
  return current
}

/**
 * Resume a queued Stage translation/PDF job using the existing browser PDF
 * renderer. Translation itself is durable server background work; this queue
 * persists across in-app navigation and reloads so PDF preparation continues
 * while the user keeps using the application.
 */
export async function processStageTranslationJob(job: StageTranslationJob) {
  if (typeof window === "undefined") return
  const normalized = normalizeJob(job)
  if (!normalized) return
  const key = jobKey(normalized)
  if (activeJobs.has(key)) return
  activeJobs.add(key)

  try {
    let retryRequested = Boolean(normalized.retry)
    let startRequested = false

    for (let cycle = 0; cycle < MAX_POLL_CYCLES; cycle += 1) {
      let snapshot: Awaited<ReturnType<typeof loadTranslation>>
      try {
        snapshot = await loadTranslation(normalized)
      } catch (error) {
        const status = (error as Error & { status?: number }).status
        if (status === 401 || status === 403 || status === 404) removeStageTranslationJob(normalized)
        throw error
      }

      if (!["submitted", "under_review", "rejected", "approved", "completed"].includes(snapshot.data.response.status)) {
        removeStageTranslationJob(normalized)
        return
      }

      const record = snapshot.data.translation
      const generatedAt = record?.generatedAt ? new Date(record.generatedAt).getTime() : 0
      const responseUpdatedAt = new Date(snapshot.data.response.updatedAt).getTime()
      const stale = Boolean(generatedAt && responseUpdatedAt > generatedAt)

      if (!record || stale) {
        if (!startRequested) {
          await startTranslation(normalized, retryRequested)
          retryRequested = false
          clearRetryFlag(normalized)
          startRequested = true
        }
        await wait(POLL_MS)
        continue
      }

      if (record.status === "failed") {
        if (retryRequested) {
          await startTranslation(normalized, true)
          retryRequested = false
          clearRetryFlag(normalized)
          startRequested = true
          await wait(POLL_MS)
          continue
        }
        removeStageTranslationJob(normalized)
        return
      }

      if (record.status === "pending" || !record.translatedContent) {
        // Re-submit a harmless start request periodically. The server-side
        // claim logic ignores active jobs and only reclaims genuinely stale
        // pending rows, protecting against duplicate OpenAI runs.
        if (!startRequested || cycle > 0 && cycle % 80 === 0) {
          await startTranslation(normalized, false)
          startRequested = true
        }
        await wait(POLL_MS)
        continue
      }

      if (record.status === "completed") {
        if (allPdfPaths(record)) {
          removeStageTranslationJob(normalized)
          return
        }
        try {
          const pdfSnapshot = await loadTranslation(normalized, true)
          const pdfRecord = pdfSnapshot.data.translation
          if (!pdfRecord || pdfRecord.status !== "completed" || !pdfRecord.translatedContent) {
            await wait(POLL_MS)
            continue
          }
          if (allPdfPaths(pdfRecord)) {
            removeStageTranslationJob(normalized)
            return
          }
          const completed = await generateMissingPdfs(normalized, pdfSnapshot.data, pdfRecord, pdfSnapshot.ccRecipients)
          if (allPdfPaths(completed)) removeStageTranslationJob(normalized)
          return
        } catch (error) {
          console.error("[stage-translation] automatic PDF preparation failed", {
            projectId: normalized.projectId,
            stageId: normalized.stageId,
            responseId: normalized.responseId,
            message: error instanceof Error ? error.message : String(error),
          })
          const markedFailed = await markPdfFailure(normalized)
          if (markedFailed) {
            removeStageTranslationJob(normalized)
            return
          }
          throw error
        }
      }

      await wait(POLL_MS)
    }
  } finally {
    activeJobs.delete(key)
  }
}

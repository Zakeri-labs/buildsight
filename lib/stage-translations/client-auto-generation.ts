"use client"

import type { StageTranslationPageData, StageTranslationRecord } from "@/lib/stage-translations/types"
import type { ReportCcRecipient } from "@/lib/report-cc/types"
import { logDiagnosticEvent } from "@/lib/stage-translations/debug-timeline"

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

    logDiagnosticEvent(normalized.responseId, "JOB_ENQUEUED", {
      projectId: normalized.projectId,
      stageId: normalized.stageId,
      responseId: normalized.responseId,
      retry: normalized.retry,
      queueLength: next.length,
    })

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
  const remaining = readStageTranslationJobs().filter((item) => jobKey(item) !== key)
  writeJobs(remaining)
  logDiagnosticEvent(job.responseId, "JOB_REMOVED", {
    projectId: job.projectId,
    stageId: job.stageId,
    responseId: job.responseId,
    remainingQueueLength: remaining.length,
  })
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

  logDiagnosticEvent(job.responseId, "TRANSLATION_STATUS_REQUEST", {
    projectId: job.projectId,
    stageId: job.stageId,
    includeRecipients,
  })

  const response = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
  const payload = await response.json().catch(() => null) as TranslationPayload | null

  if (!response.ok) {
    logDiagnosticEvent(job.responseId, "TRANSLATION_STATUS_RESULT", {
      httpStatus: response.status,
      error: payload?.error || "http_failed",
    })
    const error = new Error(payload?.error || "Unable to check translation status.") as Error & { status?: number }
    error.status = response.status
    throw error
  }
  if (!payload?.data) {
    logDiagnosticEvent(job.responseId, "TRANSLATION_STATUS_RESULT", {
      httpStatus: response.status,
      error: "payload_missing_data",
    })
    throw new Error("Translation status is unavailable.")
  }

  const rec = payload.data.translation
  logDiagnosticEvent(job.responseId, "TRANSLATION_STATUS_RESULT", {
    httpStatus: response.status,
    translationStatus: rec?.status || "missing",
    translatedContentPresent: Boolean(rec?.translatedContent),
    originalPdfPathPresent: Boolean(rec?.originalPdfPath),
    bilingualPdfPathPresent: Boolean(rec?.bilingualPdfPath),
    arabicPdfPathPresent: Boolean(rec?.arabicPdfPath),
    generatedAt: rec?.generatedAt || null,
  })

  return { data: payload.data, ccRecipients: payload.ccRecipients ?? [] }
}

async function startTranslation(job: StageTranslationJob, retry: boolean) {
  logDiagnosticEvent(job.responseId, "TRANSLATION_POST", {
    caller: "client_auto_generation",
    action: retry ? "retry" : "start",
    projectId: job.projectId,
    stageId: job.stageId,
  })

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

  logDiagnosticEvent(job.responseId, "TRANSLATION_POST_RESULT", {
    httpStatus: response.status,
    shouldRun: payload?.started,
    status: payload?.translation?.status,
    reason: payload?.debug?.reason || payload?.reason,
    translationId: payload?.translation?.id,
    error: payload?.error,
  })

  if (!response.ok) throw new Error(payload?.error || "Unable to start translation.")
}

async function markPdfFailure(job: StageTranslationJob) {
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
}

function allPdfPaths(record: StageTranslationRecord) {
  return Boolean(record.originalPdfPath && record.bilingualPdfPath)
}

async function generateMissingPdfs(
  job: StageTranslationJob,
  data: StageTranslationPageData,
  translation: StageTranslationRecord,
  ccRecipients: ReportCcRecipient[],
) {
  let currentRecord = translation

  if (!currentRecord.originalPdfPath) {
    try {
      logDiagnosticEvent(job.responseId, "WORKER_PDF_GENERATION_START", {
        kind: "original",
        translationId: currentRecord.id,
        projectId: job.projectId,
        stageId: job.stageId,
        responseId: job.responseId,
      })

      const originalPdf = await exportTranslationPdf({
        data,
        translation: currentRecord,
        kind: "original",
        ccRecipients,
        appendClosingBlock: true,
      })

      const originalPdfPath = await storeTranslationPdf({
        projectId: job.projectId,
        translationId: currentRecord.id,
        kind: "original",
        blob: originalPdf.blob,
        filename: originalPdf.filename,
        responseId: job.responseId,
        caller: "background_worker",
      })

      currentRecord = { ...currentRecord, originalPdfPath }

      logDiagnosticEvent(job.responseId, "WORKER_PDF_GENERATION_SUCCESS", {
        kind: "original",
        originalPdfPath,
        translationId: currentRecord.id,
        projectId: job.projectId,
        stageId: job.stageId,
        responseId: job.responseId,
      })
    } catch (originalError) {
      console.warn("[stage-translation] original PDF preparation error, continuing with bilingual:", originalError)
      logDiagnosticEvent(job.responseId, "WORKER_PDF_GENERATION_FAILED_RETRYING", {
        kind: "original",
        error: originalError instanceof Error ? originalError.message : String(originalError),
        translationId: currentRecord.id,
        projectId: job.projectId,
        stageId: job.stageId,
        responseId: job.responseId,
      })
    }
  }

  if (!currentRecord.bilingualPdfPath) {
    try {
      logDiagnosticEvent(job.responseId, "WORKER_PDF_GENERATION_START", {
        kind: "bilingual",
        translationId: currentRecord.id,
        projectId: job.projectId,
        stageId: job.stageId,
        responseId: job.responseId,
      })

      const bilingualPdf = await exportTranslationPdf({
        data,
        translation: currentRecord,
        kind: "bilingual",
        ccRecipients,
        appendClosingBlock: true,
      })

      const bilingualPdfPath = await storeTranslationPdf({
        projectId: job.projectId,
        translationId: currentRecord.id,
        kind: "bilingual",
        blob: bilingualPdf.blob,
        filename: bilingualPdf.filename,
        responseId: job.responseId,
        caller: "background_worker",
      })

      currentRecord = { ...currentRecord, bilingualPdfPath }

      logDiagnosticEvent(job.responseId, "WORKER_PDF_GENERATION_SUCCESS", {
        kind: "bilingual",
        bilingualPdfPath,
        translationId: currentRecord.id,
        projectId: job.projectId,
        stageId: job.stageId,
        responseId: job.responseId,
      })
    } catch (bilingualError) {
      console.warn("[stage-translation] bilingual PDF preparation error:", bilingualError)
      logDiagnosticEvent(job.responseId, "WORKER_PDF_GENERATION_FAILED_RETRYING", {
        kind: "bilingual",
        error: bilingualError instanceof Error ? bilingualError.message : String(bilingualError),
        translationId: currentRecord.id,
        projectId: job.projectId,
        stageId: job.stageId,
        responseId: job.responseId,
      })
    }
  }

  return currentRecord
}

export async function processStageTranslationJob(job: StageTranslationJob) {
  const normalized = normalizeJob(job)
  if (!normalized) return
  const key = jobKey(normalized)
  if (activeJobs.has(key)) {
    logDiagnosticEvent(normalized.responseId, "WORKER_PROCESS_SKIPPED", {
      reason: "job_already_active",
      key,
    })
    return
  }

  activeJobs.add(key)
  logDiagnosticEvent(normalized.responseId, "WORKER_PROCESS_START", {
    key,
    projectId: normalized.projectId,
    stageId: normalized.stageId,
    retry: normalized.retry,
  })

  let retryRequested = Boolean(normalized.retry)

  try {
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

      const validStatuses = ["submitted", "under_review", "rejected", "approved", "completed"]
      if (!validStatuses.includes(snapshot.data.response.status)) {
        // Allow grace cycles for in-flight database status transitions
        if (cycle >= 5) {
          removeStageTranslationJob(normalized)
          return
        }
        await wait(POLL_MS)
        continue
      }

      const record = snapshot.data.translation
      const generatedAt = record?.generatedAt ? new Date(record.generatedAt).getTime() : 0
      const responseUpdatedAt = new Date(snapshot.data.response.updatedAt).getTime()
      const stale = Boolean(generatedAt && responseUpdatedAt > generatedAt)

      logDiagnosticEvent(normalized.responseId, "STALE_CHECK", {
        caller: "processStageTranslationJob",
        responseUpdatedAt: snapshot.data.response.updatedAt,
        generatedAt: record?.generatedAt || null,
        stale,
      })

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
        logDiagnosticEvent(normalized.responseId, "WORKER_EXIT_FAILED_STATE", {
          status: "failed",
        })
        removeStageTranslationJob(normalized)
        return
      }

      if (record.status === "pending" || !record.translatedContent) {
        // Re-submit a harmless start request periodically. The server-side
        // claim logic ignores active jobs and only reclaims genuinely stale
        // pending rows, protecting against duplicate OpenAI runs.
        if (!startRequested || (cycle > 0 && cycle % 80 === 0)) {
          await startTranslation(normalized, false)
          startRequested = true
        }
        await wait(POLL_MS)
        continue
      }

      if (record.status === "completed") {
        logDiagnosticEvent(normalized.responseId, "WORKER_TRANSLATION_COMPLETED_DETECTED", {
          translationId: record.id,
          hasTranslatedContent: Boolean(record.translatedContent),
          originalPdfPath: record.originalPdfPath || null,
          bilingualPdfPath: record.bilingualPdfPath || null,
          projectId: normalized.projectId,
          stageId: normalized.stageId,
        })

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

          if (completed.bilingualPdfPath) {
            // Verify that the stored PDF is reachable in Supabase Storage
            let verified = false
            try {
              const verifyUrl = `/api/stage-translations/pdf?projectId=${normalized.projectId}&translationId=${completed.id}&kind=bilingual`
              const verifyRes = await fetch(verifyUrl, { method: "HEAD", cache: "no-store" })
              if (verifyRes.ok || verifyRes.status === 200 || verifyRes.status === 302) {
                verified = true
              } else {
                const verifyGet = await fetch(verifyUrl, { method: "GET", cache: "no-store" })
                if (verifyGet.ok) verified = true
              }
            } catch {
              verified = Boolean(completed.bilingualPdfPath)
            }

            if (verified) {
              logDiagnosticEvent(normalized.responseId, "WORKER_PDF_READY_VERIFICATION_SUCCESS", {
                bilingualPdfPath: completed.bilingualPdfPath,
                originalPdfPath: completed.originalPdfPath || null,
                translationId: completed.id,
                projectId: normalized.projectId,
                stageId: normalized.stageId,
              })

              removeStageTranslationJob(normalized)
              return
            }
          }

          // If PDF generation did not yield a verified bilingual path, log and retry on next cycle
          logDiagnosticEvent(normalized.responseId, "WORKER_PDF_GENERATION_FAILED_RETRYING", {
            cycle,
            translationId: pdfRecord.id,
            bilingualPdfPath: completed.bilingualPdfPath || null,
            projectId: normalized.projectId,
            stageId: normalized.stageId,
          })
        } catch (error) {
          console.error("[stage-translation] automatic PDF preparation error, retrying on next cycle:", {
            projectId: normalized.projectId,
            stageId: normalized.stageId,
            responseId: normalized.responseId,
            message: error instanceof Error ? error.message : String(error),
          })

          logDiagnosticEvent(normalized.responseId, "WORKER_PDF_GENERATION_FAILED_RETRYING", {
            cycle,
            error: error instanceof Error ? error.message : String(error),
            projectId: normalized.projectId,
            stageId: normalized.stageId,
          })
        }
      }

      await wait(POLL_MS)
    }
  } finally {
    activeJobs.delete(key)
    logDiagnosticEvent(normalized.responseId, "WORKER_COMPLETE", {
      key,
    })
  }
}

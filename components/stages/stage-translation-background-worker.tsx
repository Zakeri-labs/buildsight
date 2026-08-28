"use client"

import { useEffect, useRef } from "react"
import {
  processStageTranslationJob,
  readStageTranslationJobs,
  STAGE_TRANSLATION_JOB_EVENT,
} from "@/lib/stage-translations/client-auto-generation"
import { logDiagnosticEvent } from "@/lib/stage-translations/debug-timeline"

export function StageTranslationBackgroundWorker() {
  const draining = useRef(false)

  useEffect(() => {
    let disposed = false

    const drain = async () => {
      if (disposed || draining.current) return
      draining.current = true
      try {
        const jobs = readStageTranslationJobs()
        for (const job of jobs) {
          if (disposed) break
          logDiagnosticEvent(job.responseId, "WORKER_JOB_DETECTED", {
            projectId: job.projectId,
            stageId: job.stageId,
            responseId: job.responseId,
          })
          try {
            await processStageTranslationJob(job)
          } catch (error) {
            console.error("[stage-translation] background worker paused", {
              projectId: job.projectId,
              stageId: job.stageId,
              responseId: job.responseId,
              message: error instanceof Error ? error.message : String(error),
            })
          }
        }
      } finally {
        draining.current = false
      }
    }

    const onQueued = () => void drain()
    window.addEventListener(STAGE_TRANSLATION_JOB_EVENT, onQueued)
    void drain()
    const interval = window.setInterval(() => void drain(), 20_000)

    return () => {
      disposed = true
      window.removeEventListener(STAGE_TRANSLATION_JOB_EVENT, onQueued)
      window.clearInterval(interval)
    }
  }, [])

  return null
}

import { after } from "next/server"
import { NextRequest, NextResponse } from "next/server"
import { assertProjectMember, AuthzError } from "@/lib/auth/guards"
import { getSelectedProjectId } from "@/lib/project-scope"
import { loadReportCcRecipients } from "@/lib/report-cc/server"
import { loadStageTranslationPageData } from "@/lib/stage-translations/data"
import {
  generateStageTranslation,
  markStageTranslationGenerationFailure,
  markStageTranslationPdfFailure,
  prepareStageTranslationGeneration,
} from "@/lib/stage-translations/generate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")
    const stageId = request.nextUrl.searchParams.get("stageId")
    const termId = request.nextUrl.searchParams.get("termId")
    const responseId = request.nextUrl.searchParams.get("responseId")
    if (!validUuid(projectId) || !validUuid(stageId) || !validUuid(responseId)) return NextResponse.json({ error: "A valid project, stage, and report are required." }, { status: 400 })
    const isBackgroundRequest = request.nextUrl.searchParams.get("background") === "1"
    const selectedProjectId = await getSelectedProjectId()
    if (!isBackgroundRequest && selectedProjectId && selectedProjectId !== projectId) return NextResponse.json({ error: "Select this project before opening its report." }, { status: 403 })
    const userId = await assertProjectMember(projectId)
    const statusOnly = request.nextUrl.searchParams.get("statusOnly") === "1"
    const [data, ccRecipients] = await Promise.all([
      loadStageTranslationPageData(projectId, stageId, userId, responseId, termId),
      statusOnly ? Promise.resolve([]) : loadReportCcRecipients(projectId, responseId, "report"),
    ])
    if (!data) return NextResponse.json({ error: "Report not found." }, { status: 404 })
    return NextResponse.json({ data, ccRecipients }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : error instanceof Error ? error.message : "Unable to load translation." }, { status: error instanceof AuthzError ? 403 : 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const projectId = body.projectId
    const stageId = body.stageId
    const responseId = body.responseId
    const termId = typeof body.termId === "string" ? body.termId : null
    const action = typeof body.action === "string" ? body.action : "start"
    if (!validUuid(projectId) || !validUuid(stageId) || !validUuid(responseId)) return NextResponse.json({ error: "A valid project, stage, and report are required." }, { status: 400 })
    if (!new Set(["start", "retry", "pdf-failed"]).has(action)) return NextResponse.json({ error: "Invalid translation action." }, { status: 400 })

    const isBackgroundRequest = body.background === true
    const selectedProjectId = await getSelectedProjectId()
    if (!isBackgroundRequest && selectedProjectId && selectedProjectId !== projectId) return NextResponse.json({ error: "Select this project before translating its report." }, { status: 403 })
    const userId = await assertProjectMember(projectId)

    if (action === "pdf-failed") {
      await markStageTranslationPdfFailure({ projectId, stageId, responseId, actorId: userId })
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
    }

    // The active workflow is direct Project -> Stage -> Report. Keep the old
    // Term route functional without making it part of the automatic Stage job.
    if (termId && validUuid(termId) && termId !== stageId) {
      const translation = await generateStageTranslation({ projectId, stageId, termId, responseId, actorId: userId })
      return NextResponse.json({ translation, started: true }, { headers: { "Cache-Control": "no-store" } })
    }

    const prepared = await prepareStageTranslationGeneration({
      projectId,
      stageId,
      responseId,
      actorId: userId,
      retry: action === "retry",
    })

    if (prepared.shouldRun) {
      after(async () => {
        try {
          await generateStageTranslation({ projectId, stageId, responseId, actorId: userId })
        } catch (error) {
          await markStageTranslationGenerationFailure({ projectId, stageId, responseId }).catch(() => undefined)
          console.error("[stage-translation] background generation failed", {
            traceId: responseId,
            projectId,
            stageId,
            responseId,
            translationId: prepared.translationId,
            stage: "ai_translation",
            code: "AI_TRANSLATION_FAILED",
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          })
        }
      })
    }

    return NextResponse.json({
      translation: {
        id: prepared.translationId,
        status: prepared.status,
        translatedContentReady: prepared.translatedContentReady,
      },
      started: prepared.shouldRun,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[stage-translation] API request error", {
      stage: "ai_translation",
      code: error instanceof AuthzError ? "FORBIDDEN" : "API_ERROR",
      message: error instanceof Error ? error.message : "Unable to process request",
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : error instanceof Error ? error.message : "Unable to start translation." }, { status: error instanceof AuthzError ? 403 : 500 })
  }
}

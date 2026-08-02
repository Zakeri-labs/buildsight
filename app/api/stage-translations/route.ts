import { NextRequest, NextResponse } from "next/server"
import { assertProjectMember, AuthzError } from "@/lib/auth/guards"
import { getSelectedProjectId } from "@/lib/project-scope"
import { loadStageTranslationPageData } from "@/lib/stage-translations/data"
import { generateStageTranslation } from "@/lib/stage-translations/generate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")
    const stageId = request.nextUrl.searchParams.get("stageId")
    const responseId = request.nextUrl.searchParams.get("responseId")
    if (!validUuid(projectId) || !validUuid(stageId) || !validUuid(responseId)) return NextResponse.json({ error: "A valid project, stage, and report are required." }, { status: 400 })
    const selectedProjectId = await getSelectedProjectId()
    if (selectedProjectId && selectedProjectId !== projectId) return NextResponse.json({ error: "Select this project before opening its report." }, { status: 403 })
    const userId = await assertProjectMember(projectId)
    const data = await loadStageTranslationPageData(projectId, stageId, userId, responseId)
    if (!data) return NextResponse.json({ error: "Report not found." }, { status: 404 })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : error instanceof Error ? error.message : "Unable to load translation." }, { status: error instanceof AuthzError ? 403 : 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    if (!validUuid(body.projectId) || !validUuid(body.stageId) || !validUuid(body.responseId)) return NextResponse.json({ error: "A valid project, stage, and report are required." }, { status: 400 })
    const selectedProjectId = await getSelectedProjectId()
    if (selectedProjectId && selectedProjectId !== body.projectId) return NextResponse.json({ error: "Select this project before translating its report." }, { status: 403 })
    const translation = await generateStageTranslation({ projectId: body.projectId, stageId: body.stageId, responseId: body.responseId })
    return NextResponse.json({ translation })
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthzError ? error.message : error instanceof Error ? error.message : "Unable to generate translation." }, { status: error instanceof AuthzError ? 403 : 500 })
  }
}

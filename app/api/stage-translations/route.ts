import { NextRequest, NextResponse } from "next/server"
import { AuthzError } from "@/lib/auth/guards"
import { getSelectedProjectId } from "@/lib/project-scope"
import { generateStageTranslation } from "@/lib/stage-translations/generate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    if (!validUuid(body.projectId) || !validUuid(body.stageId) || !validUuid(body.termId)) {
      return NextResponse.json({ error: "A valid project, stage, and term are required." }, { status: 400 })
    }

    const selectedProjectId = await getSelectedProjectId()
    if (!selectedProjectId || selectedProjectId !== body.projectId) {
      return NextResponse.json({ error: "The selected project is no longer active. Select the project again." }, { status: 400 })
    }

    const translation = await generateStageTranslation({
      projectId: body.projectId,
      stageId: body.stageId,
      termId: body.termId,
    })
    return NextResponse.json({ translation }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate the document translation."
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
  }
}

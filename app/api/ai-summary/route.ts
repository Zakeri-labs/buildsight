import { NextRequest, NextResponse } from "next/server"
import { generateAiSummary, type GenerateAiSummaryInput } from "@/lib/ai-summary/generate"
import { AuthzError } from "@/lib/auth/guards"
import { getSelectedProjectId } from "@/lib/project-scope"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const input = await request.json() as GenerateAiSummaryInput
    const selectedProjectId = await getSelectedProjectId()
    if (!selectedProjectId || selectedProjectId !== input.projectId) {
      return NextResponse.json({ error: "The selected project is no longer active. Select the project again." }, { status: 400 })
    }

    const result = await generateAiSummary(input)
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate the AI summary."
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
  }
}

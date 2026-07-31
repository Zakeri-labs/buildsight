import { NextRequest, NextResponse } from "next/server"
import { assertProjectAdmin, assertProjectMember } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { STAGE_EVIDENCE_BUCKET } from "@/lib/stages/execution"
import { loadStageEvidenceAccess } from "@/lib/stages/evidence-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeFilename(value: string | null) {
  return (value || "source-document.pdf").replace(/[\r\n"\\/]+/g, "-")
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim()
  const path = request.nextUrl.searchParams.get("path")?.trim()
  if (!projectId || !path || path.includes("..") || path.split("/")[0] !== projectId) {
    return new NextResponse("Invalid source document path", { status: 400 })
  }

  try {
    await assertProjectMember(projectId)
    const access = await loadStageEvidenceAccess(projectId, path)
    if (!access) return new NextResponse("Source document not found", { status: 404 })
    if (!access.active) await assertProjectAdmin(projectId)
  } catch {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(STAGE_EVIDENCE_BUCKET).download(path)
  if (error || !data) return new NextResponse("Source document not found", { status: 404 })

  const bytes = await data.arrayBuffer()
  const filename = safeFilename(request.nextUrl.searchParams.get("filename"))
  const download = request.nextUrl.searchParams.get("download") === "1"
  const contentType = data.type || (filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream")

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

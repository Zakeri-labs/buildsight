import { NextRequest, NextResponse } from "next/server"
import { STAGE_EVIDENCE_BUCKET } from "@/lib/stages/execution"
import { assertProjectMember, assertProjectReviewer } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadStageEvidenceAccess } from "@/lib/stages/evidence-access"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path")?.trim()
  if (!path || path.includes("..")) return new NextResponse("Invalid evidence path", { status: 400 })
  const parts = path.split("/")
  const projectId = parts[0]
  if (!projectId || parts.length < 3) return new NextResponse("Invalid evidence path", { status: 400 })

  try {
    await assertProjectMember(projectId)
    const access = await loadStageEvidenceAccess(projectId, path)
    if (!access) return new NextResponse("Evidence not found", { status: 404 })
    if (!access.active) await assertProjectReviewer(projectId)
  } catch {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const admin = createAdminClient()
  const download = request.nextUrl.searchParams.get("download") === "1"
  const filename = request.nextUrl.searchParams.get("filename")?.replace(/[\r\n"\\/]+/g, "-") || "evidence"
  const { data, error } = await admin.storage
    .from(STAGE_EVIDENCE_BUCKET)
    .createSignedUrl(path, 60 * 10, download ? { download: filename } : undefined)
  if (error || !data?.signedUrl) return new NextResponse("Evidence not found", { status: 404 })
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const projectId = formData.get("projectId") as string
    const responseId = formData.get("responseId") as string
    const path = formData.get("path") as string
    const file = formData.get("file") as File | null

    if (!projectId || !responseId || !path || !file) {
      return NextResponse.json({ error: "Invalid upload parameters" }, { status: 400 })
    }
    if (path.includes("..") || !path.startsWith(`${projectId}/${responseId}/`)) {
      return NextResponse.json({ error: "Invalid upload storage path" }, { status: 400 })
    }

    await assertProjectMember(projectId)
    const admin = createAdminClient()
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadErr } = await admin.storage
      .from(STAGE_EVIDENCE_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      })

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, path })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload evidence file" },
      { status: 500 },
    )
  }
}

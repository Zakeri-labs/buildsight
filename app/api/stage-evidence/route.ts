import { NextRequest, NextResponse } from "next/server"
import { STAGE_EVIDENCE_BUCKET } from "@/lib/stages/execution"
import { assertProjectMember } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path")?.trim()
  if (!path || path.includes("..")) return new NextResponse("Invalid evidence path", { status: 400 })
  const parts = path.split("/")
  const projectId = parts[0]
  if (!projectId || parts.length < 3) return new NextResponse("Invalid evidence path", { status: 400 })

  try {
    await assertProjectMember(projectId)
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

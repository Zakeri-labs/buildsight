import { NextRequest, NextResponse } from "next/server"
import { DOCUMENT_ASSET_BUCKET } from "@/lib/documents/simple-upload"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

function safeDownloadName(value: string | null): string {
  const name = value?.trim().replace(/[\r\n"\\/]+/g, "-")
  return name || "document"
}

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path")?.trim()
  if (!path) return new NextResponse("Missing file path", { status: 400 })

  const parts = path.split("/")
  const projectId = parts[0]
  if (!projectId || parts.length < 4 || !path.includes("/files/") || path.includes("..")) {
    return new NextResponse("Invalid file path", { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (!project) return new NextResponse("Forbidden", { status: 403 })

  const admin = createAdminClient()
  const shouldDownload = request.nextUrl.searchParams.get("download") === "1"
  const filename = safeDownloadName(request.nextUrl.searchParams.get("filename"))
  const { data, error } = await admin.storage
    .from(DOCUMENT_ASSET_BUCKET)
    .createSignedUrl(path, 60 * 10, shouldDownload ? { download: filename } : undefined)

  if (error || !data?.signedUrl) return new NextResponse("File not found", { status: 404 })

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

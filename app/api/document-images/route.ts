import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function safeDownloadName(value: string | null): string {
  const name = value?.trim().replace(/[\r\n"\\/]+/g, "-")
  return name || "image"
}

function errorResponse(message: string, status: number, wantsSignedUrl: boolean) {
  return wantsSignedUrl
    ? NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
    : new NextResponse(message, { status })
}

export async function GET(request: NextRequest) {
  const wantsSignedUrl = request.nextUrl.searchParams.get("signed") === "1"
  const path = request.nextUrl.searchParams.get("path")?.trim()
  if (!path) return errorResponse("Missing image path", 400, wantsSignedUrl)

  const parts = path.split("/")
  const projectId = parts[0]
  if (!projectId || parts.length < 3 || path.includes("..")) {
    return errorResponse("Invalid image path", 400, wantsSignedUrl)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse("Unauthorized", 401, wantsSignedUrl)

  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (!project) return errorResponse("Forbidden", 403, wantsSignedUrl)

  const shouldDownload = request.nextUrl.searchParams.get("download") === "1"
  const filename = safeDownloadName(request.nextUrl.searchParams.get("filename"))
  const { data, error } = await supabase.storage
    .from("document-images")
    .createSignedUrl(path, 60 * 10, shouldDownload ? { download: filename } : undefined)
  if (error || !data?.signedUrl) return errorResponse("Image not found", 404, wantsSignedUrl)

  if (wantsSignedUrl) {
    return NextResponse.json(
      { signedUrl: data.signedUrl },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

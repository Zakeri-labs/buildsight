import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { PROJECT_IMAGE_BUCKET } from "@/lib/projects/project-image"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path")?.trim()
  if (!path) return new NextResponse("Missing image path", { status: 400 })

  const parts = path.split("/")
  const projectId = parts[0]
  if (!projectId || parts.length < 3 || path.includes("..")) {
    return new NextResponse("Invalid image path", { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (!project) return new NextResponse("Forbidden", { status: 403 })

  const { data, error } = await supabase.storage.from(PROJECT_IMAGE_BUCKET).createSignedUrl(path, 60 * 10)
  if (error || !data?.signedUrl) return new NextResponse("Image not found", { status: 404 })

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

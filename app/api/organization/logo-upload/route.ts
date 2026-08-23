import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const logoType = (formData.get("type") as string) || "logo"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const admin = createAdminClient()
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const ext = file.name.split(".").pop() || "png"
    const storagePath = `org-logos/${logoType}-${Date.now()}.${ext}`

    const { error: uploadError } = await admin.storage
      .from("project-stage-evidence")
      .upload(storagePath, buffer, {
        contentType: file.type || "image/png",
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: signed } = await admin.storage
      .from("project-stage-evidence")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

    const publicUrl = signed?.signedUrl || ""
    return NextResponse.json({ success: true, url: publicUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

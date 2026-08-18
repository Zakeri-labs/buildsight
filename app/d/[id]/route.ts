import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "project-stage-translations"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid report ID format." }, { status: 400 })
    }

    const admin = createAdminClient()

    // Query translation by response_id or id
    const { data: translation } = await admin
      .from("translation_documents")
      .select("id, project_id, response_id, bilingual_pdf_url, original_pdf_url")
      .or(`response_id.eq.${id},id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!translation) {
      return NextResponse.json({ error: "Report translation record not found." }, { status: 404 })
    }

    const storagePath = translation.bilingual_pdf_url || translation.original_pdf_url
    if (!storagePath) {
      return NextResponse.json({ error: "The requested PDF document has not been generated yet." }, { status: 404 })
    }

    const downloadName = storagePath.split("/").pop()?.replace(/^.*?-\d+-/, "") || "bilingual-report.pdf"
    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30, { download: downloadName })

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: "The stored PDF document is temporarily unavailable." }, { status: 404 })
    }

    return NextResponse.redirect(signed.signedUrl, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=300" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to redirect to PDF document."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "project-stage-translations"

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const rawCode = params.code?.trim() || ""
    if (!rawCode || rawCode.length < 6 || !/^[0-9a-f-]+$/i.test(rawCode)) {
      return NextResponse.json({ error: "Invalid report code." }, { status: 400 })
    }

    const admin = createAdminClient()
    const cleanCode = rawCode.toLowerCase().replace(/[^0-9a-f]/g, "")

    // 1. Search in translation_documents table using ilike prefix on response_id or id
    const { data: translation } = await admin
      .from("translation_documents")
      .select("id, project_id, response_id, bilingual_pdf_url, original_pdf_url")
      .or(`response_id.ilike.${cleanCode}%,id.ilike.${cleanCode}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    let storagePath = translation?.bilingual_pdf_url || translation?.original_pdf_url

    // 2. If translation record was not found or has no storagePath yet, search term_responses
    if (!storagePath) {
      const { data: responseRow } = await admin
        .from("term_responses")
        .select("id, project_id, project_stage_id")
        .ilike("id", `${cleanCode}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (responseRow) {
        const { data: fallbackTrans } = await admin
          .from("translation_documents")
          .select("bilingual_pdf_url, original_pdf_url")
          .eq("response_id", responseRow.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        storagePath = fallbackTrans?.bilingual_pdf_url || fallbackTrans?.original_pdf_url
      }
    }

    if (!storagePath) {
      return NextResponse.json({ error: "Report PDF has not been generated or is missing." }, { status: 404 })
    }

    const downloadName = storagePath.split("/").pop()?.replace(/^.*?-\d+-/, "") || "bilingual-report.pdf"
    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30, { download: downloadName })

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: "PDF document temporarily unavailable." }, { status: 404 })
    }

    return NextResponse.redirect(signed.signedUrl, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=300" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to redirect to report PDF."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

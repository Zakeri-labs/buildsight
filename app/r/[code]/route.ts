import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "project-stage-translations"

function getUuidRange(code: string) {
  const clean = code.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 32)
  const minHex = clean.padEnd(32, "0")
  const maxHex = clean.padEnd(32, "f")
  const format = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  return { minUuid: format(minHex), maxUuid: format(maxHex) }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } | Promise<{ code: string }> },
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const rawCode = resolvedParams?.code?.trim() || ""

    if (!rawCode || rawCode.length < 4) {
      return NextResponse.json({ error: "Invalid report code." }, { status: 400 })
    }

    const cleanCode = rawCode.toLowerCase().replace(/[^0-9a-f]/g, "")
    if (!cleanCode) {
      return NextResponse.json({ error: "Invalid report code format." }, { status: 400 })
    }

    const admin = createAdminClient()
    const { minUuid, maxUuid } = getUuidRange(cleanCode)

    // 1. Direct indexed database lookup for matching translation document
    const { data: translationRows } = await admin
      .from("translation_documents")
      .select("id, project_id, response_id, bilingual_pdf_url, original_pdf_url, created_at")
      .or(`and(response_id.gte.${minUuid},response_id.lte.${maxUuid}),and(id.gte.${minUuid},id.lte.${maxUuid})`)
      .order("created_at", { ascending: false })
      .limit(1)

    let matchedTranslation = translationRows?.[0] || null
    let storagePath = matchedTranslation?.bilingual_pdf_url || matchedTranslation?.original_pdf_url

    // 2. Direct fallback lookup via term_responses if not matched directly in translation_documents
    if (!storagePath) {
      const { data: responseRows } = await admin
        .from("term_responses")
        .select("id, project_id, project_stage_id, created_at")
        .gte("id", minUuid)
        .lte("id", maxUuid)
        .order("created_at", { ascending: false })
        .limit(1)

      const matchedResponse = responseRows?.[0] || null

      if (matchedResponse) {
        const { data: fallbackTrans } = await admin
          .from("translation_documents")
          .select("bilingual_pdf_url, original_pdf_url, created_at")
          .eq("response_id", matchedResponse.id)
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

    // Create 7-day signed download URL (permanent short link resolves to fresh signed URL every request)
    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7, { download: downloadName })

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

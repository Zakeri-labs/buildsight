import { NextRequest, NextResponse } from "next/server"
import { assertProjectMember, audit, AuthzError } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "project-stage-translations"
const MAX_PDF_BYTES = 40 * 1024 * 1024
const PDF_COLUMNS = {
  original: "original_pdf_url",
  arabic: "arabic_pdf_url",
  bilingual: "bilingual_pdf_url",
} as const

type PdfKind = keyof typeof PDF_COLUMNS

function validUuid(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeFileName(value: string) {
  const safe = value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
  return safe || "translated-report.pdf"
}


export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")
    const translationId = request.nextUrl.searchParams.get("translationId")
    const kind = request.nextUrl.searchParams.get("kind")
    if (!projectId || !translationId || !kind || !(kind in PDF_COLUMNS) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(translationId)) {
      return NextResponse.json({ error: "Invalid PDF download request." }, { status: 400 })
    }

    await assertProjectMember(projectId)
    const admin = createAdminClient()
    const column = PDF_COLUMNS[kind as PdfKind]
    const { data: translation, error } = await admin
      .from("translation_documents")
      .select(`id, ${column}`)
      .eq("id", translationId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (error) throw error
    const storagePath = translation?.[column] as string | null | undefined
    if (!storagePath) return NextResponse.json({ error: "The requested PDF has not been generated." }, { status: 404 })

    const downloadName = storagePath.split("/").pop()?.replace(/^.*?-\d+-/, "") || `${kind}-translation.pdf`
    const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10, { download: downloadName })
    if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "The stored PDF is unavailable." }, { status: 404 })
    return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "private, max-age=300" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to download the stored PDF."
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const projectId = form.get("projectId")
    const translationId = form.get("translationId")
    const kind = form.get("kind")
    const file = form.get("file")

    if (!validUuid(projectId) || !validUuid(translationId) || typeof kind !== "string" || !(kind in PDF_COLUMNS)) {
      return NextResponse.json({ error: "Invalid PDF upload request." }, { status: 400 })
    }
    if (!(file instanceof File) || file.type !== "application/pdf" || file.size <= 0 || file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "The generated PDF is invalid or exceeds the 40 MB limit." }, { status: 400 })
    }

    const userId = await assertProjectMember(projectId)
    const admin = createAdminClient()
    const { data: translation, error: lookupError } = await admin
      .from("translation_documents")
      .select("id, project_id, project_stage_id, project_stage_term_id, original_pdf_url, arabic_pdf_url, bilingual_pdf_url")
      .eq("id", translationId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!translation) return NextResponse.json({ error: "Translation record not found." }, { status: 404 })

    const pdfKind = kind as PdfKind
    const column = PDF_COLUMNS[pdfKind]
    const oldPath = translation[column] as string | null
    const filename = safeFileName(file.name.endsWith(".pdf") ? file.name : `${file.name}.pdf`)
    const storagePath = `${projectId}/${translation.project_stage_id}/${translation.project_stage_term_id}/${translationId}/${pdfKind}-${Date.now()}-${filename}`
    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "The uploaded file is not a valid PDF." }, { status: 400 })
    }
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    })
    if (uploadError) throw uploadError

    const { error: updateError } = await admin
      .from("translation_documents")
      .update({ [column]: storagePath, updated_at: new Date().toISOString() })
      .eq("id", translationId)
    if (updateError) {
      await admin.storage.from(BUCKET).remove([storagePath])
      throw updateError
    }
    if (oldPath && oldPath !== storagePath) await admin.storage.from(BUCKET).remove([oldPath]).catch(() => undefined)

    await audit({
      actorId: userId,
      action: "stage_translation.pdf_export",
      entityType: "translation_document",
      entityId: translationId,
      projectId,
      metadata: { kind: pdfKind, storagePath },
    })

    return NextResponse.json({ storagePath }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to store the generated PDF."
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
  }
}

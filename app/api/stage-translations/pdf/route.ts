import { NextRequest, NextResponse } from "next/server"
import { assertProjectMember, assertProjectReviewer, audit, AuthzError } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "project-stage-translations"
const MAX_PDF_BYTES = 60 * 1024 * 1024
const PDF_COLUMNS = {
  original: "original_pdf_url",
  arabic: "arabic_pdf_url",
  bilingual: "bilingual_pdf_url",
} as const

type PdfKind = keyof typeof PDF_COLUMNS
type TranslationRow = {
  id: string
  project_id: string
  project_stage_id: string
  response_id: string
  translation_status: string
  translated_content: unknown
  original_pdf_url: string | null
  arabic_pdf_url: string | null
  bilingual_pdf_url: string | null
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function validKind(value: unknown): value is PdfKind {
  return typeof value === "string" && value in PDF_COLUMNS
}

function safeFileName(value: string) {
  const safe = value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
  return safe || "translated-report.pdf"
}

async function loadTranslation(admin: ReturnType<typeof createAdminClient>, projectId: string, translationId: string) {
  const { data, error } = await admin
    .from("translation_documents")
    .select("id, project_id, project_stage_id, response_id, translation_status, translated_content, original_pdf_url, arabic_pdf_url, bilingual_pdf_url")
    .eq("id", translationId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) throw error
  return data as TranslationRow | null
}

async function translationScopeIsActive(admin: ReturnType<typeof createAdminClient>, translation: TranslationRow) {
  const { data: response, error: responseError } = await admin
    .from("term_responses")
    .select("project_stage_id")
    .eq("id", translation.response_id)
    .eq("project_id", translation.project_id)
    .maybeSingle()
  if (responseError) throw responseError
  if (!response || response.project_stage_id !== translation.project_stage_id) return false

  const { data: stage, error: stageError } = await admin
    .from("project_stages")
    .select("status")
    .eq("id", translation.project_stage_id)
    .eq("project_id", translation.project_id)
    .maybeSingle()
  if (stageError) throw stageError
  return Boolean(stage && stage.status !== "disabled")
}

function ensureTranslationReady(translation: TranslationRow, kind: PdfKind) {
  if (kind !== "original" && (translation.translation_status !== "completed" || !translation.translated_content)) {
    throw new Error("Generate the Arabic translation before storing this PDF.")
  }
}

function expectedStoragePrefix(translation: TranslationRow, projectId: string, kind: PdfKind) {
  return `${projectId}/${translation.project_stage_id}/${translation.response_id}/${translation.id}/${kind}-`
}

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId")
    const translationId = request.nextUrl.searchParams.get("translationId")
    const kind = request.nextUrl.searchParams.get("kind")
    if (!validUuid(projectId) || !validUuid(translationId) || !validKind(kind)) {
      return NextResponse.json({ error: "Invalid PDF download request." }, { status: 400 })
    }

    await assertProjectMember(projectId)
    const admin = createAdminClient()
    const translation = await loadTranslation(admin, projectId, translationId)
    if (!translation) return NextResponse.json({ error: "Translation record not found." }, { status: 404 })
    if (!(await translationScopeIsActive(admin, translation))) await assertProjectReviewer(projectId)
    const storagePath = translation[PDF_COLUMNS[kind]]
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
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: "Invalid PDF storage request." }, { status: 400 })
    const action = body.action
    const projectId = body.projectId
    const translationId = body.translationId
    const kind = body.kind
    if ((action !== "prepare" && action !== "finalize") || !validUuid(projectId) || !validUuid(translationId) || !validKind(kind)) {
      return NextResponse.json({ error: "Invalid PDF storage request." }, { status: 400 })
    }

    const userId = await assertProjectMember(projectId)
    const admin = createAdminClient()
    const translation = await loadTranslation(admin, projectId, translationId)
    if (!translation) return NextResponse.json({ error: "Translation record not found." }, { status: 404 })
    if (!(await translationScopeIsActive(admin, translation))) {
      return NextResponse.json({ error: "This stage is inactive and cannot accept new documents." }, { status: 409 })
    }
    ensureTranslationReady(translation, kind)

    if (action === "prepare") {
      const requestedFilename = typeof body.filename === "string" ? body.filename : `${kind}-translation.pdf`
      const filename = safeFileName(requestedFilename.toLowerCase().endsWith(".pdf") ? requestedFilename : `${requestedFilename}.pdf`)
      const storagePath = `${expectedStoragePrefix(translation, projectId, kind)}${Date.now()}-${filename}`
      const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath)
      if (signedError || !signed?.token) {
        throw new Error(`Unable to prepare Supabase Storage upload: ${signedError?.message || "missing signed upload token"}`)
      }
      return NextResponse.json({ storagePath, token: signed.token }, { headers: { "Cache-Control": "no-store" } })
    }

    const storagePath = typeof body.storagePath === "string" ? body.storagePath : ""
    if (!storagePath.startsWith(expectedStoragePrefix(translation, projectId, kind)) || storagePath.includes("..")) {
      return NextResponse.json({ error: "Invalid generated PDF path." }, { status: 400 })
    }

    const bucket = admin.storage.from(BUCKET) as any
    const { data: fileInfo, error: infoError } = await bucket.info(storagePath)
    const size = Number(fileInfo?.size ?? fileInfo?.metadata?.size ?? 0)
    const contentType = String(
      fileInfo?.contentType ??
      fileInfo?.metadata?.mimetype ??
      fileInfo?.metadata?.contentType ??
      "",
    ).toLowerCase()
    const invalidContentType = Boolean(contentType) && contentType !== "application/pdf"
    if (infoError || !fileInfo || size <= 0 || size > MAX_PDF_BYTES || invalidContentType) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
      const reason = infoError?.message || (invalidContentType ? `unexpected content type ${contentType}` : "invalid file size")
      throw new Error(`Supabase Storage did not confirm a valid PDF upload: ${reason}`)
    }

    const column = PDF_COLUMNS[kind]
    const oldPath = translation[column]
    const { error: updateError } = await admin
      .from("translation_documents")
      .update({ [column]: storagePath, updated_at: new Date().toISOString() })
      .eq("id", translationId)
      .eq("project_id", projectId)
    if (updateError) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
      throw new Error(`The PDF was uploaded, but saving its Storage path failed: ${updateError.message}`)
    }
    if (oldPath && oldPath !== storagePath) await admin.storage.from(BUCKET).remove([oldPath]).catch(() => undefined)

    await audit({
      actorId: userId,
      action: "stage_translation.pdf_export",
      entityType: "translation_document",
      entityId: translationId,
      projectId,
      metadata: { kind, storagePath, size },
    })

    return NextResponse.json({ storagePath }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to store the generated PDF."
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })
  }
}

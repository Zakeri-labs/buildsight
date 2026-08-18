import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BUCKET = "project-stage-translations"
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

function renderExpiredHtml() {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <title>Link Expired | BuildSight</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; color: #0f172a; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 1.25rem; padding: 2.5rem 2rem; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
    .icon-box { width: 64px; height: 64px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem; font-size: 1.75rem; color: #ef4444; }
    h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.75rem; color: #0f172a; }
    p { font-size: 0.875rem; color: #64748b; line-height: 1.6; margin: 0 0 0.75rem; }
    .ar-text { font-size: 0.85rem; color: #94a3b8; line-height: 1.6; margin: 0; direction: rtl; }
    .badge { display: inline-block; background: #f1f5f9; color: #475569; font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.75rem; border-radius: 9999px; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-box">⏳</div>
    <h1>Share Link Expired</h1>
    <p>This shared report download link has expired after the 5-day security limit. Please ask the sender to generate a new share link.</p>
    <p class="ar-text">انتهت صلاحية رابط هذا التقرير بعد مرور 5 أيام. يرجى التواصل مع المرسل للحصول على رابط جديد.</p>
    <div class="badge">BuildSight Document System</div>
  </div>
</body>
</html>`
}

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
      .select("id, project_id, response_id, bilingual_pdf_url, original_pdf_url, created_at")
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

    // Enforce 5-day expiration window from creation
    if (translation.created_at) {
      const createdAtTime = new Date(translation.created_at).getTime()
      if (!Number.isNaN(createdAtTime) && Date.now() - createdAtTime > FIVE_DAYS_MS) {
        return new NextResponse(renderExpiredHtml(), {
          status: 410,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      }
    }

    const downloadName = storagePath.split("/").pop()?.replace(/^.*?-\d+-/, "") || "bilingual-report.pdf"
    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 5, { download: downloadName })

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

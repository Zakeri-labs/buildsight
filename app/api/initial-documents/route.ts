import { NextRequest, NextResponse } from "next/server"
import { INITIAL_DOCUMENTS_BUCKET } from "@/lib/initial-documents/config"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function safeDownloadName(value: string) {
  return value.trim().replace(/[\r\n"\\/]+/g, "-") || "document"
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim()
  if (!id) return new NextResponse("Missing document id", { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: document, error: documentError } = await supabase
    .from("initial_docs")
    .select("file_path, storage_bucket, original_file_name, file_name")
    .eq("id", id)
    .maybeSingle()
  if (documentError || !document) return new NextResponse("Not found", { status: 404 })

  const download = request.nextUrl.searchParams.get("download") === "1"
  const fileName = safeDownloadName(document.original_file_name || document.file_name)
  const { data, error } = await supabase.storage
    .from(document.storage_bucket || INITIAL_DOCUMENTS_BUCKET)
    .createSignedUrl(document.file_path, 60 * 10, download ? { download: fileName } : undefined)
  if (error || !data?.signedUrl) return new NextResponse("File not found", { status: 404 })

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

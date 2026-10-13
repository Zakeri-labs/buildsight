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
    .select("file_path, storage_bucket, original_file_name, file_name, mime_type")
    .eq("id", id)
    .maybeSingle()
  if (documentError || !document) return new NextResponse("Not found", { status: 404 })

  const download = request.nextUrl.searchParams.get("download") === "1"
  const fileName = safeDownloadName(document.original_file_name || document.file_name)
  const { data, error } = await supabase.storage
    .from(document.storage_bucket || INITIAL_DOCUMENTS_BUCKET)
    .createSignedUrl(document.file_path, 60 * 10)
  if (error || !data?.signedUrl) return new NextResponse("File not found", { status: 404 })

  // Forward Range request to storage for efficient chunked/large file loading
  const upstreamHeaders: HeadersInit = {}
  const clientRange = request.headers.get("range")
  if (clientRange) {
    upstreamHeaders["range"] = clientRange
  }

  const upstreamResponse = await fetch(data.signedUrl, {
    headers: upstreamHeaders,
  })

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    return new NextResponse("Failed to retrieve document", { status: upstreamResponse.status })
  }

  const responseHeaders = new Headers()
  const contentType = document.mime_type || upstreamResponse.headers.get("content-type") || "application/octet-stream"
  responseHeaders.set("Content-Type", contentType)

  const dispositionType = download ? "attachment" : "inline"
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "")
  responseHeaders.set(
    "Content-Disposition",
    `${dispositionType}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
  )

  const contentLength = upstreamResponse.headers.get("content-length")
  if (contentLength) {
    responseHeaders.set("Content-Length", contentLength)
  }

  const contentRange = upstreamResponse.headers.get("content-range")
  if (contentRange) {
    responseHeaders.set("Content-Range", contentRange)
  }

  const acceptRanges = upstreamResponse.headers.get("accept-ranges")
  if (acceptRanges) {
    responseHeaders.set("Accept-Ranges", acceptRanges)
  }

  const etag = upstreamResponse.headers.get("etag")
  if (etag) {
    responseHeaders.set("ETag", etag)
  }

  const lastModified = upstreamResponse.headers.get("last-modified")
  if (lastModified) {
    responseHeaders.set("Last-Modified", lastModified)
  }

  responseHeaders.set("Cache-Control", "private, max-age=300")

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  })
}

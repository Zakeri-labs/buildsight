import { DOCUMENT_ASSET_BUCKET } from "@/lib/documents/simple-upload"

const DEFAULT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000

function storageErrorMessage(request: XMLHttpRequest): string {
  let message = "Unable to upload the file."
  try {
    const response = JSON.parse(request.responseText) as {
      message?: string
      error?: string
      statusCode?: string | number
    }
    message = response.message || response.error || message
  } catch {
    const responseText = request.responseText?.trim()
    if (responseText) message = responseText
  }
  return message
}

export async function uploadStorageAsset(
  file: File,
  path: string,
  accessToken: string,
  onProgress?: (progress: number) => void,
  bucket = DOCUMENT_ASSET_BUCKET,
  upsert = false,
  timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) throw new Error("Supabase storage is not configured.")
  if (!accessToken.trim()) throw new Error("Your session has expired. Sign in again.")
  if (!file || file.size <= 0) throw new Error("The selected file is empty.")

  const encodedPath = path.split("/").map(encodeURIComponent).join("/")
  const uploadUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encodedPath}`

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    request.open("POST", uploadUrl, true)
    request.timeout = Math.max(30_000, timeoutMs)
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`)
    request.setRequestHeader("apikey", anonKey)
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    request.setRequestHeader("x-upsert", upsert ? "true" : "false")

    request.upload.onloadstart = () => onProgress?.(1)
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      onProgress?.(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))))
    }

    request.onerror = () => finish(() => reject(new Error("The upload failed. Check your connection and try again.")))
    request.onabort = () => finish(() => reject(new Error("The upload was cancelled before it completed.")))
    request.ontimeout = () => finish(() => reject(new Error(`Uploading ${file.name} timed out. Check your connection and try again.`)))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        finish(() => {
          onProgress?.(100)
          resolve()
        })
        return
      }
      finish(() => reject(new Error(storageErrorMessage(request))))
    }

    try {
      request.send(file)
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error("Unable to start the file upload.")))
    }
  })
}


export async function uploadDocumentAsset(
  file: File,
  path: string,
  accessToken: string,
  onProgress?: (progress: number) => void,
  timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
): Promise<void> {
  return uploadStorageAsset(file, path, accessToken, onProgress, DOCUMENT_ASSET_BUCKET, false, timeoutMs)
}

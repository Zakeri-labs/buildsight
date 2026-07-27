import { DOCUMENT_ASSET_BUCKET } from "@/lib/documents/simple-upload"

export async function uploadDocumentAsset(
  file: File,
  path: string,
  accessToken: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) throw new Error("Supabase storage is not configured.")

  const encodedPath = path.split("/").map(encodeURIComponent).join("/")
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("POST", `${supabaseUrl}/storage/v1/object/${DOCUMENT_ASSET_BUCKET}/${encodedPath}`)
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`)
    request.setRequestHeader("apikey", anonKey)
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    request.setRequestHeader("x-upsert", "false")
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))))
    }
    request.onerror = () => reject(new Error("The upload failed. Check your connection and try again."))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100)
        resolve()
        return
      }
      let message = "Unable to upload the file."
      try {
        const response = JSON.parse(request.responseText) as { message?: string; error?: string }
        message = response.message || response.error || message
      } catch {
        // Keep the generic message when the storage response is not JSON.
      }
      reject(new Error(message))
    }
    request.send(file)
  })
}

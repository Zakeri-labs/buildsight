import { STAGE_EVIDENCE_BUCKET } from "@/lib/stages/execution"

export async function uploadStageEvidence(
  file: File,
  path: string,
  accessToken: string,
  onProgress: (progress: number) => void,
  contentType = file.type || "application/octet-stream",
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) throw new Error("Supabase storage is not configured.")

  const encodedPath = path.split("/").map(encodeURIComponent).join("/")
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open("POST", `${supabaseUrl}/storage/v1/object/${STAGE_EVIDENCE_BUCKET}/${encodedPath}`)
    request.setRequestHeader("Authorization", `Bearer ${accessToken}`)
    request.setRequestHeader("apikey", anonKey)
    request.setRequestHeader("Content-Type", contentType)
    request.setRequestHeader("x-upsert", "false")
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))))
    }
    request.onerror = () => reject(new Error("The evidence upload failed. Check your connection and try again."))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100)
        resolve()
        return
      }
      let message = "Unable to upload the evidence file."
      try {
        const response = JSON.parse(request.responseText) as { message?: string; error?: string }
        message = response.message || response.error || message
      } catch {
        // Keep the generic message.
      }
      reject(new Error(message))
    }
    request.send(file)
  })
}

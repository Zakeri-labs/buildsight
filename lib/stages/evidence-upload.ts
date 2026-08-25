import { STAGE_EVIDENCE_BUCKET } from "@/lib/stages/execution"
import { uploadStorageAsset } from "@/lib/documents/storage-upload"

export async function uploadStageEvidence(
  file: File,
  path: string,
  accessToken: string,
  onProgress: (progress: number) => void,
  contentType = file.type || "application/octet-stream",
): Promise<void> {
  try {
    await uploadStorageAsset(file, path, accessToken, onProgress, STAGE_EVIDENCE_BUCKET)
  } catch (err) {
    const parts = path.split("/")
    if (parts.length >= 2) {
      const formData = new FormData()
      formData.append("projectId", parts[0])
      formData.append("responseId", parts[1])
      formData.append("path", path)
      formData.append("file", file)
      const res = await fetch("/api/stage-evidence", {
        method: "POST",
        body: formData,
      })
      if (res.ok) {
        onProgress(100)
        return
      }
      const data = await res.json().catch(() => null)
      if (data?.error) throw new Error(data.error)
    }
    throw err
  }
}


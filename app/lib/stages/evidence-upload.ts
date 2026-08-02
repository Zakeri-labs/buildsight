import { STAGE_EVIDENCE_BUCKET } from "@/lib/stages/execution"
import { uploadStorageAsset } from "@/lib/documents/storage-upload"

export async function uploadStageEvidence(
  file: File,
  path: string,
  accessToken: string,
  onProgress: (progress: number) => void,
  contentType = file.type || "application/octet-stream",
): Promise<void> {
  return uploadStorageAsset(file, path, accessToken, onProgress, STAGE_EVIDENCE_BUCKET)
}


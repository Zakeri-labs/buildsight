import { logDiagnosticEvent } from "@/lib/stage-translations/debug-timeline"

export interface OptimizeEvidenceOptions {
  maxDimension?: number
  quality?: number
  responseId?: string
}

/**
 * Optimizes a report evidence image file before uploading to Supabase Storage.
 *
 * Requirements:
 * - Max long edge: 1280px
 * - Aspect ratio: preserved exactly (no crop, no stretch)
 * - Upscaling: disabled (smaller images keep their original pixel dimensions)
 * - Output format: image/jpeg
 * - Quality: 0.80
 * - Background: Solid white (#FFFFFF) for transparent PNGs/WebPs
 * - Orientation: EXIF rotation preserved via createImageBitmap / browser decoding
 * - Output filename: replaces extension with .jpg (e.g. photo.png -> photo.jpg)
 */
export async function optimizeEvidenceImageFile(
  file: File,
  options: OptimizeEvidenceOptions = {},
): Promise<File> {
  const maxDimension = options.maxDimension ?? 1280
  const quality = options.quality ?? 0.80
  const responseId = options.responseId ?? "unknown"
  const originalFilename = file.name || "evidence-image.jpg"
  const originalSize = file.size
  const originalMime = file.type || "unknown"

  logDiagnosticEvent(responseId, "IMAGE_OPTIMIZATION_STARTED", {
    filename: originalFilename,
    originalSize,
    originalMime,
    maxDimension,
    quality,
  })

  let bitmap: ImageBitmap | null = null
  let imgElement: HTMLImageElement | null = null
  let sourceWidth = 0
  let sourceHeight = 0
  let cleanupObjectUrl: string | null = null

  try {
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
        sourceWidth = bitmap.width
        sourceHeight = bitmap.height
      } catch {
        bitmap = null
      }
    }

    if (!bitmap) {
      cleanupObjectUrl = URL.createObjectURL(file)
      imgElement = new Image()
      imgElement.decoding = "async"
      const loadPromise = new Promise<void>((resolve, reject) => {
        imgElement!.onload = () => resolve()
        imgElement!.onerror = () => reject(new Error(`Browser unable to decode image file: ${originalFilename}`))
      })
      imgElement.src = cleanupObjectUrl
      await loadPromise
      sourceWidth = imgElement.naturalWidth || imgElement.width
      sourceHeight = imgElement.naturalHeight || imgElement.height
    }

    if (!sourceWidth || !sourceHeight) {
      throw new Error(`Invalid image dimensions (${sourceWidth}x${sourceHeight})`)
    }

    const maxEdge = Math.max(sourceWidth, sourceHeight)
    const scale = Math.min(1, maxDimension / maxEdge)
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale))
    const resized = scale < 1

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) {
      throw new Error("Unable to create 2D canvas context for image optimization.")
    }

    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, targetWidth, targetHeight)

    if (bitmap) {
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    } else if (imgElement) {
      ctx.drawImage(imgElement, 0, 0, targetWidth, targetHeight)
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b)
          else reject(new Error("Canvas toBlob failed to produce JPEG data."))
        },
        "image/jpeg",
        quality,
      )
    })

    const baseName = originalFilename.replace(/\.[^.]+$/, "")
    const optimizedFilename = `${baseName}.jpg`

    const optimizedFile = new File([blob], optimizedFilename, {
      type: "image/jpeg",
      lastModified: Date.now(),
    })

    logDiagnosticEvent(responseId, "IMAGE_OPTIMIZATION_SUCCESS", {
      originalFilename,
      optimizedFilename,
      originalSize,
      optimizedSize: optimizedFile.size,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      optimizedWidth: targetWidth,
      optimizedHeight: targetHeight,
      originalMime,
      optimizedMime: "image/jpeg",
      quality,
      resized,
    })

    return optimizedFile
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    logDiagnosticEvent(responseId, "IMAGE_OPTIMIZATION_FAILED", {
      filename: originalFilename,
      mimeType: originalMime,
      error: errMessage,
    })
    throw new Error(`IMAGE_OPTIMIZATION_FAILED for ${originalFilename}: ${errMessage}`)
  } finally {
    if (bitmap) {
      try {
        bitmap.close()
      } catch {}
    }
    if (cleanupObjectUrl) {
      try {
        URL.revokeObjectURL(cleanupObjectUrl)
      } catch {}
    }
  }
}

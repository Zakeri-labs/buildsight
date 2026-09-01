import { logDiagnosticEvent } from "@/lib/stage-translations/debug-timeline"

export interface OptimizeEvidenceOptions {
  maxDimension?: number
  quality?: number
  responseId?: string
  imageKey?: string
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
  const startTime = Date.now()
  const maxDimension = options.maxDimension ?? 1280
  const quality = options.quality ?? 0.80
  const responseId = options.responseId ?? "unknown"
  const imageKey = options.imageKey ?? `img_${Math.random().toString(36).slice(2, 8)}`
  const originalFilename = file.name || "evidence-image.jpg"
  const originalBytes = file.size
  const originalMime = file.type || "unknown"

  logDiagnosticEvent(responseId, "IMAGE_OPTIMIZATION_STARTED", {
    imageKey,
    originalFilename,
    originalMime,
    originalBytes,
    maxDimension,
    quality,
  })

  let bitmap: ImageBitmap | null = null
  let imgElement: HTMLImageElement | null = null
  let sourceWidth = 0
  let sourceHeight = 0
  let cleanupObjectUrl: string | null = null
  let decodeStrategy = "unknown"

  try {
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
        sourceWidth = bitmap.width
        sourceHeight = bitmap.height
        decodeStrategy = "createImageBitmap"
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
      decodeStrategy = "HTMLImageElement"
    }

    if (!sourceWidth || !sourceHeight) {
      throw new Error(`Invalid image dimensions (${sourceWidth}x${sourceHeight})`)
    }

    logDiagnosticEvent(responseId, "IMAGE_OPTIMIZATION_DECODED", {
      imageKey,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      decodeStrategy,
    })

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
      imageKey,
      originalFilename,
      optimizedFilename,
      originalMime,
      optimizedMime: "image/jpeg",
      originalBytes,
      optimizedBytes: optimizedFile.size,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      optimizedWidth: targetWidth,
      optimizedHeight: targetHeight,
      resized,
      quality,
      durationMs: Date.now() - startTime,
    })

    return optimizedFile
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    logDiagnosticEvent(responseId, "IMAGE_OPTIMIZATION_FAILED", {
      imageKey,
      filename: originalFilename,
      mimeType: originalMime,
      error: errMessage,
      durationMs: Date.now() - startTime,
    })

    // Lightweight validation of original file before fallback
    if (!file || !(file instanceof File) || file.size <= 0) {
      const reason = !file || !(file instanceof File) ? "Invalid file instance" : "File size is 0 bytes"
      logDiagnosticEvent(responseId, "IMAGE_FILE_VALIDATION_FAILED", {
        imageKey,
        filename: originalFilename,
        reason,
      })
      throw new Error(`IMAGE_OPTIMIZATION_FAILED and original file validation failed (${reason}) for ${originalFilename}`)
    }

    logDiagnosticEvent(responseId, "IMAGE_OPTIMIZATION_FALLBACK_USED", {
      imageKey,
      filename: originalFilename,
      originalSize: originalBytes,
      mimeType: originalMime,
      optimizationError: errMessage,
    })

    return file
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

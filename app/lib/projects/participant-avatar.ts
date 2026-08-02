export const PARTICIPANT_AVATAR_BUCKET = "participant-avatars"
export const PARTICIPANT_AVATAR_ACCEPT = "image/jpeg,image/png,image/webp"
export const PARTICIPANT_AVATAR_MAX_BYTES = 5 * 1024 * 1024

const ALLOWED_PARTICIPANT_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ParticipantAvatarLike = {
  name: string
  size: number
  type: string
}

export function validateParticipantAvatarFile(file: ParticipantAvatarLike): string | null {
  if (!file.name.trim()) return "The participant image must have a valid filename."
  if (!Number.isFinite(file.size) || file.size <= 0) return "The selected participant image is empty."
  if (file.size > PARTICIPANT_AVATAR_MAX_BYTES) return "Participant images must be 5 MB or smaller."
  if (!ALLOWED_PARTICIPANT_AVATAR_TYPES.has(file.type.toLowerCase())) {
    return "Participant images must be JPG, PNG, or WEBP files."
  }
  return null
}

export function isAllowedParticipantAvatarType(value: string): boolean {
  return ALLOWED_PARTICIPANT_AVATAR_TYPES.has(value.toLowerCase())
}

export function detectParticipantAvatarMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

export function participantAvatarStoragePath(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("/api/participant-avatars?")) {
    try {
      return new URL(trimmed, "https://buildsight.local").searchParams.get("path")
    } catch {
      return null
    }
  }

  const parts = trimmed.split("/")
  if (
    parts.length >= 3 &&
    UUID_PATTERN.test(parts[0] ?? "") &&
    UUID_PATTERN.test(parts[1] ?? "") &&
    !trimmed.includes("..") &&
    !trimmed.startsWith("/")
  ) {
    return trimmed
  }
  return null
}

export function participantAvatarDisplayUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith("/api/participant-avatars?")) return trimmed

  const storagePath = participantAvatarStoragePath(trimmed)
  if (storagePath) return `/api/participant-avatars?path=${encodeURIComponent(storagePath)}`
  return trimmed
}

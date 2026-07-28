export const PROFILE_AVATAR_BUCKET = "user-avatars"
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const PROFILE_AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

export type ProfileAvatarMimeType = (typeof PROFILE_AVATAR_ALLOWED_TYPES)[number]

export function isAllowedProfileAvatarType(value: string): value is ProfileAvatarMimeType {
  return PROFILE_AVATAR_ALLOWED_TYPES.includes(value as ProfileAvatarMimeType)
}

export function isStoredProfileAvatar(value: string | null | undefined): value is string {
  if (!value) return false
  return !/^(?:https?:|data:|blob:|\/)/i.test(value)
}

export function profileAvatarDisplayUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  if (!isStoredProfileAvatar(value)) return value
  return `/api/profile-avatar?path=${encodeURIComponent(value)}`
}

export function profileInitials(name: string, email = "") {
  const source = name.trim() || email.trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?"
}

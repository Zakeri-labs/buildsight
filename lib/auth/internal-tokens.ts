import { ALL_PROJECTS_SCOPE_VALUE } from "@/lib/project-scope-constants"

export const INTERNAL_AUTH_HEADERS = {
  USER_ID: "x-buildsight-user-id",
  USER_EMAIL: "x-buildsight-user-email",
  TS: "x-buildsight-auth-ts",
  SIG: "x-buildsight-auth-sig",
} as const

// Maximum age of a signed internal auth header forwarding (60 seconds)
const MAX_SIGNATURE_AGE_MS = 60_000

function getAuthSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!secret) {
    throw new Error("Missing Supabase key for internal auth signing")
  }
  return secret
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ""
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0")
  }
  return hex
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    const val = parseInt(hex.substring(i, i + 2), 16)
    if (Number.isNaN(val)) return null
    bytes[i / 2] = val
  }
  return bytes
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

/**
 * Creates an HMAC-SHA256 signature for internal request-identity forwarding.
 * Can be safely called in Edge Middleware or Node.js runtime without external dependencies.
 */
export async function signAuthPayload(userId: string, email: string, timestamp: string): Promise<string> {
  const secret = getAuthSecret()
  const key = await getHmacKey(secret)
  const encoder = new TextEncoder()
  const data = `${userId}:${email}:${timestamp}`
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data))
  return bytesToHex(new Uint8Array(signature))
}

/**
 * Cryptographically verifies that the forwarded internal auth payload was produced
 * by our own Middleware using the private server secret and is within the 60-second validity window.
 */
export async function verifyAuthPayload(
  userId: string,
  email: string,
  timestamp: string,
  signatureHex: string,
): Promise<boolean> {
  try {
    const tsNum = Number(timestamp)
    if (!Number.isFinite(tsNum)) return false

    // Signature freshness check to prevent replay attacks
    const age = Math.abs(Date.now() - tsNum)
    if (age > MAX_SIGNATURE_AGE_MS) return false

    const signatureBytes = hexToBytes(signatureHex)
    if (!signatureBytes) return false

    const secret = getAuthSecret()
    const key = await getHmacKey(secret)
    const encoder = new TextEncoder()
    const data = `${userId}:${email}:${timestamp}`

    return await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(data))
  } catch {
    return false
  }
}

export type OrganizationProfile = {
  nameEn: string
  nameAr: string
  crNumber: string
  poBox: string
  postalCode: string
  phones: string
  email: string
  website: string
  addressEn: string
  addressAr: string
  logoUrl?: string
  pdfLogoUrl?: string
  pdfHeaderLogoUrl?: string
  pdfHeaderCompanyNameEnFontSize?: number
  pdfHeaderCompanyNameArFontSize?: number
}

export const DEFAULT_ORG_PROFILE: OrganizationProfile = {
  nameEn: "BONYAN CONSTRUCTION FOR ENGINEERING CONSULTANCY",
  nameAr: "بنيان الإنشائية للاستشارات الهندسية",
  crNumber: "1241340",
  poBox: "1015",
  postalCode: "132",
  phones: "+968 9411 4511, 9546 2124",
  email: "info@Bonyanec.com",
  website: "",
  addressEn: "Al Seeb, Al Mabela, Sultanate of Oman",
  addressAr: "السيب، المعبيلة، سلطنة عمان",
  logoUrl: "",
  pdfLogoUrl: "",
  pdfHeaderLogoUrl: "",
  pdfHeaderCompanyNameEnFontSize: 10.5,
  pdfHeaderCompanyNameArFontSize: 8.5,
}

const STORAGE_KEY = "buildsight_organization_profile"
let inMemoryProfile: OrganizationProfile | null = null

export function getOrganizationProfile(): OrganizationProfile {
  if (inMemoryProfile) return inMemoryProfile
  if (typeof window === "undefined") return DEFAULT_ORG_PROFILE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_ORG_PROFILE
    const parsed = JSON.parse(raw) as Partial<OrganizationProfile>
    inMemoryProfile = { ...DEFAULT_ORG_PROFILE, ...parsed }
    return inMemoryProfile
  } catch {
    return DEFAULT_ORG_PROFILE
  }
}

export async function fetchOrganizationProfileFromDb(): Promise<OrganizationProfile> {
  if (typeof window === "undefined") return getOrganizationProfile()
  try {
    const res = await fetch("/api/organization/profile", { cache: "no-store" })
    if (!res.ok) return getOrganizationProfile()
    const json = await res.json()
    if (json?.data) {
      const dbProfile: OrganizationProfile = { ...DEFAULT_ORG_PROFILE, ...json.data }
      inMemoryProfile = dbProfile
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dbProfile))
      } catch {}
      window.dispatchEvent(new Event("organization_profile_updated"))
      return dbProfile
    }
  } catch {}
  return getOrganizationProfile()
}

export async function saveOrganizationProfile(profile: OrganizationProfile): Promise<OrganizationProfile> {
  if (typeof window === "undefined") return profile

  const res = await fetch("/api/organization/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  })

  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error || `Failed to save organization profile (${res.status})`)
  }

  const json = await res.json()
  if (!json?.data) {
    throw new Error("Invalid response from organization profile server")
  }

  const savedProfile: OrganizationProfile = { ...DEFAULT_ORG_PROFILE, ...json.data }
  inMemoryProfile = savedProfile
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProfile))
  } catch {}
  window.dispatchEvent(new Event("organization_profile_updated"))

  return savedProfile
}

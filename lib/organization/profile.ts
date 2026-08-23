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

export function saveOrganizationProfile(profile: OrganizationProfile): Promise<OrganizationProfile> {
  inMemoryProfile = profile
  if (typeof window === "undefined") return Promise.resolve(profile)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    window.dispatchEvent(new Event("organization_profile_updated"))
  } catch {
    // Ignore storage errors
  }

  // Persist to database & update storage URLs
  return fetch("/api/organization/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  })
    .then(async (res) => {
      if (!res.ok) return profile
      const json = await res.json()
      if (json?.data) {
        const savedProfile: OrganizationProfile = { ...DEFAULT_ORG_PROFILE, ...json.data }
        inMemoryProfile = savedProfile
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProfile))
        } catch {}
        window.dispatchEvent(new Event("organization_profile_updated"))
        return savedProfile
      }
      return profile
    })
    .catch(() => profile)
}

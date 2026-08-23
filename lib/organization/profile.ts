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
}

const STORAGE_KEY = "buildsight_organization_profile"

export function getOrganizationProfile(): OrganizationProfile {
  if (typeof window === "undefined") return DEFAULT_ORG_PROFILE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_ORG_PROFILE
    const parsed = JSON.parse(raw) as Partial<OrganizationProfile>
    return { ...DEFAULT_ORG_PROFILE, ...parsed }
  } catch {
    return DEFAULT_ORG_PROFILE
  }
}

export function saveOrganizationProfile(profile: OrganizationProfile): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    window.dispatchEvent(new Event("organization_profile_updated"))
  } catch {
    // Ignore storage errors
  }
}

export const DESIGN_STATUSES = ["draft", "published", "archived"] as const
export type DesignStatus = (typeof DESIGN_STATUSES)[number]

export type DesignGallerySite = {
  organizationId: string
  slug: string
  customHost: string | null
  isEnabled: boolean
  displayNameAr: string | null
  displayNameEn: string | null
  whatsappPhone: string | null
  logoUrl: string | null
  websiteUrl: string | null
}

export type DesignCategory = {
  id: string
  key: string
  nameAr: string
  nameEn: string
  sortOrder: number
  bookableByDefault: boolean
}

export type DesignImage = {
  id: string
  storagePath: string
  url: string
  altAr: string | null
  altEn: string | null
  orderIndex: number
}

export type Design = {
  id: string
  organizationId: string
  categoryId: string
  slug: string
  code: string
  titleAr: string
  titleEn: string
  summaryAr: string | null
  summaryEn: string | null
  descriptionAr: string | null
  descriptionEn: string | null
  floorsAr: string | null
  floorsEn: string | null
  builtAreaSqm: number | null
  bedrooms: number | null
  serviceAr: string | null
  serviceEn: string | null
  isBookable: boolean
  status: DesignStatus
  sortOrder: number
  publishedAt: string | null
  updatedAt: string
  images: DesignImage[]
}

/** The editable fields of a design, after validation. */
export type DesignInput = {
  categoryId: string
  slug: string
  code: string
  titleAr: string
  titleEn: string
  summaryAr: string | null
  summaryEn: string | null
  descriptionAr: string | null
  descriptionEn: string | null
  floorsAr: string | null
  floorsEn: string | null
  builtAreaSqm: number | null
  bedrooms: number | null
  serviceAr: string | null
  serviceEn: string | null
  isBookable: boolean
  sortOrder: number
}

export type DesignSiteInput = {
  isEnabled: boolean
  displayNameAr: string | null
  displayNameEn: string | null
  whatsappPhone: string | null
  websiteUrl: string | null
}

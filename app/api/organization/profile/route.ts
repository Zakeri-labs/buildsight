import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_ORG_PROFILE, type OrganizationProfile } from "@/lib/organization/profile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function uploadLogoToStorage(dataUrl: string | undefined, logoType: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl || ""
  try {
    const admin = createAdminClient()
    const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
    if (!match) return dataUrl
    const contentType = match[1]
    const base64Data = match[2]
    const buffer = Buffer.from(base64Data, "base64")
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg"
    const storagePath = `org-logos/${logoType}-${Date.now()}.${ext}`

    const { error: uploadError } = await admin.storage
      .from("project-stage-evidence")
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      })

    if (uploadError) return dataUrl

    const { data: signed } = await admin.storage
      .from("project-stage-evidence")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

    return signed?.signedUrl || dataUrl
  } catch {
    return dataUrl
  }
}

export async function GET() {
  try {
    const admin = createAdminClient()
    
    // 1. Try organization_settings table
    const { data: settingsData, error: settingsError } = await admin
      .from("organization_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle()

    if (!settingsError && settingsData) {
      const profile: OrganizationProfile = {
        nameEn: settingsData.name_en || DEFAULT_ORG_PROFILE.nameEn,
        nameAr: settingsData.name_ar || DEFAULT_ORG_PROFILE.nameAr,
        crNumber: settingsData.cr_number || DEFAULT_ORG_PROFILE.crNumber,
        poBox: settingsData.po_box || DEFAULT_ORG_PROFILE.poBox,
        postalCode: settingsData.postal_code || DEFAULT_ORG_PROFILE.postalCode,
        phones: settingsData.phones || DEFAULT_ORG_PROFILE.phones,
        email: settingsData.email || DEFAULT_ORG_PROFILE.email,
        website: settingsData.website || DEFAULT_ORG_PROFILE.website,
        addressEn: settingsData.address_en || DEFAULT_ORG_PROFILE.addressEn,
        addressAr: settingsData.address_ar || DEFAULT_ORG_PROFILE.addressAr,
        logoUrl: settingsData.logo_url || "",
        pdfLogoUrl: settingsData.pdf_logo_url || "",
        pdfHeaderLogoUrl: settingsData.pdf_header_logo_url || "",
      }
      return NextResponse.json({ data: profile })
    }

    // 2. Fallback to public.organizations table
    const { data: orgData } = await admin
      .from("organizations")
      .select("*")
      .eq("type", "supervising")
      .limit(1)
      .maybeSingle()

    if (orgData) {
      const profile: OrganizationProfile = {
        nameEn: orgData.name || DEFAULT_ORG_PROFILE.nameEn,
        nameAr: (orgData as any).name_ar || DEFAULT_ORG_PROFILE.nameAr,
        crNumber: (orgData as any).cr_number || orgData.registration_number || DEFAULT_ORG_PROFILE.crNumber,
        poBox: (orgData as any).po_box || DEFAULT_ORG_PROFILE.poBox,
        postalCode: orgData.postal_code || DEFAULT_ORG_PROFILE.postalCode,
        phones: orgData.phone || DEFAULT_ORG_PROFILE.phones,
        email: orgData.email || DEFAULT_ORG_PROFILE.email,
        website: orgData.website || DEFAULT_ORG_PROFILE.website,
        addressEn: orgData.address || DEFAULT_ORG_PROFILE.addressEn,
        addressAr: (orgData as any).address_ar || DEFAULT_ORG_PROFILE.addressAr,
        logoUrl: (orgData as any).logo_url || "",
        pdfLogoUrl: (orgData as any).pdf_logo_url || "",
        pdfHeaderLogoUrl: (orgData as any).pdf_header_logo_url || "",
      }
      return NextResponse.json({ data: profile })
    }

    return NextResponse.json({ data: null, fallback: DEFAULT_ORG_PROFILE })
  } catch {
    return NextResponse.json({ data: null, fallback: DEFAULT_ORG_PROFILE })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as OrganizationProfile | null
    if (!body) {
      return NextResponse.json({ error: "Invalid profile data" }, { status: 400 })
    }

    const logoUrl = await uploadLogoToStorage(body.logoUrl, "org-logo")
    const pdfLogoUrl = await uploadLogoToStorage(body.pdfLogoUrl, "pdf-logo")
    const pdfHeaderLogoUrl = await uploadLogoToStorage(body.pdfHeaderLogoUrl, "pdf-header-logo")

    const savedProfile: OrganizationProfile = {
      ...body,
      logoUrl,
      pdfLogoUrl,
      pdfHeaderLogoUrl,
    }

    const admin = createAdminClient()
    const payload = {
      id: "default",
      name_en: savedProfile.nameEn || DEFAULT_ORG_PROFILE.nameEn,
      name_ar: savedProfile.nameAr || DEFAULT_ORG_PROFILE.nameAr,
      cr_number: savedProfile.crNumber || DEFAULT_ORG_PROFILE.crNumber,
      po_box: savedProfile.poBox || DEFAULT_ORG_PROFILE.poBox,
      postal_code: savedProfile.postalCode || DEFAULT_ORG_PROFILE.postalCode,
      phones: savedProfile.phones || DEFAULT_ORG_PROFILE.phones,
      email: savedProfile.email || DEFAULT_ORG_PROFILE.email,
      website: savedProfile.website || "",
      address_en: savedProfile.addressEn || DEFAULT_ORG_PROFILE.addressEn,
      address_ar: savedProfile.addressAr || DEFAULT_ORG_PROFILE.addressAr,
      logo_url: savedProfile.logoUrl || "",
      pdf_logo_url: savedProfile.pdfLogoUrl || "",
      pdf_header_logo_url: savedProfile.pdfHeaderLogoUrl || "",
      updated_at: new Date().toISOString(),
    }

    // 1. Try upserting organization_settings
    await admin.from("organization_settings").upsert(payload).catch(() => null)

    // 2. Also sync to public.organizations table
    await admin
      .from("organizations")
      .update({
        name: savedProfile.nameEn,
        name_ar: savedProfile.nameAr,
        email: savedProfile.email,
        phone: savedProfile.phones,
        website: savedProfile.website,
        address: savedProfile.addressEn,
        postal_code: savedProfile.postalCode,
        registration_number: savedProfile.crNumber,
        logo_url: savedProfile.logoUrl || "",
        pdf_logo_url: savedProfile.pdfLogoUrl || "",
        pdf_header_logo_url: savedProfile.pdfHeaderLogoUrl || "",
      } as any)
      .eq("type", "supervising")
      .catch(() => null)

    return NextResponse.json({ success: true, data: savedProfile })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save organization profile"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

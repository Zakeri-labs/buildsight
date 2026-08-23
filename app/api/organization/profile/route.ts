import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_ORG_PROFILE, type OrganizationProfile } from "@/lib/organization/profile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

    const admin = createAdminClient()
    const payload = {
      id: "default",
      name_en: body.nameEn || DEFAULT_ORG_PROFILE.nameEn,
      name_ar: body.nameAr || DEFAULT_ORG_PROFILE.nameAr,
      cr_number: body.crNumber || DEFAULT_ORG_PROFILE.crNumber,
      po_box: body.poBox || DEFAULT_ORG_PROFILE.poBox,
      postal_code: body.postalCode || DEFAULT_ORG_PROFILE.postalCode,
      phones: body.phones || DEFAULT_ORG_PROFILE.phones,
      email: body.email || DEFAULT_ORG_PROFILE.email,
      website: body.website || "",
      address_en: body.addressEn || DEFAULT_ORG_PROFILE.addressEn,
      address_ar: body.addressAr || DEFAULT_ORG_PROFILE.addressAr,
      logo_url: body.logoUrl || "",
      pdf_logo_url: body.pdfLogoUrl || "",
      pdf_header_logo_url: body.pdfHeaderLogoUrl || "",
      updated_at: new Date().toISOString(),
    }

    // 1. Try upserting organization_settings
    await admin.from("organization_settings").upsert(payload).catch(() => null)

    // 2. Also sync to public.organizations table
    await admin
      .from("organizations")
      .update({
        name: body.nameEn,
        name_ar: body.nameAr,
        email: body.email,
        phone: body.phones,
        website: body.website,
        address: body.addressEn,
        postal_code: body.postalCode,
        registration_number: body.crNumber,
        logo_url: body.logoUrl || "",
        pdf_logo_url: body.pdfLogoUrl || "",
        pdf_header_logo_url: body.pdfHeaderLogoUrl || "",
      } as any)
      .eq("type", "supervising")
      .catch(() => null)

    return NextResponse.json({ success: true, data: body })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save organization profile"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

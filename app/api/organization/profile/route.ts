import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_ORG_PROFILE, type OrganizationProfile } from "@/lib/organization/profile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("organization_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ data: null, fallback: DEFAULT_ORG_PROFILE })
    }

    const profile: OrganizationProfile = {
      nameEn: data.name_en || DEFAULT_ORG_PROFILE.nameEn,
      nameAr: data.name_ar || DEFAULT_ORG_PROFILE.nameAr,
      crNumber: data.cr_number || DEFAULT_ORG_PROFILE.crNumber,
      poBox: data.po_box || DEFAULT_ORG_PROFILE.poBox,
      postalCode: data.postal_code || DEFAULT_ORG_PROFILE.postalCode,
      phones: data.phones || DEFAULT_ORG_PROFILE.phones,
      email: data.email || DEFAULT_ORG_PROFILE.email,
      website: data.website || DEFAULT_ORG_PROFILE.website,
      addressEn: data.address_en || DEFAULT_ORG_PROFILE.addressEn,
      addressAr: data.address_ar || DEFAULT_ORG_PROFILE.addressAr,
      logoUrl: data.logo_url || "",
      pdfLogoUrl: data.pdf_logo_url || "",
      pdfHeaderLogoUrl: data.pdf_header_logo_url || "",
    }

    return NextResponse.json({ data: profile })
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

    const { error } = await admin.from("organization_settings").upsert(payload)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: body })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save organization profile"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

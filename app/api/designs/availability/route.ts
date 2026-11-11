import { NextResponse } from "next/server"
import { getAvailability } from "@/lib/design-gallery/booking/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET() {
  try {
    const result = await getAvailability()
    return NextResponse.json(result, { headers: corsHeaders })
  } catch (error) {
    console.error("api/designs/availability error:", error)
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500, headers: corsHeaders })
  }
}

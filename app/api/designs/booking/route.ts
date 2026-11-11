import { NextRequest, NextResponse } from "next/server"
import { submitMeetingRequest } from "@/lib/design-gallery/booking/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const payload = body && typeof body === "object" ? { ...body } : {}
    if (typeof (payload as Record<string, unknown>).elapsedMs !== "number") {
      (payload as Record<string, unknown>).elapsedMs = 5000
    }
    const result = await submitMeetingRequest(payload)
    return NextResponse.json(result, { headers: corsHeaders })
  } catch (error) {
    console.error("api/designs/booking error:", error)
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500, headers: corsHeaders })
  }
}

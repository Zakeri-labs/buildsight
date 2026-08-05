import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth/redirects"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = safeNextPath(searchParams.get("next"), "/")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }

    console.error("Auth callback could not exchange the confirmation code:", error.message)
  }

  const errorUrl = new URL("/auth/error", origin)
  errorUrl.searchParams.set("next", next)
  return NextResponse.redirect(errorUrl)
}

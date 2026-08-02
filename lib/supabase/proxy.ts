import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PATHS = ["/auth", "/invite", "/_next", "/favicon", "/api/health"]

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey || url.includes("placeholder")) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(
      url,
      anonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
          },
        },
      },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

    if (!user && !isPublic) {
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      url.searchParams.set("next", pathname)
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch (error) {
    console.error("Middleware updateSession error:", error)
    return supabaseResponse
  }
}

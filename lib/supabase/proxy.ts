import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { resolveDefaultLandingDestination } from "@/lib/auth/default-landing"
import { ALL_PROJECTS_SCOPE_VALUE, SELECTED_PROJECT_COOKIE } from "@/lib/project-scope-constants"

const PUBLIC_PATHS = ["/auth", "/invite", "/_next", "/favicon", "/api/health"]

function preserveResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie))
  return target
}

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
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = "/auth/login"
      loginUrl.searchParams.set("next", pathname)
      return preserveResponseCookies(supabaseResponse, NextResponse.redirect(loginUrl))
    }

    // Apply the role-based rule only to the default application root. Explicit
    // invitation, confirmation, and protected deep-link destinations never pass
    // through this branch, so their trusted `next` path remains authoritative.
    if (user && pathname === "/") {
      const landing = await resolveDefaultLandingDestination(user.id)

      if (landing.mode === "member") {
        const memberHomeUrl = request.nextUrl.clone()
        memberHomeUrl.pathname = landing.destination
        memberHomeUrl.search = ""
        return preserveResponseCookies(supabaseResponse, NextResponse.redirect(memberHomeUrl))
      }

      if (landing.mode === "admin") {
        request.cookies.set(SELECTED_PROJECT_COOKIE, ALL_PROJECTS_SCOPE_VALUE)
        const response = NextResponse.next({ request })
        response.cookies.set(SELECTED_PROJECT_COOKIE, ALL_PROJECTS_SCOPE_VALUE, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        })
        return preserveResponseCookies(supabaseResponse, response)
      }
    }

    return supabaseResponse
  } catch (error) {
    console.error("Middleware updateSession error:", error)
    return supabaseResponse
  }
}

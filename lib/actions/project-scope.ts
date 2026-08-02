"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { SELECTED_PROJECT_COOKIE } from "@/lib/project-scope"

/**
 * Persists the selected project (or "all") in a cookie and revalidates the
 * app so every server-rendered page re-queries data scoped to that project.
 */
export async function selectProject(projectId: string) {
  const store = await cookies()
  store.set(SELECTED_PROJECT_COOKIE, projectId || "all", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  revalidatePath("/", "layout")
}

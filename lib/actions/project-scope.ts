"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { isValidProjectId, SELECTED_PROJECT_COOKIE } from "@/lib/project-scope"

/**
 * Persists the selected project (or "all") in a cookie and revalidates the
 * app so every server-rendered page re-queries data scoped to that project.
 */
export async function selectProject(projectId: string) {
  const store = await cookies()
  const selectedProjectId = projectId === "all" || !isValidProjectId(projectId) ? "all" : projectId
  store.set(SELECTED_PROJECT_COOKIE, selectedProjectId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  })
  revalidatePath("/", "layout")
}

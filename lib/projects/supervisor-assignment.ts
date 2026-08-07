import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export const PROJECT_SUPERVISOR_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeProjectSupervisorUserId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return PROJECT_SUPERVISOR_UUID_PATTERN.test(normalized) ? normalized : null
}

export async function setProjectSupervisorAssignment(input: {
  projectId: string
  supervisorId: string | null
  actorId: string
}): Promise<string | null> {
  const projectId = normalizeProjectSupervisorUserId(input.projectId)
  const actorId = normalizeProjectSupervisorUserId(input.actorId)
  const supervisorId = input.supervisorId == null ? null : normalizeProjectSupervisorUserId(input.supervisorId)

  if (!projectId || !actorId || (input.supervisorId != null && !supervisorId)) {
    throw new Error("Invalid Project Supervisor assignment identifiers.")
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("set_project_supervisor_assignment", {
    target_project_id: projectId,
    target_supervisor_id: supervisorId,
    actor_id: actorId,
  })
  if (error) throw error

  if (data == null) return null
  const normalized = normalizeProjectSupervisorUserId(data)
  if (!normalized) throw new Error("Project Supervisor assignment returned an invalid identifier.")
  return normalized
}

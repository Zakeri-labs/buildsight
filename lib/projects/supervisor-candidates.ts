import type { OrganizationRole } from "@/lib/db/types"

export const PROJECT_SUPERVISOR_ORGANIZATION_ROLES = [
  "org_admin",
  "org_manager",
  "org_member",
] as const satisfies readonly OrganizationRole[]

const PROJECT_SUPERVISOR_ORGANIZATION_ROLE_SET = new Set<string>(
  PROJECT_SUPERVISOR_ORGANIZATION_ROLES,
)

export function isProjectSupervisorOrganizationRole(
  role: unknown,
): role is (typeof PROJECT_SUPERVISOR_ORGANIZATION_ROLES)[number] {
  return typeof role === "string" && PROJECT_SUPERVISOR_ORGANIZATION_ROLE_SET.has(role)
}

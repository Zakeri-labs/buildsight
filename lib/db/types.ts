export type OrgType = "supervising" | "external"
export type OrganizationStatus = "pending" | "invited" | "active" | "suspended"
export type OrganizationRole = "org_admin" | "org_manager" | "org_member" | "viewer"
export type ProjectOrgRole =
  | "consultant"
  | "client"
  | "contractor"
  | "subcontractor"
  | "government"
  | "supplier"
  | "third_party"
export type ProjectAccessRole =
  | "project_admin"
  | "project_manager"
  | "inspector"
  | "reviewer"
  | "approver"
  | "contributor"
  | "viewer"
export type MembershipStatus = "active" | "inactive"
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked"

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
}

export type Organization = {
  id: string
  name: string
  type: OrgType
  status: OrganizationStatus
  created_by: string | null
  created_at: string
}

export type Project = {
  id: string
  name: string
  code: string | null
  location: string | null
  status: string
  supervising_organization_id: string
  created_at: string
}

export type Invitation = {
  id: string
  email: string
  organization_id: string
  project_id: string | null
  organization_role: OrganizationRole
  project_org_role: ProjectOrgRole | null
  project_access_role: ProjectAccessRole | null
  token: string
  status: InvitationStatus
  invited_by: string | null
  accepted_by: string | null
  expires_at: string
  created_at: string
}

export const ORGANIZATION_ROLES: OrganizationRole[] = ["org_admin", "org_manager", "org_member", "viewer"]
export const PROJECT_ORG_ROLES: ProjectOrgRole[] = [
  "consultant",
  "client",
  "contractor",
  "subcontractor",
  "government",
  "supplier",
  "third_party",
]
export const PROJECT_ACCESS_ROLES: ProjectAccessRole[] = [
  "project_admin",
  "project_manager",
  "inspector",
  "reviewer",
  "approver",
  "contributor",
  "viewer",
]

export const ROLE_LABELS: Record<string, string> = {
  org_admin: "Organization Admin",
  org_manager: "Organization Manager",
  org_member: "Organization Member",
  viewer: "Viewer",
  consultant: "Consultant",
  client: "Client",
  contractor: "Contractor",
  subcontractor: "Subcontractor",
  government: "Government",
  supplier: "Supplier",
  third_party: "Third Party",
  project_admin: "Project Admin",
  project_manager: "Project Manager",
  inspector: "Inspector",
  reviewer: "Reviewer",
  approver: "Approver",
  contributor: "Contributor",
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

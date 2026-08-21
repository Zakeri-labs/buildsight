export const PARTICIPANT_TYPE_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "supervisor", label: "Supervisor" },
  { value: "consultant", label: "Consultant" },
  { value: "contractor", label: "Contractor" },
  { value: "other", label: "Other" },
] as const

export type AddParticipantType = (typeof PARTICIPANT_TYPE_OPTIONS)[number]["value"]

export const SUPERVISOR_ROLE_OPTIONS = [
  "Supervisor",
  "Project Manager",
  "Site Engineer",
  "QA/QC Engineer",
  "HSE Officer",
] as const

export const OTHER_PARTICIPANT_ROLE_OPTIONS = ["Supplier", "Other"] as const

export const ADD_PARTICIPANT_ROLE_OPTIONS = [
  "Consultant",
  "Client / Owner",
  "Contractor",
  "Supervisor",
  "Project Manager",
  "Site Engineer",
  "QA/QC Engineer",
  "HSE Officer",
  "Supplier",
  "Subcontractor",
  "Other",
] as const

export type AddParticipantRole = (typeof ADD_PARTICIPANT_ROLE_OPTIONS)[number]

export const CONTRACTOR_ROLE_OPTIONS = [
  { value: "main_contractor", label: "Main Contractor" },
  { value: "mep_contractor", label: "MEP Contractor" },
  { value: "electrical_contractor", label: "Electrical Contractor" },
  { value: "mechanical_contractor", label: "Mechanical Contractor" },
  { value: "civil_contractor", label: "Civil Contractor" },
  { value: "interior_contractor", label: "Interior Contractor" },
  { value: "landscape_contractor", label: "Landscape Contractor" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "other", label: "Other" },
] as const

export type ContractorRole = (typeof CONTRACTOR_ROLE_OPTIONS)[number]["value"]

export type LegacyProjectParticipantRole =
  | "Consultant"
  | "Client"
  | "Contractor"
  | "Third Party"
  | "Government"

export type ProjectParticipantRole = LegacyProjectParticipantRole | AddParticipantRole

export type ProjectParticipantUserOption = {
  id: string
  name: string
  email: string
  avatarUrl?: string
  organizationId: string
  organizationName: string
  organizationRole: string
}

export type ProjectParticipantGroup = "clients" | "supervisors" | "contractors" | "other"

export type ProjectParticipantView = {
  id: string
  organization: string
  organizationId?: string
  organizationType: string
  participantType: string
  projectRole: ProjectParticipantRole
  contractorRole?: ContractorRole
  contractorRoleLabel?: string
  contractorRoleOther?: string
  sourceKey: string
  isExternalContact: boolean
  keyContact: {
    userId?: string
    linkedBy?: "linked" | "email" | "name"
    name: string
    email?: string
    phone?: string
    initials: string
    avatar?: string
    profileAvatar?: string
    participantAvatar?: string
    ownerIdCardAvatar?: string
    detail?: string
  }
  usersWithAccess: number
  status: "Active" | "Limited Access" | "Contact Only"
  logoTone?: "blue" | "amber" | "emerald" | "cyan" | "violet"
}

export function isAddParticipantRole(value: string): value is AddParticipantRole {
  return (ADD_PARTICIPANT_ROLE_OPTIONS as readonly string[]).includes(value)
}

export function isAddParticipantType(value: string): value is AddParticipantType {
  return (PARTICIPANT_TYPE_OPTIONS as readonly { value: string }[]).some((option) => option.value === value)
}

export function isContractorRole(value: string): value is ContractorRole {
  return (CONTRACTOR_ROLE_OPTIONS as readonly { value: string }[]).some((option) => option.value === value)
}

export function contractorRoleLabel(value: string | null | undefined, custom?: string | null): string | undefined {
  if (!value) return undefined
  if (value === "other") return custom?.trim() || "Other"
  return CONTRACTOR_ROLE_OPTIONS.find((option) => option.value === value)?.label
}

export function participantGroup(participant: Pick<ProjectParticipantView, "participantType" | "projectRole">): ProjectParticipantGroup {
  if (participant.participantType === "client" || participant.projectRole === "Client" || participant.projectRole === "Client / Owner") {
    return "clients"
  }
  if (
    participant.participantType === "contractor" ||
    participant.participantType === "subcontractor" ||
    participant.projectRole === "Contractor" ||
    participant.projectRole === "Subcontractor"
  ) {
    return "contractors"
  }
  if (
    participant.projectRole === "Consultant" ||
    participant.projectRole === "Supervisor" ||
    participant.projectRole === "Project Manager" ||
    participant.projectRole === "Site Engineer" ||
    participant.projectRole === "QA/QC Engineer" ||
    participant.projectRole === "HSE Officer"
  ) {
    return "supervisors"
  }
  return "other"
}

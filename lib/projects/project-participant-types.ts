export const ADD_PARTICIPANT_ROLE_OPTIONS = [
  "Consultant",
  "Client / Owner",
  "Contractor",
  "Project Manager",
  "Site Engineer",
  "QA/QC Engineer",
  "HSE Officer",
  "Supplier",
  "Subcontractor",
  "Other",
] as const

export type AddParticipantRole = (typeof ADD_PARTICIPANT_ROLE_OPTIONS)[number]

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

export type ProjectParticipantView = {
  id: string
  organization: string
  organizationId?: string
  organizationType: string
  projectRole: ProjectParticipantRole
  keyContact: {
    userId?: string
    linkedBy?: "linked" | "email" | "name"
    name: string
    email?: string
    initials: string
    avatar?: string
    profileAvatar?: string
    participantAvatar?: string
    detail?: string
  }
  usersWithAccess: number
  status: "Active" | "Limited Access"
  logoTone?: "blue" | "amber" | "emerald" | "cyan" | "violet"
}

export function isAddParticipantRole(value: string): value is AddParticipantRole {
  return (ADD_PARTICIPANT_ROLE_OPTIONS as readonly string[]).includes(value)
}

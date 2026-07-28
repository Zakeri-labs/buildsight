export type ProjectParticipantRole =
  | "Consultant"
  | "Client"
  | "Contractor"
  | "Third Party"
  | "Government"

export type ProjectParticipantView = {
  id: string
  organization: string
  organizationId?: string
  organizationType: string
  projectRole: ProjectParticipantRole
  keyContact: {
    userId?: string
    name: string
    email?: string
    initials: string
    avatar?: string
    detail?: string
  }
  usersWithAccess: number
  status: "Active" | "Limited Access"
  logoTone?: "blue" | "amber" | "emerald" | "cyan" | "violet"
}

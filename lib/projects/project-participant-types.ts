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

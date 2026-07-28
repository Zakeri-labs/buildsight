export type ProjectParticipantRole =
  | "Consultant"
  | "Client"
  | "Contractor"
  | "Third Party"
  | "Government"

export type ProjectParticipantView = {
  id: string
  organization: string
  organizationType: string
  projectRole: ProjectParticipantRole
  keyContact: {
    name: string
    initials: string
    avatar?: string
    detail?: string
  }
  usersWithAccess: number
  status: "Active" | "Limited Access"
  logoTone?: "blue" | "amber" | "emerald" | "cyan" | "violet"
}

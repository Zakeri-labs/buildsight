"use client"

import { Fragment, useMemo, useState, useTransition, type ChangeEvent, type KeyboardEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Building2,
  Check,
  ChevronDown,
  Eye,
  ImagePlus,
  Landmark,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  UsersRound,
} from "lucide-react"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { AvatarManagementDialog } from "@/components/profile/avatar-management-dialog"
import { ParticipantAvatarManagementDialog } from "@/components/projects/participant-avatar-management-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  addProjectParticipantAction,
  editProjectContractorAction,
  removeProjectParticipantAction,
} from "@/lib/actions/project-participants"
import {
  CONTRACTOR_ROLE_OPTIONS,
  OTHER_PARTICIPANT_ROLE_OPTIONS,
  PARTICIPANT_TYPE_OPTIONS,
  SUPERVISOR_ROLE_OPTIONS,
  participantGroup,
  type AddParticipantRole,
  type AddParticipantType,
  type ContractorRole,
  type ProjectParticipantUserOption,
  type ProjectParticipantView as ProjectParticipant,
} from "@/lib/projects/project-participant-types"
import { cn } from "@/lib/utils"
import { ProjectOverviewTableColumns } from "@/components/projects/project-overview-table-columns"

export type { ProjectParticipantView as ProjectParticipant } from "@/lib/projects/project-participant-types"

const roleStyles: Partial<Record<ProjectParticipant["projectRole"], string>> = {
  Consultant: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  Supervisor: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  "Project Manager": "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  "Site Engineer": "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  "QA/QC Engineer": "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  "HSE Officer": "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  Client: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  "Client / Owner": "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  Contractor: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  Subcontractor: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  Supplier: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  "Third Party": "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  Government: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

const logoStyles: Record<NonNullable<ProjectParticipant["logoTone"]>, string> = {
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
}

const PARTICIPANT_GROUPS = [
  { key: "clients", label: "Clients" },
  { key: "supervisors", label: "Supervisors" },
  { key: "contractors", label: "Contractors" },
  { key: "other", label: "Other Participants" },
] as const

function OrganizationMark({ participant }: { participant: ProjectParticipant }) {
  const Icon = participant.projectRole === "Government"
    ? Landmark
    : participant.projectRole === "Third Party" || participant.projectRole === "Other"
      ? ShieldCheck
      : Building2

  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        logoStyles[participant.logoTone ?? "blue"],
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  )
}

type AvatarDialogState = {
  participant: ProjectParticipant
  kind: "profile" | "participant"
  remove: boolean
}

function UserPicker({
  users,
  value,
  onChange,
  disabled,
}: {
  users: ProjectParticipantUserOption[]
  value: string
  onChange: (userId: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selectedUser = users.find((user) => user.id === value)
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en")
    if (!normalized) return users
    return users.filter((user) =>
      [user.name, user.email, user.organizationName, user.organizationRole]
        .join(" ")
        .toLocaleLowerCase("en")
        .includes(normalized),
    )
  }, [query, users])

  return (
    <div className="space-y-2">
      <Label>Select User</Label>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-between bg-transparent px-3 font-normal"
          onClick={() => setOpen((current) => !current)}
          disabled={disabled || users.length === 0}
          aria-expanded={open}
        >
          {selectedUser ? (
            <span className="flex min-w-0 items-center gap-2.5 text-start">
              <ProfileAvatar name={selectedUser.name} email={selectedUser.email} avatarUrl={selectedUser.avatarUrl} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{selectedUser.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{selectedUser.organizationName}</span>
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {users.length === 0 ? "No eligible users available" : "Select a registered user"}
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>

        {open ? (
          <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
            <div className="relative border-b p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                placeholder="Search name, email, or organization"
                className="pl-8"
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === "Escape") setOpen(false)
                }}
              />
            </div>
            <div className="max-h-56 overflow-y-auto p-1.5">
              {filteredUsers.length === 0 ? (
                <p className="px-3 py-5 text-center text-sm text-muted-foreground">No matching users found.</p>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start transition-colors hover:bg-muted"
                    onClick={() => {
                      onChange(user.id)
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    <ProfileAvatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{user.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.organizationName} · {user.organizationRole}
                      </span>
                    </span>
                    {value === user.id ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ContractorRoleFields({
  role,
  customRole,
  onRoleChange,
  onCustomRoleChange,
  disabled,
}: {
  role: ContractorRole | ""
  customRole: string
  onRoleChange: (value: ContractorRole | "") => void
  onCustomRoleChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Contractor Role</Label>
        <Select value={role} onValueChange={(value) => onRoleChange((value ?? "") as ContractorRole | "")} disabled={disabled}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue placeholder="Select contractor role" />
          </SelectTrigger>
          <SelectContent align="start">
            {CONTRACTOR_ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {role === "other" ? (
        <div className="space-y-2">
          <Label htmlFor="custom-contractor-type">Custom Contractor Type</Label>
          <Input
            id="custom-contractor-type"
            value={customRole}
            onChange={(event) => onCustomRoleChange(event.target.value)}
            placeholder="Enter contractor type"
            maxLength={150}
            disabled={disabled}
          />
        </div>
      ) : null}
    </>
  )
}

function AddParticipantDialog({ projectId, users }: { projectId: string; users: ProjectParticipantUserOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [participantType, setParticipantType] = useState<AddParticipantType | "">("")
  const [source, setSource] = useState<"existing_user" | "external_contact">("existing_user")
  const [selectedUserId, setSelectedUserId] = useState("")
  const [participantRole, setParticipantRole] = useState<AddParticipantRole | "">("")
  const [contractorRole, setContractorRole] = useState<ContractorRole | "">("")
  const [customContractorType, setCustomContractorType] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [contactPerson, setContactPerson] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setParticipantType("")
    setSource("existing_user")
    setSelectedUserId("")
    setParticipantRole("")
    setContractorRole("")
    setCustomContractorType("")
    setCompanyName("")
    setContactPerson("")
    setEmail("")
    setPhone("")
    setError(null)
  }

  function changeParticipantType(value: AddParticipantType | "") {
    setParticipantType(value)
    setParticipantRole("")
    setSelectedUserId("")
    setSource("existing_user")
    setContractorRole("")
    setCustomContractorType("")
    setError(null)
  }

  function submit() {
    if (!participantType) {
      setError("Select a participant type.")
      return
    }
    if (source === "existing_user" && !selectedUserId) {
      setError("Select a registered user.")
      return
    }
    if (participantType === "supervisor" && !participantRole) {
      setError("Select the supervisor role.")
      return
    }
    if (participantType === "other" && !participantRole) {
      setError("Select the participant role.")
      return
    }
    if (participantType === "contractor" && !contractorRole) {
      setError("Select a contractor role.")
      return
    }
    if (participantType === "contractor" && contractorRole === "other" && !customContractorType.trim()) {
      setError("Enter the custom contractor type.")
      return
    }
    if (source === "external_contact" && !companyName.trim()) {
      setError("Enter the contractor company name.")
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await addProjectParticipantAction({
        projectId,
        participantType,
        source,
        userId: source === "existing_user" ? selectedUserId : undefined,
        participantRole: participantRole || undefined,
        contractorRole: contractorRole || undefined,
        customContractorType,
        companyName,
        contactPerson,
        email,
        phone,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  const externalContractor = participantType === "contractor" && source === "external_contact"

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" className="shrink-0">
            <Plus data-icon="inline-start" />
            Add Participant
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Participant</DialogTitle>
          <DialogDescription>Add a registered user or an external contractor contact to this project.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-0.5 py-1">
          <div className="space-y-2">
            <Label>Participant Type</Label>
            <Select value={participantType} onValueChange={(value) => changeParticipantType((value ?? "") as AddParticipantType | "")} disabled={pending}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Select participant type" /></SelectTrigger>
              <SelectContent align="start">
                {PARTICIPANT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {participantType === "contractor" ? (
            <div className="space-y-2">
              <Label>Contractor Source</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={source === "existing_user" ? "default" : "outline"}
                  className={cn("justify-start", source !== "existing_user" && "bg-transparent")}
                  onClick={() => { setSource("existing_user"); setError(null) }}
                  disabled={pending}
                >
                  Existing User
                </Button>
                <Button
                  type="button"
                  variant={source === "external_contact" ? "default" : "outline"}
                  className={cn("justify-start", source !== "external_contact" && "bg-transparent")}
                  onClick={() => { setSource("external_contact"); setSelectedUserId(""); setError(null) }}
                  disabled={pending}
                >
                  External Contractor Contact
                </Button>
              </div>
            </div>
          ) : null}

          {participantType && !externalContractor ? (
            <UserPicker users={users} value={selectedUserId} onChange={setSelectedUserId} disabled={pending} />
          ) : null}

          {participantType === "supervisor" ? (
            <div className="space-y-2">
              <Label>Supervisor Role</Label>
              <Select value={participantRole} onValueChange={(value) => setParticipantRole((value ?? "") as AddParticipantRole | "")} disabled={pending}>
                <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Select supervisor role" /></SelectTrigger>
                <SelectContent align="start">
                  {SUPERVISOR_ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {participantType === "other" ? (
            <div className="space-y-2">
              <Label>Participant Role</Label>
              <Select value={participantRole} onValueChange={(value) => setParticipantRole((value ?? "") as AddParticipantRole | "")} disabled={pending}>
                <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Select participant role" /></SelectTrigger>
                <SelectContent align="start">
                  {OTHER_PARTICIPANT_ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {participantType === "contractor" ? (
            <ContractorRoleFields
              role={contractorRole}
              customRole={customContractorType}
              onRoleChange={(value) => {
                setContractorRole(value)
                if (value !== "other") setCustomContractorType("")
              }}
              onCustomRoleChange={setCustomContractorType}
              disabled={pending}
            />
          ) : null}

          {externalContractor ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contractor-company-name">Company Name</Label>
                <Input id="contractor-company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={160} disabled={pending} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contractor-contact-person">Contact Person</Label>
                <Input id="contractor-contact-person" value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} maxLength={160} disabled={pending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractor-email">Email</Label>
                <Input id="contractor-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} disabled={pending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractor-phone">Phone</Label>
                <Input id="contractor-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={50} disabled={pending} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">External contacts are contact records only and do not receive login access or dashboard tasks.</p>
            </div>
          ) : null}

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="bg-transparent" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending || !participantType}>
            {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
            Add Participant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditContractorDialog({
  projectId,
  participant,
  open,
  onOpenChange,
}: {
  projectId: string
  participant: ProjectParticipant | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [contractorRole, setContractorRole] = useState<ContractorRole | "">(participant?.contractorRole ?? "")
  const [customContractorType, setCustomContractorType] = useState(participant?.contractorRoleOther ?? "")
  const [companyName, setCompanyName] = useState(participant?.organization ?? "")
  const [contactPerson, setContactPerson] = useState(participant?.keyContact.name ?? "")
  const [email, setEmail] = useState(participant?.keyContact.email ?? "")
  const [phone, setPhone] = useState(participant?.keyContact.phone ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!participant) return null
  const currentParticipant = participant

  function submit() {
    if (!contractorRole) {
      setError("Select a contractor role.")
      return
    }
    if (contractorRole === "other" && !customContractorType.trim()) {
      setError("Enter the custom contractor type.")
      return
    }
    if (currentParticipant.isExternalContact && !companyName.trim()) {
      setError("Enter the contractor company name.")
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await editProjectContractorAction({
        projectId,
        participantId: currentParticipant.id,
        contractorRole,
        customContractorType,
        companyName,
        contactPerson,
        email,
        phone,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Contractor</DialogTitle>
          <DialogDescription>Update the contractor role and available contact information.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <ContractorRoleFields
            role={contractorRole}
            customRole={customContractorType}
            onRoleChange={(value) => {
              setContractorRole(value)
              if (value !== "other") setCustomContractorType("")
            }}
            onCustomRoleChange={setCustomContractorType}
            disabled={pending}
          />
          {currentParticipant.isExternalContact ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-contractor-company">Company Name</Label>
                <Input id="edit-contractor-company" value={companyName} onChange={(event) => setCompanyName(event.target.value)} maxLength={160} disabled={pending} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-contractor-contact">Contact Person</Label>
                <Input id="edit-contractor-contact" value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} maxLength={160} disabled={pending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-contractor-email">Email</Label>
                <Input id="edit-contractor-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} disabled={pending} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-contractor-phone">Phone</Label>
                <Input id="edit-contractor-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={50} disabled={pending} />
              </div>
            </div>
          ) : (
            <p className="rounded-lg border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">Registered-user profile details remain managed from the user profile.</p>
          )}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Pencil className="size-4" data-icon="inline-start" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RemoveParticipantDialog({
  projectId,
  participant,
  open,
  onOpenChange,
}: {
  projectId: string
  participant: ProjectParticipant | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  if (!participant) return null
  const currentParticipant = participant

  function remove() {
    setError(null)
    startTransition(async () => {
      const result = await removeProjectParticipantAction({ projectId, participantId: currentParticipant.id })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setError(null); onOpenChange(nextOpen) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove Participant</DialogTitle>
          <DialogDescription>
            Remove {currentParticipant.organization} from this project? Contact records will be hidden. Access is revoked only when it was granted by this participant workflow.
          </DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Trash2 className="size-4" data-icon="inline-start" />}
            Remove Participant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectParticipants({
  projectId,
  participants,
  participantUsers = [],
  canManageParticipants = false,
  canManageAvatars = false,
}: {
  projectId: string
  participants: ProjectParticipant[]
  participantUsers?: ProjectParticipantUserOption[]
  canManageParticipants?: boolean
  canManageAvatars?: boolean
}) {
  const [avatarDialog, setAvatarDialog] = useState<AvatarDialogState | null>(null)
  const [editContractor, setEditContractor] = useState<ProjectParticipant | null>(null)
  const [removeParticipant, setRemoveParticipant] = useState<ProjectParticipant | null>(null)
  const [participantAvatarOverrides, setParticipantAvatarOverrides] = useState<Record<string, string | null>>({})
  const [profileAvatarOverrides, setProfileAvatarOverrides] = useState<Record<string, string | null>>({})

  const groupedParticipants = useMemo(() => PARTICIPANT_GROUPS.map((group) => ({
    ...group,
    participants: participants.filter((participant) => participantGroup(participant) === group.key),
  })), [participants])

  function participantAvatar(participant: ProjectParticipant) {
    const userId = participant.keyContact.userId
    if (userId) {
      if (Object.prototype.hasOwnProperty.call(profileAvatarOverrides, userId)) return profileAvatarOverrides[userId]
      return participant.keyContact.profileAvatar ?? null
    }
    return Object.prototype.hasOwnProperty.call(participantAvatarOverrides, participant.id)
      ? participantAvatarOverrides[participant.id]
      : participant.keyContact.participantAvatar ?? null
  }

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <CardTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <UsersRound className="size-5 text-primary" />
              2. Project Participants
            </CardTitle>
            {canManageParticipants ? <AddParticipantDialog projectId={projectId} users={participantUsers} /> : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full table-fixed text-sm">
              <ProjectOverviewTableColumns />
              <thead>
                <tr className="border-b bg-muted/45 text-xs font-semibold text-muted-foreground">
                  <th className="px-5 py-3 text-start sm:px-6">Organization</th>
                  <th className="px-4 py-3 text-start">Type</th>
                  <th className="px-4 py-3 text-start">Participant Role</th>
                  <th className="px-4 py-3 text-start">Key Contact</th>
                  <th className="px-4 py-3 text-start">Users with Access</th>
                  <th className="px-4 py-3 text-start">Status</th>
                  <th className="px-5 py-3 text-end sm:px-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">No project participants have been added.</td>
                  </tr>
                ) : null}
                {groupedParticipants.map((group) => group.participants.length ? (
                  <Fragment key={group.key}>
                    <tr className="bg-muted/30">
                      <td colSpan={7} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:px-6">
                        {group.label} <span className="ms-1 font-normal normal-case">({group.participants.length})</span>
                      </td>
                    </tr>
                    {group.participants.map((participant) => {
                      const avatar = participantAvatar(participant)
                      const isContractor = participantGroup(participant) === "contractors"
                      const removable = isContractor
                      const hasActions = Boolean(participant.keyContact.userId || participant.organizationId || canManageParticipants || canManageAvatars)
                      return (
                        <tr key={participant.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-5 py-3.5 sm:px-6">
                            <div className="flex items-center gap-3">
                              <OrganizationMark participant={participant} />
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-foreground">{participant.organization}</span>
                                {participant.isExternalContact ? <span className="block text-xs text-muted-foreground">External contact</span> : null}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground">{participant.organizationType}</td>
                          <td className="px-4 py-3.5">
                            <span className={cn(
                              "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                              roleStyles[participant.projectRole] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                            )}>{participant.projectRole}</span>
                            {participant.contractorRoleLabel ? <span className="mt-1 block text-xs text-muted-foreground">{participant.contractorRoleLabel}</span> : null}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <ProfileAvatar name={participant.keyContact.name} email={participant.keyContact.email ?? ""} avatarUrl={avatar} size="sm" />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{participant.keyContact.name}</span>
                                {participant.keyContact.detail ? <span className="block truncate text-xs text-muted-foreground">{participant.keyContact.detail}</span> : null}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground">{participant.usersWithAccess} {participant.usersWithAccess === 1 ? "user" : "users"}</td>
                          <td className="px-4 py-3.5">
                            <span className={cn(
                              "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                              participant.status === "Active"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : participant.status === "Contact Only"
                                  ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  : "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
                            )}>{participant.status}</span>
                          </td>
                          <td className="px-5 py-3.5 text-end sm:px-6">
                            {hasActions ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${participant.organization}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><MoreVertical className="size-4" /></button>} />
                                <DropdownMenuContent align="end" className="w-52">
                                  {participant.keyContact.userId ? (
                                    <DropdownMenuItem render={<Link href={`/users?tab=members&userId=${encodeURIComponent(participant.keyContact.userId)}`}><Eye className="size-4" />View Profile</Link>} />
                                  ) : participant.organizationId ? (
                                    <DropdownMenuItem render={<Link href="/users?tab=organizations"><Eye className="size-4" />View organization</Link>} />
                                  ) : null}
                                  {participant.organizationId ? <DropdownMenuItem render={<Link href="/users?tab=projects"><UserRoundCog className="size-4" />Manage access</Link>} /> : null}
                                  {canManageParticipants && isContractor ? (
                                    <DropdownMenuItem onClick={() => setEditContractor(participant)}><Pencil className="size-4" />Edit Contractor</DropdownMenuItem>
                                  ) : null}
                                  {canManageAvatars ? (
                                    participant.keyContact.userId ? (
                                      <DropdownMenuItem onClick={() => setAvatarDialog({ participant, kind: "profile", remove: false })}><ImagePlus className="size-4" />Change Avatar</DropdownMenuItem>
                                    ) : (
                                      <>
                                        <DropdownMenuItem onClick={() => setAvatarDialog({ participant, kind: "participant", remove: false })}><ImagePlus className="size-4" />{avatar ? "Change Avatar" : "Upload Avatar"}</DropdownMenuItem>
                                        {avatar ? <DropdownMenuItem variant="destructive" onClick={() => setAvatarDialog({ participant, kind: "participant", remove: true })}><Trash2 className="size-4" />Remove Avatar</DropdownMenuItem> : null}
                                      </>
                                    )
                                  ) : null}
                                  {canManageParticipants && removable ? (
                                    <DropdownMenuItem variant="destructive" onClick={() => setRemoveParticipant(participant)}><Trash2 className="size-4" />Remove Participant</DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ) : null)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <EditContractorDialog
        key={editContractor ? `edit-${editContractor.id}` : "edit-contractor"}
        projectId={projectId}
        participant={editContractor}
        open={Boolean(editContractor)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setEditContractor(null) }}
      />
      <RemoveParticipantDialog
        key={removeParticipant ? `remove-${removeParticipant.id}` : "remove-participant"}
        projectId={projectId}
        participant={removeParticipant}
        open={Boolean(removeParticipant)}
        onOpenChange={(nextOpen) => { if (!nextOpen) setRemoveParticipant(null) }}
      />

      {avatarDialog?.kind === "profile" && avatarDialog.participant.keyContact.userId ? (
        <AvatarManagementDialog
          hideTrigger
          open
          onOpenChange={(next) => { if (!next) setAvatarDialog(null) }}
          projectId={projectId}
          participantId={avatarDialog.participant.id}
          targetUser={{
            id: avatarDialog.participant.keyContact.userId,
            name: avatarDialog.participant.keyContact.name,
            email: avatarDialog.participant.keyContact.email ?? "",
            avatarUrl: participantAvatar(avatarDialog.participant),
          }}
          onSaved={(avatarUrl) => {
            const userId = avatarDialog.participant.keyContact.userId
            if (!userId) return
            setProfileAvatarOverrides((current) => ({ ...current, [userId]: avatarUrl }))
          }}
        />
      ) : null}

      {avatarDialog?.kind === "participant" ? (
        <ParticipantAvatarManagementDialog
          open
          onOpenChange={(next) => { if (!next) setAvatarDialog(null) }}
          initialRemove={avatarDialog.remove}
          projectId={projectId}
          participantId={avatarDialog.participant.id}
          participantName={avatarDialog.participant.keyContact.name}
          participantEmail={avatarDialog.participant.keyContact.email}
          currentAvatar={participantAvatar(avatarDialog.participant)}
          onSaved={(avatarUrl) => setParticipantAvatarOverrides((current) => ({ ...current, [avatarDialog.participant.id]: avatarUrl }))}
        />
      ) : null}
    </>
  )
}

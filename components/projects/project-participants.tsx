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
import { attachProjectOwnerIdCards } from "@/lib/actions/projects"
import { uploadDocumentAsset } from "@/lib/documents/storage-upload"
import { sanitizeStorageFileName } from "@/lib/documents/simple-upload"
import { createClient } from "@/lib/supabase/client"
import { validateOwnerIdCardFile } from "@/lib/projects/owner-id-card"
import { OwnerIdCardField } from "@/components/projects/owner-id-card-field"
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
import { ProjectOverviewTableColumns, projectOverviewTableCellClass } from "@/components/projects/project-overview-table-columns"

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
      <div>
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
          <div className="mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
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
            <div className="max-h-[min(18rem,42dvh)] overflow-y-auto overscroll-contain p-1.5">
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
  const [idCardFile, setIdCardFile] = useState<File | null>(null)
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
    setIdCardFile(null)
    setError(null)
  }

  function changeParticipantType(value: AddParticipantType | "") {
    setParticipantType(value)
    setParticipantRole("")
    setSelectedUserId("")
    setSource("existing_user")
    setContractorRole("")
    setCustomContractorType("")
    setCompanyName("")
    setContactPerson("")
    setEmail("")
    setPhone("")
    setIdCardFile(null)
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
    if (participantType === "contractor" && source === "external_contact" && !companyName.trim()) {
      setError("Enter the contractor company name.")
      return
    }
    if (participantType === "client" && source === "external_contact") {
      if (companyName.trim().length < 2) {
        setError("Enter a valid client name (at least 2 characters).")
        return
      }
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError("Enter a valid email address.")
        return
      }
      if (idCardFile) {
        const idCardError = validateOwnerIdCardFile(idCardFile)
        if (idCardError) {
          setError(idCardError)
          return
        }
      }
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

      if (participantType === "client" && source === "external_contact" && idCardFile && result.ownerId) {
        try {
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            const storagePath = `${projectId}/${session.user.id}/owner-id-cards/${result.ownerId}/${crypto.randomUUID()}-${sanitizeStorageFileName(idCardFile.name)}`
            await uploadDocumentAsset(idCardFile, storagePath, session.access_token)
            const attachRes = await attachProjectOwnerIdCards({
              projectId,
              files: [{
                ownerId: result.ownerId,
                storagePath,
                originalFilename: idCardFile.name,
                mimeType: idCardFile.type || "application/octet-stream",
                sizeBytes: idCardFile.size,
              }],
            })
            if (!attachRes.ok) {
              console.error("[AddParticipant] Failed to attach owner ID card:", attachRes.error)
            }
          }
        } catch (uploadErr) {
          console.error("[AddParticipant] Failed to upload owner ID card:", uploadErr)
        }
      }

      setOpen(false)
      reset()
      router.refresh()
    })
  }

  const isExternal = source === "external_contact"
  const isExternalClient = participantType === "client" && isExternal
  const isExternalContractor = participantType === "contractor" && isExternal
  const showUserPicker = Boolean(participantType && !isExternal)

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
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] sm:max-w-lg",
          participantType &&
            "h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:h-[min(42rem,calc(100dvh-3rem))]",
        )}
      >
        <DialogHeader>
          <DialogTitle>Add Participant</DialogTitle>
          <DialogDescription>Add a registered user or an external contact to this project.</DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "space-y-4 overflow-y-auto overscroll-contain px-0.5 py-1",
            participantType ? "min-h-0" : "max-h-[65vh]",
          )}
        >
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

          {participantType === "client" ? (
            <div className="space-y-2">
              <Label>Client Source</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={source === "existing_user" ? "default" : "outline"}
                  className={cn("justify-start", source !== "existing_user" && "bg-transparent")}
                  onClick={() => { setSource("existing_user"); setError(null) }}
                  disabled={pending}
                >
                  Existing Registered User
                </Button>
                <Button
                  type="button"
                  variant={source === "external_contact" ? "default" : "outline"}
                  className={cn("justify-start", source !== "external_contact" && "bg-transparent")}
                  onClick={() => { setSource("external_contact"); setSelectedUserId(""); setError(null) }}
                  disabled={pending}
                >
                  External Client
                </Button>
              </div>
            </div>
          ) : null}

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

          {showUserPicker ? (
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

          {isExternalClient ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client-name">Client Name *</Label>
                <Input
                  id="client-name"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="e.g. ABDUL RAHMAN rashid al hasni"
                  maxLength={160}
                  disabled={pending}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="client-contact-person">Contact Name (Optional)</Label>
                  <Input
                    id="client-contact-person"
                    value={contactPerson}
                    onChange={(event) => setContactPerson(event.target.value)}
                    placeholder="Enter contact person name"
                    maxLength={160}
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-phone">Contact Phone (Optional)</Label>
                  <Input
                    id="client-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="e.g. 98976677"
                    maxLength={50}
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-email">Contact Email (Optional)</Label>
                  <Input
                    id="client-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="client@example.com"
                    maxLength={254}
                    disabled={pending}
                  />
                </div>
              </div>
              <OwnerIdCardField
                file={idCardFile}
                onChange={setIdCardFile}
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                External clients are contact records only and do not receive login access or dashboard tasks.
              </p>
            </div>
          ) : null}

          {isExternalContractor ? (
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
          <DialogTitle>Remove participant?</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove {currentParticipant.keyContact.name || currentParticipant.organization} ({currentParticipant.projectRole}) from this project? Their project access provided by this assignment will also be removed.
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
  memberMobile = false,
}: {
  projectId: string
  participants: ProjectParticipant[]
  participantUsers?: ProjectParticipantUserOption[]
  canManageParticipants?: boolean
  canManageAvatars?: boolean
  memberMobile?: boolean
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
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
    const isClient = participant.participantType === "client" || participant.projectRole === "Client" || participant.projectRole === "Client / Owner" || participant.sourceKey.startsWith("owner:")
    if (isClient && participant.keyContact.ownerIdCardAvatar) {
      return participant.keyContact.ownerIdCardAvatar
    }
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
        <CardHeader className={cn("border-b px-5 py-4 sm:px-6", memberMobile && "max-md:px-3 max-md:py-2.5")}>
          {memberMobile ? (
            <div className="md:hidden">
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 text-start"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((open) => !open)}
              >
                <UsersRound className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 text-sm font-semibold">Project Participants ({participants.length})</span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", mobileOpen && "rotate-180")} />
              </button>
            </div>
          ) : null}
          <div className={cn("flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center", memberMobile && "max-md:hidden")}>
            <CardTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              <UsersRound className="size-5 text-primary" />
              2. Project Participants
            </CardTitle>
            {canManageParticipants ? <AddParticipantDialog projectId={projectId} users={participantUsers} /> : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className={cn("overflow-x-auto", memberMobile && "max-md:hidden")}>
            <table className="w-full min-w-[920px] table-fixed text-sm">
              <ProjectOverviewTableColumns layout="participants" />
              <thead>
                <tr className="border-b bg-muted/45 text-xs font-semibold text-muted-foreground">
                  <th className={projectOverviewTableCellClass.headerFirst}>Organization</th>
                  <th className={projectOverviewTableCellClass.headerMiddle}>Type</th>
                  <th className={projectOverviewTableCellClass.headerMiddle}>Participant Role</th>
                  <th className={projectOverviewTableCellClass.headerMiddle}>Key Contact</th>
                  <th className={projectOverviewTableCellClass.headerMiddle}>Users with Access</th>
                  <th className={projectOverviewTableCellClass.headerMiddle}>Status</th>
                  <th className={projectOverviewTableCellClass.headerLast}>Actions</th>
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
                      const removable = true
                      const hasActions = Boolean(participant.keyContact.userId || participant.organizationId || canManageParticipants || canManageAvatars)
                      return (
                        <tr key={participant.id} className="transition-colors hover:bg-muted/30">
                          <td className={projectOverviewTableCellClass.bodyFirst}>
                            <div className="flex min-w-0 items-center gap-3">
                              <OrganizationMark participant={participant} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-foreground" title={participant.organization}>{participant.organization}</span>
                                {participant.isExternalContact ? <span className="block text-xs text-muted-foreground">External contact</span> : null}
                              </span>
                            </div>
                          </td>
                          <td className={cn(projectOverviewTableCellClass.bodyMiddle, "truncate text-muted-foreground")} title={participant.organizationType}>{participant.organizationType}</td>
                          <td className={projectOverviewTableCellClass.bodyMiddle}>
                            <span title={participant.projectRole} className={cn(
                              "inline-block max-w-full truncate rounded-md px-2.5 py-1 text-xs font-medium",
                              roleStyles[participant.projectRole] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                            )}>{participant.projectRole}</span>
                            {participant.contractorRoleLabel ? <span className="mt-1 block truncate text-xs text-muted-foreground" title={participant.contractorRoleLabel}>{participant.contractorRoleLabel}</span> : null}
                          </td>
                          <td className={projectOverviewTableCellClass.bodyMiddle}>
                            <div className="flex min-w-0 items-center gap-2.5">
                              <ProfileAvatar name={participant.keyContact.name} email={participant.keyContact.email ?? ""} avatarUrl={avatar} size="sm" />
                              <span className="min-w-0">
                                <span className="block truncate font-medium" title={participant.keyContact.name}>{participant.keyContact.name}</span>
                                {participant.keyContact.detail ? <span className="block truncate text-xs text-muted-foreground" title={participant.keyContact.detail}>{participant.keyContact.detail}</span> : null}
                              </span>
                            </div>
                          </td>
                          <td className={cn(projectOverviewTableCellClass.bodyMiddle, "whitespace-nowrap text-muted-foreground")}>{participant.usersWithAccess} {participant.usersWithAccess === 1 ? "user" : "users"}</td>
                          <td className={projectOverviewTableCellClass.bodyMiddle}>
                            <span className={cn(
                              "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                              participant.status === "Active"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : participant.status === "Contact Only"
                                  ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  : "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
                            )}>{participant.status}</span>
                          </td>
                          <td className={projectOverviewTableCellClass.bodyLast}>
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

          {memberMobile ? (
            <div className={cn("md:hidden", !mobileOpen && "hidden")}>
              {participants.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">No project participants have been added.</p>
              ) : (
                <div className="divide-y divide-border">
                  {groupedParticipants.map((group) => group.participants.length ? (
                    <div key={group.key}>
                      <div className="bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label} <span className="font-normal normal-case">({group.participants.length})</span>
                      </div>
                      <div className="divide-y divide-border/70">
                        {group.participants.map((participant) => {
                          const avatar = participantAvatar(participant)
                          const isContractor = participantGroup(participant) === "contractors"
                          const removable = true
                          const hasActions = canManageParticipants || canManageAvatars

                          return (
                            <article key={participant.id} className="flex min-w-0 items-start gap-2.5 px-3 py-2.5">
                              <OrganizationMark participant={participant} />
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-foreground" title={participant.organization}>{participant.organization}</p>
                                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <span className={cn(
                                        "inline-flex max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                        roleStyles[participant.projectRole] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                                      )}>{participant.projectRole}</span>
                                      <span className="truncate">{participant.organizationType}</span>
                                    </div>
                                  </div>
                                  <span className={cn(
                                    "inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                    participant.status === "Active"
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                      : participant.status === "Contact Only"
                                        ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                        : "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
                                  )}>{participant.status}</span>
                                </div>
                                <div className="mt-1.5 flex min-w-0 items-center gap-2">
                                  <ProfileAvatar name={participant.keyContact.name} email={participant.keyContact.email ?? ""} avatarUrl={avatar} size="sm" />
                                  <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={participant.keyContact.detail ?? participant.keyContact.name}>
                                    Key contact: <span className="font-medium text-foreground/85">{participant.keyContact.name}</span>
                                  </p>
                                  <span className="shrink-0 text-[11px] text-muted-foreground">{participant.usersWithAccess} {participant.usersWithAccess === 1 ? "user" : "users"}</span>
                                  {hasActions ? (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${participant.organization}`} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><MoreVertical className="size-4" /></button>} />
                                      <DropdownMenuContent align="end" className="w-52">
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
                                  ) : null}
                                </div>
                                {participant.contractorRoleLabel ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{participant.contractorRoleLabel}</p> : null}
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          ) : null}
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

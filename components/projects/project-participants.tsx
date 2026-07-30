"use client"

import { useMemo, useState, useTransition, type ChangeEvent, type KeyboardEvent } from "react"
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
import { addProjectParticipantAction } from "@/lib/actions/project-participants"
import {
  ADD_PARTICIPANT_ROLE_OPTIONS,
  type AddParticipantRole,
  type ProjectParticipantUserOption,
  type ProjectParticipantView as ProjectParticipant,
} from "@/lib/projects/project-participant-types"
import { cn } from "@/lib/utils"
import { ProjectOverviewTableColumns } from "@/components/projects/project-overview-table-columns"

export type { ProjectParticipantView as ProjectParticipant } from "@/lib/projects/project-participant-types"

const roleStyles: Partial<Record<ProjectParticipant["projectRole"], string>> = {
  Consultant: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
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

function AddParticipantDialog({ projectId, users }: { projectId: string; users: ProjectParticipantUserOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [userPickerOpen, setUserPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedUserId, setSelectedUserId] = useState("")
  const [participantRole, setParticipantRole] = useState<AddParticipantRole | "">("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selectedUser = users.find((user) => user.id === selectedUserId)
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

  function reset() {
    setUserPickerOpen(false)
    setQuery("")
    setSelectedUserId("")
    setParticipantRole("")
    setError(null)
  }

  function submit() {
    if (!selectedUserId || !participantRole) {
      setError("Select a user and participant role.")
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await addProjectParticipantAction({ projectId, userId: selectedUserId, participantRole })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Participant</DialogTitle>
          <DialogDescription>Add an existing registered user to this project.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label>Select User</Label>
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-between bg-transparent px-3 font-normal"
                onClick={() => setUserPickerOpen((current: boolean) => !current)}
                disabled={pending || users.length === 0}
                aria-expanded={userPickerOpen}
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

              {userPickerOpen ? (
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
                        if (event.key === "Escape") setUserPickerOpen(false)
                      }}
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1.5">
                    {filteredUsers.length === 0 ? (
                      <p className="px-3 py-5 text-center text-sm text-muted-foreground">No matching users found.</p>
                    ) : (
                      filteredUsers.map((user: ProjectParticipantUserOption) => (
                        <button
                          key={user.id}
                          type="button"
                          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start transition-colors hover:bg-muted"
                          onClick={() => {
                            setSelectedUserId(user.id)
                            setUserPickerOpen(false)
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
                          {selectedUserId === user.id ? <Check className="size-4 shrink-0 text-primary" /> : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Participant Role</Label>
            <Select value={participantRole} onValueChange={(value: string | null) => setParticipantRole((value ?? "") as AddParticipantRole | "")} disabled={pending}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Select participant role" />
              </SelectTrigger>
              <SelectContent align="start">
                {ADD_PARTICIPANT_ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="bg-transparent" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending || !selectedUserId || !participantRole}>
            {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
            Add Participant
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
  const [participantAvatarOverrides, setParticipantAvatarOverrides] = useState<Record<string, string | null>>({})
  const [profileAvatarOverrides, setProfileAvatarOverrides] = useState<Record<string, string | null>>({})

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
                {participants.map((participant) => {
                  const avatar = participantAvatar(participant)
                  return (
                    <tr key={participant.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-5 py-3.5 sm:px-6">
                        <div className="flex items-center gap-3">
                          <OrganizationMark participant={participant} />
                          <span className="font-medium text-foreground">{participant.organization}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">{participant.organizationType}</td>
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                          roleStyles[participant.projectRole] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                        )}>{participant.projectRole}</span>
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
                            : "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
                        )}>{participant.status}</span>
                      </td>
                      <td className="px-5 py-3.5 text-end sm:px-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${participant.organization}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><MoreVertical className="size-4" /></button>} />
                          <DropdownMenuContent align="end" className="w-52">
                            {participant.keyContact.userId ? (
                              <DropdownMenuItem render={<Link href={`/users?tab=members&userId=${encodeURIComponent(participant.keyContact.userId)}`}><Eye className="size-4" />View Profile</Link>} />
                            ) : (
                              <>
                                <DropdownMenuItem render={<Link href="/users?tab=organizations"><Eye className="size-4" />View organization</Link>} />
                                <DropdownMenuItem render={<Link href="/users?tab=projects"><UserRoundCog className="size-4" />Manage access</Link>} />
                              </>
                            )}
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
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
            setProfileAvatarOverrides((current: Record<string, string | null>) => ({ ...current, [userId]: avatarUrl }))
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
          onSaved={(avatarUrl) => setParticipantAvatarOverrides((current: Record<string, string | null>) => ({ ...current, [avatarDialog.participant.id]: avatarUrl }))}
        />
      ) : null}
    </>
  )
}

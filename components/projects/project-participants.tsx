"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Building2,
  Eye,
  ImagePlus,
  Landmark,
  MoreVertical,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  UsersRound,
} from "lucide-react"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { AvatarManagementDialog } from "@/components/profile/avatar-management-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ProjectParticipantView as ProjectParticipant } from "@/lib/projects/project-participant-types"
import { cn } from "@/lib/utils"

export type { ProjectParticipantView as ProjectParticipant } from "@/lib/projects/project-participant-types"

const roleStyles: Record<ProjectParticipant["projectRole"], string> = {
  Consultant: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  Client: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  Contractor: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  "Third Party": "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  Government: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
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
    : participant.projectRole === "Third Party"
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
  remove: boolean
}

export function ProjectParticipants({
  projectId,
  participants,
  canManageAvatars = false,
}: {
  projectId: string
  participants: ProjectParticipant[]
  canManageAvatars?: boolean
}) {
  const [avatarDialog, setAvatarDialog] = useState<AvatarDialogState | null>(null)
  const [avatarOverrides, setAvatarOverrides] = useState<Record<string, string | null>>({})

  function participantAvatar(participant: ProjectParticipant) {
    return Object.prototype.hasOwnProperty.call(avatarOverrides, participant.id)
      ? avatarOverrides[participant.id]
      : participant.keyContact.avatar ?? null
  }

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 sm:px-6">
          <CardTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <UsersRound className="size-5 text-primary" />
            2. Project Participants
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[940px] w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/45 text-xs font-semibold text-muted-foreground">
                  <th className="px-5 py-3 text-start sm:px-6">Organization</th>
                  <th className="px-4 py-3 text-start">Type</th>
                  <th className="px-4 py-3 text-start">Project Role</th>
                  <th className="px-4 py-3 text-start">Key Contact</th>
                  <th className="px-4 py-3 text-start">Users with Access</th>
                  <th className="px-4 py-3 text-start">Status</th>
                  <th className="px-5 py-3 text-end sm:px-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground sm:px-6">
                      No project participants have been added.
                    </td>
                  </tr>
                ) : null}
                {participants.map((participant) => {
                  const avatar = participantAvatar(participant)
                  const hasLinkedUser = Boolean(participant.keyContact.userId)
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
                        <span className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-medium", roleStyles[participant.projectRole])}>
                          {participant.projectRole}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <ProfileAvatar
                            name={participant.keyContact.name}
                            email={participant.keyContact.email ?? ""}
                            avatarUrl={avatar}
                            size="sm"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{participant.keyContact.name}</span>
                            {participant.keyContact.detail ? (
                              <span className="block truncate text-xs text-muted-foreground">{participant.keyContact.detail}</span>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {participant.usersWithAccess} {participant.usersWithAccess === 1 ? "user" : "users"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
                            participant.status === "Active"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
                          )}
                        >
                          {participant.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-end sm:px-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                aria-label={`Actions for ${participant.organization}`}
                                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <MoreVertical className="size-4" />
                              </button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              render={
                                <Link href="/users?tab=organizations">
                                  <Eye className="size-4" />
                                  View organization
                                </Link>
                              }
                            />
                            <DropdownMenuItem
                              render={
                                <Link href="/users?tab=projects">
                                  <UserRoundCog className="size-4" />
                                  Manage access
                                </Link>
                              }
                            />
                            {canManageAvatars ? (
                              hasLinkedUser ? (
                                <>
                                  <DropdownMenuItem onClick={() => setAvatarDialog({ participant, remove: false })}>
                                    <ImagePlus className="size-4" />
                                    {avatar ? "Change Avatar" : "Upload Avatar"}
                                  </DropdownMenuItem>
                                  {avatar ? (
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() => setAvatarDialog({ participant, remove: true })}
                                    >
                                      <Trash2 className="size-4" />
                                      Remove Avatar
                                    </DropdownMenuItem>
                                  ) : null}
                                </>
                              ) : (
                                <DropdownMenuItem disabled>
                                  <ImagePlus className="size-4" />
                                  No linked user profile
                                </DropdownMenuItem>
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

      {avatarDialog?.participant.keyContact.userId ? (
        <AvatarManagementDialog
          hideTrigger
          open
          onOpenChange={(next) => {
            if (!next) setAvatarDialog(null)
          }}
          initialRemove={avatarDialog.remove}
          projectId={projectId}
          participantId={avatarDialog.participant.id}
          targetUser={{
            id: avatarDialog.participant.keyContact.userId,
            name: avatarDialog.participant.keyContact.name,
            email: avatarDialog.participant.keyContact.email ?? "",
            avatarUrl: participantAvatar(avatarDialog.participant),
          }}
          onSaved={(avatarUrl) => {
            setAvatarOverrides((current) => ({
              ...current,
              [avatarDialog.participant.id]: avatarUrl,
            }))
          }}
        />
      ) : null}
    </>
  )
}

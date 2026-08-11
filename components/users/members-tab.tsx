"use client"

import { useState, useTransition } from "react"
import { ImagePlus, Loader2, MoreVertical, Trash2, UserCheck, UserPlus, UserRoundCog, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { AvatarManagementDialog } from "@/components/profile/avatar-management-dialog"
import { useCurrentUser } from "@/components/current-user-provider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RoleSelect } from "@/components/users/role-select"
import { OrgRoleBadge } from "@/components/users/role-badges"
import { InviteLinkDialog, type InviteResult } from "@/components/users/invite-link-dialog"
import { ORGANIZATION_ROLES, roleLabel, type OrganizationRole, type MembershipStatus } from "@/lib/db/types"
import { createInvitation } from "@/lib/actions/invitations"
import { updateOrgMemberRole, removeOrgMember, updateOrgMemberStatus, addDirectMember } from "@/lib/actions/organizations"
import type { MemberRow } from "@/lib/db/admin-console"

export function MembersTab({
  supervisingOrg,
  members,
}: {
  supervisingOrg: { id: string; name: string }
  members: MemberRow[]
}) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<OrganizationRole>("org_member")
  const [error, setError] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)
  const [pending, startTransition] = useTransition()

  function submitAddMember() {
    setError(null)
    startTransition(async () => {
      // First try adding directly as active member
      const res = await addDirectMember({
        email,
        organizationId: supervisingOrg.id,
        role,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setInviteOpen(false)
      setEmail("")
      setRole("org_member")

      if (res.data && !res.data.addedDirectly) {
        // If not added directly, generate invite link result
        const inviteRes = await createInvitation({
          email,
          organizationId: supervisingOrg.id,
          organizationRole: role,
        })
        if (inviteRes.ok && inviteRes.data) {
          setInviteResult({
            ...inviteRes.data,
            email: email.trim().toLowerCase(),
          })
        }
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm text-muted-foreground text-pretty">
          Members of <span className="font-medium text-foreground">{supervisingOrg.name}</span> and their platform
          roles.
        </p>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger
            render={
              <Button className="shrink-0">
                <UserPlus data-icon="inline-start" />
                Add member
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a member</DialogTitle>
              <DialogDescription className="text-pretty">
                Add or invite a new member to join {supervisingOrg.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Organization role</Label>
                <RoleSelect
                  value={role}
                  onValueChange={(v) => setRole(v as OrganizationRole)}
                  roles={ORGANIZATION_ROLES}
                  className="w-full"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)} className="bg-transparent">
                Cancel
              </Button>
              <Button onClick={submitAddMember} disabled={pending || !email}>
                {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
                Add member
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[45%] px-3 sm:w-[35%] lg:w-[26%]">Member</TableHead>
                <TableHead className="hidden w-[26%] px-3 md:table-cell lg:w-[24%]">Email</TableHead>
                <TableHead className="w-[30%] px-3 sm:w-[24%] md:w-[18%] lg:w-[16%]">Role</TableHead>
                <TableHead className="w-[20%] px-3 sm:w-[18%] md:w-[15%] lg:w-[14%]">Status</TableHead>
                <TableHead className="hidden w-[20%] px-3 lg:table-cell">Organization</TableHead>
                <TableHead className="w-12 px-2 text-end">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No members yet. Add your first teammate.
                  </TableCell>
                </TableRow>
              )}
              {members.map((m) => (
                <MemberRowItem key={m.id} member={m} organizationId={supervisingOrg.id} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <InviteLinkDialog
        result={inviteResult}
        onClose={() => setInviteResult(null)}
        manualShareOnly
      />
    </div>
  )
}

function MemberRowItem({ member, organizationId }: { member: MemberRow; organizationId: string }) {
  const currentUser = useCurrentUser()
  const [pending, startTransition] = useTransition()
  const [role, setRole] = useState<OrganizationRole>(member.role)
  const [status, setStatus] = useState<MembershipStatus>(member.status)
  const [draftRole, setDraftRole] = useState<OrganizationRole>(member.role)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(member.avatarUrl)
  const [error, setError] = useState<string | null>(null)

  function changeRole() {
    setError(null)
    startTransition(async () => {
      const res = await updateOrgMemberRole({ organizationId, membershipId: member.id, role: draftRole })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRole(draftRole)
      setRoleDialogOpen(false)
    })
  }

  function toggleStatus() {
    setError(null)
    const nextStatus: MembershipStatus = status === "active" ? "inactive" : "active"
    startTransition(async () => {
      const res = await updateOrgMemberStatus({
        organizationId,
        membershipId: member.id,
        status: nextStatus,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setStatus(nextStatus)
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      const res = await removeOrgMember({ organizationId, membershipId: member.id })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setStatus("inactive")
    })
  }

  return (
    <TableRow className={`h-12 ${status === "inactive" ? "opacity-60 bg-muted/30" : ""}`}>
      <TableCell className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProfileAvatar
            name={member.userName}
            email={member.userEmail}
            avatarUrl={avatarUrl}
            size="sm"
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{member.userName}</span>
            <span className="block truncate text-xs text-muted-foreground md:hidden">{member.userEmail}</span>
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden truncate px-3 py-2 text-muted-foreground md:table-cell">
        {member.userEmail}
      </TableCell>
      <TableCell className="px-3 py-2">
        <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary sm:hidden">
          {roleLabel(role).replace(/^Organization\s+/, "")}
        </span>
        <span className="hidden sm:inline-flex">
          <OrgRoleBadge role={role} />
        </span>
      </TableCell>
      <TableCell className="px-3 py-2">
        {status === "active" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground border border-border">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" /> Inactive
          </span>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell className="hidden truncate px-3 py-2 text-muted-foreground lg:table-cell">
        {member.organizationName}
      </TableCell>
      <TableCell className="px-2 py-2 text-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            render={
              <button
                type="button"
                aria-label={`Actions for ${member.userName}`}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setAvatarDialogOpen(true)}>
              <ImagePlus className="size-4" />
              Edit Profile Image
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setDraftRole(role)
                setRoleDialogOpen(true)
              }}
            >
              <UserRoundCog className="size-4" />
              Change Role
            </DropdownMenuItem>
            {status === "active" ? (
              <DropdownMenuItem variant="destructive" onClick={toggleStatus} disabled={pending}>
                <UserX className="size-4" />
                Deactivate Member
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={toggleStatus} disabled={pending} className="text-emerald-600 dark:text-emerald-400">
                <UserCheck className="size-4" />
                Activate Member
              </DropdownMenuItem>
            )}
            {status === "active" && (
              <DropdownMenuItem variant="destructive" onClick={remove}>
                <Trash2 className="size-4" />
                Remove Member
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <AvatarManagementDialog
          targetUser={{
            id: member.userId,
            name: member.userName,
            email: member.userEmail,
            avatarUrl,
          }}
          organizationId={organizationId}
          open={avatarDialogOpen}
          onOpenChange={setAvatarDialogOpen}
          hideTrigger
          onSaved={(nextAvatarUrl) => {
            setAvatarUrl(nextAvatarUrl)
            if (member.userId === currentUser.id) currentUser.setAvatarUrl(nextAvatarUrl)
          }}
        />

        <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change member role</DialogTitle>
              <DialogDescription>
                Update the organization role for {member.userName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Organization role</Label>
              <RoleSelect
                value={draftRole}
                onValueChange={(value) => setDraftRole(value as OrganizationRole)}
                roles={ORGANIZATION_ROLES}
                disabled={pending}
                className="w-full"
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRoleDialogOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={changeRole} disabled={pending || draftRole === role}>
                {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
                Save Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  )
}

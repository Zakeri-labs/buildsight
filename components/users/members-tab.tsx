"use client"

import { useState, useTransition } from "react"
import { UserPlus, Loader2 } from "lucide-react"
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
import { RoleSelect } from "@/components/users/role-select"
import { OrgRoleBadge } from "@/components/users/role-badges"
import { InviteLinkDialog, type InviteResult } from "@/components/users/invite-link-dialog"
import { ORGANIZATION_ROLES, type OrganizationRole } from "@/lib/db/types"
import { createInvitation } from "@/lib/actions/invitations"
import { updateOrgMemberRole, removeOrgMember } from "@/lib/actions/organizations"
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

  function submitInvite() {
    setError(null)
    startTransition(async () => {
      const res = await createInvitation({
        email,
        organizationId: supervisingOrg.id,
        organizationRole: role,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setInviteOpen(false)
      setEmail("")
      setRole("org_member")
      if (res.data) setInviteResult({ email, token: res.data.token, userExists: res.data.userExists })
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground text-pretty">
          Members of <span className="font-medium text-foreground">{supervisingOrg.name}</span> and their platform
          roles.
        </p>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger
            render={
              <Button>
                <UserPlus data-icon="inline-start" />
                Invite member
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a member</DialogTitle>
              <DialogDescription className="text-pretty">
                Send an invitation to join {supervisingOrg.name}. They&apos;ll receive a secure link to register or
                accept.
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
              <Button onClick={submitInvite} disabled={pending || !email}>
                {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
                Send invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead className="w-px text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No members yet. Invite your first teammate.
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

      <InviteLinkDialog result={inviteResult} onClose={() => setInviteResult(null)} />
    </div>
  )
}

function MemberRowItem({ member, organizationId }: { member: MemberRow; organizationId: string }) {
  const currentUser = useCurrentUser()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [role, setRole] = useState<OrganizationRole>(member.role)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(member.avatarUrl)
  const [error, setError] = useState<string | null>(null)

  function changeRole(next: OrganizationRole) {
    setRole(next)
    setError(null)
    startTransition(async () => {
      const res = await updateOrgMemberRole({ organizationId, membershipId: member.id, role: next })
      if (!res.ok) {
        setError(res.error)
        setRole(member.role)
        return
      }
      setEditing(false)
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      const res = await removeOrgMember({ organizationId, membershipId: member.id })
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <ProfileAvatar
            name={member.userName}
            email={member.userEmail}
            avatarUrl={avatarUrl}
            size="md"
          />
          <span className="font-medium">{member.userName}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{member.userEmail}</TableCell>
      <TableCell>
        {editing ? (
          <RoleSelect
            value={role}
            onValueChange={(v) => changeRole(v as OrganizationRole)}
            roles={ORGANIZATION_ROLES}
            disabled={pending}
            className="w-48"
          />
        ) : (
          <OrgRoleBadge role={member.role} />
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell className="text-muted-foreground">{member.organizationName}</TableCell>
      <TableCell className="text-end">
        <div className="flex flex-wrap justify-end gap-2">
          <AvatarManagementDialog
            targetUser={{
              id: member.userId,
              name: member.userName,
              email: member.userEmail,
              avatarUrl,
            }}
            organizationId={organizationId}
            onSaved={(nextAvatarUrl) => {
              setAvatarUrl(nextAvatarUrl)
              if (member.userId === currentUser.id) currentUser.setAvatarUrl(nextAvatarUrl)
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
            {editing ? "Done" : "Change role"}
          </Button>
          <Button variant="ghost" size="sm" onClick={remove} disabled={pending} className="text-destructive">
            Remove
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

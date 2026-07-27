"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Loader2, Building2, UserCog, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { ProjectOrgRoleBadge, AccessRoleBadge } from "@/components/users/role-badges"
import { InviteLinkDialog, type InviteResult } from "@/components/users/invite-link-dialog"
import { ProjectLocationField } from "@/components/projects/project-location-field"
import { EMPTY_PROJECT_LOCATION, type ProjectLocationValue } from "@/lib/locations/types"
import {
  PROJECT_ORG_ROLES,
  PROJECT_ACCESS_ROLES,
  type ProjectOrgRole,
  type ProjectAccessRole,
} from "@/lib/db/types"
import {
  addExistingOrganizationToProject,
  createProject,
  createOrgAndAddToProject,
  assignUserToProject,
  removeProjectUser,
  updateProject,
} from "@/lib/actions/projects"
import type {
  OrgRow,
  ProjectRow,
  ProjectOrgRow,
  ProjectUserRow,
  MemberRow,
} from "@/lib/db/admin-console"

export function ProjectsAccessTab({
  supervisingOrg,
  projects,
  organizations,
  projectOrgs,
  projectUsers,
  members,
}: {
  supervisingOrg: { id: string; name: string }
  projects: ProjectRow[]
  organizations: OrgRow[]
  projectOrgs: ProjectOrgRow[]
  projectUsers: ProjectUserRow[]
  members: MemberRow[]
}) {
  const [projectId, setProjectId] = useState<string | undefined>(projects[0]?.id)
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)

  const project = projects.find((p) => p.id === projectId)
  const orgsOnProject = projectOrgs.filter((r) => r.projectId === projectId)
  const usersOnProject = projectUsers.filter((r) => r.projectId === projectId)
  const orgIdsOnProject = new Set(orgsOnProject.map((r) => r.organizationId))
  const availableOrgs = organizations.filter((o) => !orgIdsOnProject.has(o.id))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-sm font-medium">Project</Label>
          {projects.length > 0 ? (
            <Select value={projectId} onValueChange={(v) => setProjectId(v ?? undefined)}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select a project">
                  {(v) => projects.find((p) => p.id === v)?.name ?? "Select a project"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.code ? ` (${p.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {project && <EditProjectDialog key={project.id} project={project} />}
          <CreateProjectDialog supervisingOrg={supervisingOrg} />
        </div>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground text-pretty">
            No projects yet. Projects supervised by {supervisingOrg.name} will appear here.
          </CardContent>
        </Card>
      ) : (
        project && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-muted-foreground" />
                Participating organizations
              </CardTitle>
              <AddOrganizationDialog
                supervisingOrg={supervisingOrg}
                projectId={project.id}
                availableOrgs={availableOrgs}
                onInvite={setInviteResult}
              />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Project role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgsOnProject.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                        No organizations on this project yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {orgsOnProject.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.organizationName}</TableCell>
                      <TableCell>
                        <ProjectOrgRoleBadge role={r.projectRole} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCog className="size-4 text-muted-foreground" />
                People with access
              </CardTitle>
              <AssignUserDialog
                projectId={project.id}
                orgsOnProject={orgsOnProject}
                members={members}
                usersOnProject={usersOnProject}
              />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Access role</TableHead>
                    <TableHead className="text-end">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersOnProject.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No one has been granted access yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {usersOnProject.map((r) => (
                    <ProjectUserRowItem key={r.id} row={r} projectId={project.id} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
        )
      )}

      <InviteLinkDialog result={inviteResult} onClose={() => setInviteResult(null)} />
    </div>
  )
}

function CreateProjectDialog({
  supervisingOrg,
}: {
  supervisingOrg: { id: string; name: string }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [location, setLocation] = useState<ProjectLocationValue>(EMPTY_PROJECT_LOCATION)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setName("")
    setCode("")
    setLocation(EMPTY_PROJECT_LOCATION)
    setError(null)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await createProject({
        supervisingOrgId: supervisingOrg.id,
        name,
        code,
        location: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      reset()
      router.push("/projects")
      router.refresh()
    })
  }

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
          <Button>
            <Plus data-icon="inline-start" />
            New project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription className="text-pretty">
            Create a project under {supervisingOrg.name}. You can add participating organizations and grant access
            after the project is created.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              placeholder="e.g. Marina West Residences"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-code">Project code</Label>
            <Input
              id="project-code"
              placeholder="e.g. PRJ-009"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <ProjectLocationField
            id="project-location"
            value={location}
            onChange={setLocation}
            disabled={pending}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || name.trim().length < 2}>
            {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditProjectDialog({ project }: { project: ProjectRow }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(project.name)
  const [code, setCode] = useState(project.code ?? "")
  const [location, setLocation] = useState<ProjectLocationValue>({
    address: project.location ?? "",
    latitude: project.latitude,
    longitude: project.longitude,
    verified: project.latitude != null && project.longitude != null,
    source: project.latitude != null && project.longitude != null ? "map" : "manual",
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setName(project.name)
    setCode(project.code ?? "")
    setLocation({
      address: project.location ?? "",
      latitude: project.latitude,
      longitude: project.longitude,
      verified: project.latitude != null && project.longitude != null,
      source: project.latitude != null && project.longitude != null ? "map" : "manual",
    })
    setError(null)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await updateProject({
        projectId: project.id,
        name,
        code,
        location: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
    })
  }

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
          <Button variant="outline" className="bg-transparent">
            <Pencil data-icon="inline-start" />
            Edit project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update the project details and its precise map location.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`project-name-${project.id}`}>Project name</Label>
            <Input
              id={`project-name-${project.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`project-code-${project.id}`}>Project code</Label>
            <Input
              id={`project-code-${project.id}`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={pending}
            />
          </div>
          <ProjectLocationField
            id={`project-location-${project.id}`}
            value={location}
            onChange={setLocation}
            disabled={pending}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending || name.trim().length < 2}>
            {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddOrganizationDialog({
  supervisingOrg,
  projectId,
  availableOrgs,
  onInvite,
}: {
  supervisingOrg: { id: string; name: string }
  projectId: string
  availableOrgs: OrgRow[]
  onInvite: (r: InviteResult) => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"existing" | "new">("existing")
  const [orgId, setOrgId] = useState<string | undefined>()
  const [orgName, setOrgName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [projectRole, setProjectRole] = useState<ProjectOrgRole>("contractor")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setMode("existing")
    setOrgId(undefined)
    setOrgName("")
    setAdminEmail("")
    setProjectRole("contractor")
    setError(null)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      if (mode === "existing") {
        if (!orgId) {
          setError("Select an organization.")
          return
        }
        const res = await addExistingOrganizationToProject({ projectId, organizationId: orgId, projectRole })
        if (!res.ok) {
          setError(res.error)
          return
        }
        setOpen(false)
        reset()
      } else {
        const res = await createOrgAndAddToProject({
          supervisingOrgId: supervisingOrg.id,
          projectId,
          organizationName: orgName,
          projectRole,
          adminEmail,
        })
        if (!res.ok) {
          setError(res.error)
          return
        }
        setOpen(false)
        if (res.data) onInvite({ email: adminEmail, token: res.data.token, userExists: res.data.userExists })
        reset()
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus data-icon="inline-start" />
            Add organization
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an organization to the project</DialogTitle>
          <DialogDescription className="text-pretty">
            Add an existing organization, or create a new one and invite its admin to join.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "existing" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Existing
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "new" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            New + invite admin
          </button>
        </div>

        <div className="space-y-4">
          {mode === "existing" ? (
            <div className="space-y-2">
              <Label>Organization</Label>
              <Select value={orgId} onValueChange={(v) => setOrgId(v ?? undefined)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an organization">
                    {(v) => availableOrgs.find((o) => o.id === v)?.name ?? "Select an organization"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableOrgs.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No organizations available.</div>
                  )}
                  {availableOrgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-org-name">Organization name</Label>
                <Input
                  id="new-org-name"
                  placeholder="e.g. Skyline Steel"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Admin email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@company.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Project role</Label>
            <RoleSelect
              value={projectRole}
              onValueChange={(v) => setProjectRole(v as ProjectOrgRole)}
              roles={PROJECT_ORG_ROLES}
              className="w-full"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            {mode === "existing" ? "Add organization" : "Create & invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignUserDialog({
  projectId,
  orgsOnProject,
  members,
  usersOnProject,
}: {
  projectId: string
  orgsOnProject: ProjectOrgRow[]
  members: MemberRow[]
  usersOnProject: ProjectUserRow[]
}) {
  const [open, setOpen] = useState(false)
  const [orgId, setOrgId] = useState<string | undefined>(orgsOnProject[0]?.organizationId)
  const [userId, setUserId] = useState<string | undefined>()
  const [accessRole, setAccessRole] = useState<ProjectAccessRole>("contributor")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const assignedUserIds = useMemo(
    () => new Set(usersOnProject.filter((u) => u.organizationId === orgId).map((u) => u.userId)),
    [usersOnProject, orgId],
  )
  const orgMembers = members.filter((m) => m.organizationId === orgId && !assignedUserIds.has(m.userId))

  function submit() {
    setError(null)
    if (!orgId || !userId) {
      setError("Select an organization and a person.")
      return
    }
    startTransition(async () => {
      const res = await assignUserToProject({ projectId, organizationId: orgId, userId, accessRole })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      setUserId(undefined)
      setAccessRole("contributor")
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus data-icon="inline-start" />
            Grant access
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant project access</DialogTitle>
          <DialogDescription className="text-pretty">
            Assign an existing member of a participating organization to this project with an access role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Organization</Label>
            <Select
              value={orgId}
              onValueChange={(v) => {
                setOrgId(v ?? undefined)
                setUserId(undefined)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an organization">
                  {(v) => orgsOnProject.find((o) => o.organizationId === v)?.organizationName ?? "Select"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {orgsOnProject.map((o) => (
                  <SelectItem key={o.organizationId} value={o.organizationId}>
                    {o.organizationName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Person</Label>
            <Select value={userId} onValueChange={(v) => setUserId(v ?? undefined)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a person">
                  {(v) => orgMembers.find((m) => m.userId === v)?.userName ?? "Select a person"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {orgMembers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No unassigned members in this organization.
                  </div>
                )}
                {orgMembers.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.userName} — {m.userEmail}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Access role</Label>
            <RoleSelect
              value={accessRole}
              onValueChange={(v) => setAccessRole(v as ProjectAccessRole)}
              roles={PROJECT_ACCESS_ROLES}
              className="w-full"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            Grant access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProjectUserRowItem({ row, projectId }: { row: ProjectUserRow; projectId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function remove() {
    setError(null)
    startTransition(async () => {
      const res = await removeProjectUser({ projectId, membershipId: row.id })
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.userName}</div>
        <div className="text-xs text-muted-foreground">{row.userEmail}</div>
      </TableCell>
      <TableCell className="text-muted-foreground">{row.organizationName}</TableCell>
      <TableCell>
        <AccessRoleBadge role={row.accessRole} />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell className="text-end">
        <Button variant="ghost" size="sm" onClick={remove} disabled={pending} className="text-destructive">
          {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
          Remove
        </Button>
      </TableCell>
    </TableRow>
  )
}

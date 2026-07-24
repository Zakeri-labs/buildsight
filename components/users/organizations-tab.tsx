"use client"

import { useState, useTransition } from "react"
import { Building2, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
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
import { ToneBadge } from "@/components/status-badge"
import { OrgStatusBadge } from "@/components/users/role-badges"
import { createOrganization } from "@/lib/actions/organizations"
import type { OrgRow } from "@/lib/db/admin-console"

export function OrganizationsTab({
  supervisingOrg,
  organizations,
}: {
  supervisingOrg: { id: string; name: string }
  organizations: OrgRow[]
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await createOrganization({ supervisingOrgId: supervisingOrg.id, name })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      setName("")
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground text-pretty">
          Every organization on the platform. External organizations join specific projects with a project role.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus data-icon="inline-start" />
                New organization
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create an organization</DialogTitle>
              <DialogDescription className="text-pretty">
                Add an external organization (contractor, client, supplier, etc.). You can then add it to a project and
                invite its admin.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  placeholder="e.g. Atlas Contracting"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="bg-transparent">
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending || name.trim().length < 2}>
                {pending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
                Create
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
                <TableHead>Organization</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Building2 className="size-4" />
                      </span>
                      <span className="font-medium">{o.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {o.type === "supervising" ? (
                      <ToneBadge tone="primary">Supervising</ToneBadge>
                    ) : (
                      <ToneBadge tone="neutral">External</ToneBadge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.memberCount}</TableCell>
                  <TableCell>
                    <OrgStatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

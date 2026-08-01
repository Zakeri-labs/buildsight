"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, Globe2, Loader2, Mail, MapPin, Phone, Plus } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToneBadge } from "@/components/status-badge"
import { OrgStatusBadge } from "@/components/users/role-badges"
import { createOrganization } from "@/lib/actions/organizations"
import {
  ORGANIZATION_CATEGORIES,
  ORGANIZATION_CATEGORY_LABELS,
  organizationCategoryLabel,
  type OrganizationCategory,
} from "@/lib/db/types"
import type { OrgRow } from "@/lib/db/admin-console"

type OrganizationDraft = {
  name: string
  organizationCategory: OrganizationCategory | ""
  contactPerson: string
  email: string
  phone: string
  registrationNumber: string
  address: string
  postalCode: string
  website: string
}

const EMPTY_DRAFT: OrganizationDraft = {
  name: "",
  organizationCategory: "",
  contactPerson: "",
  email: "",
  phone: "",
  registrationNumber: "",
  address: "",
  postalCode: "",
  website: "",
}

export function OrganizationsTab({
  supervisingOrg,
  organizations,
}: {
  supervisingOrg: { id: string; name: string }
  organizations: OrgRow[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<OrganizationDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function update<K extends keyof OrganizationDraft>(field: K, value: OrganizationDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }))
    setError(null)
  }

  function reset() {
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen && !pending) reset()
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      if (!draft.organizationCategory) {
        setError("Select an organization type.")
        return
      }

      const res = await createOrganization({
        supervisingOrgId: supervisingOrg.id,
        name: draft.name,
        organizationCategory: draft.organizationCategory,
        contactPerson: draft.contactPerson,
        email: draft.email,
        phone: draft.phone,
        registrationNumber: draft.registrationNumber,
        address: draft.address,
        postalCode: draft.postalCode,
        website: draft.website,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  const canSubmit = draft.name.trim().length >= 2 && Boolean(draft.organizationCategory)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground text-pretty">
          Every organization on the platform. External organizations join specific projects with a project role.
        </p>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button>
                <Plus data-icon="inline-start" />
                New organization
              </Button>
            }
          />
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create an organization</DialogTitle>
              <DialogDescription className="text-pretty">
                Add a reusable contractor, client, supplier, consultant, or external company profile.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name *</Label>
                  <Input
                    id="org-name"
                    placeholder="e.g. Atlas Contracting"
                    value={draft.name}
                    onChange={(event) => update("name", event.target.value)}
                    disabled={pending}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Organization Type *</Label>
                  <Select
                    value={draft.organizationCategory || null}
                    onValueChange={(value) => update("organizationCategory", (value as OrganizationCategory | null) ?? "")}
                    disabled={pending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select organization type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ORGANIZATION_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {ORGANIZATION_CATEGORY_LABELS[category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <section className="space-y-3 rounded-xl border bg-muted/15 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Contact Information</h3>
                  <p className="text-xs text-muted-foreground">Primary company contact details.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="org-contact-person">Contact Person</Label>
                    <Input
                      id="org-contact-person"
                      value={draft.contactPerson}
                      onChange={(event) => update("contactPerson", event.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-email" className="flex items-center gap-1.5">
                      <Mail className="size-3.5 text-muted-foreground" />
                      Email
                    </Label>
                    <Input
                      id="org-email"
                      type="email"
                      value={draft.email}
                      onChange={(event) => update("email", event.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="org-phone" className="flex items-center gap-1.5">
                      <Phone className="size-3.5 text-muted-foreground" />
                      Phone Number
                    </Label>
                    <Input
                      id="org-phone"
                      type="tel"
                      value={draft.phone}
                      onChange={(event) => update("phone", event.target.value)}
                      disabled={pending}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border bg-muted/15 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Company Information</h3>
                  <p className="text-xs text-muted-foreground">Reusable legal and address information.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="org-registration">Registration / CR Number</Label>
                    <Input
                      id="org-registration"
                      value={draft.registrationNumber}
                      onChange={(event) => update("registrationNumber", event.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-postal-code">Postal Code</Label>
                    <Input
                      id="org-postal-code"
                      value={draft.postalCode}
                      onChange={(event) => update("postalCode", event.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="org-address" className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      Address
                    </Label>
                    <Input
                      id="org-address"
                      value={draft.address}
                      onChange={(event) => update("address", event.target.value)}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="org-website" className="flex items-center gap-1.5">
                      <Globe2 className="size-3.5 text-muted-foreground" />
                      Website <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="org-website"
                      value={draft.website}
                      onChange={(event) => update("website", event.target.value)}
                      placeholder="https://example.com"
                      disabled={pending}
                    />
                  </div>
                </div>
              </section>

              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                New organizations are created as Pending and must follow the existing approval workflow.
              </p>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending} className="bg-transparent">
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending || !canSubmit}>
                {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
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
                <TableHead>Contact</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((organization) => (
                <TableRow key={organization.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Building2 className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{organization.name}</p>
                        {organization.registrationNumber ? (
                          <p className="truncate text-xs text-muted-foreground">CR: {organization.registrationNumber}</p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {organization.type === "supervising" ? (
                      <ToneBadge tone="primary">Supervising</ToneBadge>
                    ) : (
                      <ToneBadge tone="neutral">{organizationCategoryLabel(organization.organizationCategory)}</ToneBadge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-56 text-sm">
                      <p className="truncate">{organization.contactPerson || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {organization.email || organization.phone || "No contact details"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{organization.memberCount}</TableCell>
                  <TableCell>
                    <OrgStatusBadge status={organization.status} />
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

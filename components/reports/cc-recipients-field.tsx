"use client"

import { useMemo, useState } from "react"
import { Building2, Check, Mail, Plus, Search, Trash2, UserRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"
import type {
  ExternalCcRecipientInput,
  ProjectCcCandidate,
  ReportCcSelection,
} from "@/lib/report-cc/types"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

export function CcRecipientsField({
  title = "CC Recipients (Optional)",
  description = "Notify selected project members and email external contacts.",
  candidates,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  title?: string
  description?: string
  candidates: ProjectCcCandidate[]
  value: ReportCcSelection
  onChange: (value: ReportCcSelection) => void
  disabled?: boolean
  compact?: boolean
}) {
  const [query, setQuery] = useState("")
  const selected = useMemo(() => new Set(value.internalUserIds), [value.internalUserIds])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return candidates
    return candidates.filter((candidate) => [candidate.name, candidate.email ?? "", candidate.role, candidate.organizationName ?? ""]
      .some((field) => field.toLowerCase().includes(needle)))
  }, [candidates, query])

  function toggleInternal(userId: string) {
    if (disabled) return
    const next = selected.has(userId)
      ? value.internalUserIds.filter((id) => id !== userId)
      : [...value.internalUserIds, userId]
    onChange({ ...value, internalUserIds: next })
  }

  function addExternal() {
    if (disabled) return
    onChange({
      ...value,
      externalRecipients: [
        ...value.externalRecipients,
        { clientId: crypto.randomUUID(), name: "", email: "", company: "", role: "" },
      ],
    })
  }

  function updateExternal(clientId: string, patch: Partial<ExternalCcRecipientInput>) {
    onChange({
      ...value,
      externalRecipients: value.externalRecipients.map((recipient) => recipient.clientId === clientId ? { ...recipient, ...patch } : recipient),
    })
  }

  function removeExternal(clientId: string) {
    onChange({ ...value, externalRecipients: value.externalRecipients.filter((recipient) => recipient.clientId !== clientId) })
  }

  return (
    <Card className={cn("gap-0 py-0", compact && "shadow-none")}>
      <CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-blue-950 dark:text-blue-100">
              <Mail className="size-4 text-primary" />{title}
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {value.internalUserIds.length + value.externalRecipients.length} selected
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Internal Project Members</p>
              <p className="text-xs text-muted-foreground">Only active users who already have project access are available.</p>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project members..." className="ps-9" disabled={disabled} />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border bg-muted/10 p-1">
            {filtered.length ? filtered.map((candidate) => {
              const checked = selected.has(candidate.id)
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => toggleInternal(candidate.id)}
                  disabled={disabled}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-muted disabled:cursor-default",
                    checked && "bg-primary/7",
                  )}
                >
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
                    {checked ? <Check className="size-3.5" /> : null}
                  </span>
                  <Avatar size="sm">
                    {candidate.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(candidate.avatarUrl)} alt="" /> : null}
                    <AvatarFallback>{initials(candidate.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{candidate.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {candidate.role}{candidate.organizationName ? ` · ${candidate.organizationName}` : ""}{candidate.email ? ` · ${candidate.email}` : ""}
                    </span>
                  </span>
                </button>
              )
            }) : <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching project members.</p>}
          </div>
        </section>

        <section className="space-y-3 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">External Recipients</p>
              <p className="text-xs text-muted-foreground">External contacts receive email only and are not granted platform access.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addExternal} disabled={disabled}>
              <Plus className="size-4" />Add External Recipient
            </Button>
          </div>

          {value.externalRecipients.length ? (
            <div className="space-y-3">
              {value.externalRecipients.map((recipient, index) => (
                <div key={recipient.clientId} className="rounded-xl border bg-muted/10 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4 text-primary" />External Recipient {index + 1}</div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeExternal(recipient.clientId)} disabled={disabled} aria-label={`Remove external recipient ${index + 1}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Name *</Label><Input value={recipient.name} onChange={(event) => updateExternal(recipient.clientId, { name: event.target.value })} maxLength={250} disabled={disabled} /></div>
                    <div className="space-y-2"><Label>Email *</Label><Input type="email" value={recipient.email} onChange={(event) => updateExternal(recipient.clientId, { email: event.target.value })} maxLength={320} disabled={disabled} /></div>
                    <div className="space-y-2"><Label>Company</Label><div className="relative"><Building2 className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={recipient.company} onChange={(event) => updateExternal(recipient.clientId, { company: event.target.value })} maxLength={250} className="ps-9" disabled={disabled} /></div></div>
                    <div className="space-y-2"><Label>Role</Label><Input value={recipient.role} onChange={(event) => updateExternal(recipient.clientId, { role: event.target.value })} placeholder="Owner Representative, External Consultant..." maxLength={200} disabled={disabled} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">No external recipients added.</p>}
        </section>
      </CardContent>
    </Card>
  )
}

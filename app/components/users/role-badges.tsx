"use client"

import { ToneBadge } from "@/components/status-badge"
import { roleLabel } from "@/lib/db/types"

const orgStatusTone: Record<string, "success" | "warning" | "neutral" | "info" | "danger"> = {
  active: "success",
  invited: "info",
  pending: "warning",
  suspended: "danger",
}

const inviteStatusTone: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  accepted: "success",
  pending: "warning",
  expired: "neutral",
  revoked: "danger",
}

export function OrgStatusBadge({ status }: { status: string }) {
  return <ToneBadge tone={orgStatusTone[status] ?? "neutral"} className="capitalize">{status}</ToneBadge>
}

export function InviteStatusBadge({ status }: { status: string }) {
  return <ToneBadge tone={inviteStatusTone[status] ?? "neutral"} className="capitalize">{status}</ToneBadge>
}

export function OrgRoleBadge({ role }: { role: string }) {
  return <ToneBadge tone="primary">{roleLabel(role)}</ToneBadge>
}

export function ProjectOrgRoleBadge({ role }: { role: string }) {
  return <ToneBadge tone="accent">{roleLabel(role)}</ToneBadge>
}

export function AccessRoleBadge({ role }: { role: string }) {
  return <ToneBadge tone="info">{roleLabel(role)}</ToneBadge>
}

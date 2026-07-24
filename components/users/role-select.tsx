"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { roleLabel } from "@/lib/db/types"

export function RoleSelect({
  value,
  onValueChange,
  roles,
  placeholder = "Select a role",
  disabled,
  className,
}: {
  value?: string
  onValueChange: (value: string) => void
  roles: readonly string[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => v != null && onValueChange(v as string)} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>{(v) => (v ? roleLabel(v as string) : placeholder)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {roleLabel(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

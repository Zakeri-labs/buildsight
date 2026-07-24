import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function Logo({
  showText = true,
  className,
  textClassName,
}: {
  showText?: boolean
  className?: string
  textClassName?: string
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Building2 className="size-5" />
      </span>
      {showText && (
        <span className={cn("text-lg font-bold leading-tight tracking-tight text-sidebar-foreground", textClassName)}>
          Provision
        </span>
      )}
    </div>
  )
}

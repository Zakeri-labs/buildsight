import { Landmark } from "lucide-react"
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
    <div className={cn("flex items-center gap-3", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/30">
        <Landmark className="size-6" strokeWidth={2} />
      </span>
      {showText && (
        <span
          className={cn(
            "flex flex-col text-sidebar-foreground",
            textClassName,
          )}
        >
          <span className="text-sm font-bold uppercase leading-none tracking-wide">Provision</span>
          <span className="text-sm font-bold uppercase leading-tight tracking-wide">Consultancy</span>
        </span>
      )}
    </div>
  )
}

import { cn } from "@/lib/utils"

export function Logo({
  showText = true,
  className,
  textClassName,
  variant = "white",
}: {
  showText?: boolean
  className?: string
  textClassName?: string
  variant?: "white" | "dark"
}) {
  const logoSrc = variant === "dark" ? "/LogoB.png" : "/Logow.png"

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src={logoSrc}
        alt="Provision Consultancy Logo"
        className="h-10 w-auto max-w-[190px] object-contain"
      />
    </div>
  )
}


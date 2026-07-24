import type { ReactNode } from "react"
import { Logo } from "@/components/logo"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo textClassName="text-foreground" />
        </div>
        {children}
      </div>
    </main>
  )
}

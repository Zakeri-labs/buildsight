import type { ReactNode } from "react"
import { Logo } from "@/components/logo"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 flex">
      {/* Left split hero section (desktop) */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white">
        {/* Background image overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/auth_hero_bg.png"
            alt="Engineering Site Supervision"
            className="size-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-900/30" />
          <div className="absolute inset-0 bg-blue-950/20 backdrop-blur-[1px]" />
        </div>

        {/* Top Logo */}
        <div className="relative z-10">
          <Logo variant="dark" className="h-12 w-auto brightness-0 invert" />
        </div>

        {/* Hero Copy */}
        <div className="relative z-10 max-w-lg space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-300 backdrop-blur-md">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            Provision Workspace
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl leading-tight">
            Engineering Excellence & Site Supervision Platform
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Collaborate seamlessly across projects, stages, site visits, and automated multilingual inspection reports with enterprise-grade security.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} Provision Consultancy. All rights reserved.</p>
          <div className="flex items-center gap-3">
            <span className="rounded bg-white/10 px-2 py-0.5 font-medium text-slate-200">ISO 9001 Certified</span>
          </div>
        </div>
      </div>

      {/* Right form container */}
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          {children}
        </div>
      </div>
    </main>
  )
}

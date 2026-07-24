import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { DonutChart } from "@/components/dashboard/donut-chart"
import type { StatusSlice } from "@/lib/portfolio-data"

export function StatusDonutCard({
  title,
  slices,
  href,
  linkLabel,
}: {
  title: string
  slices: StatusSlice[]
  href: string
  linkLabel: string
}) {
  const total = slices.reduce((acc, s) => acc + s.value, 0)

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>

      <div className="mt-4 flex flex-1 items-center gap-5">
        <DonutChart
          size={150}
          strokeWidth={18}
          segments={slices.map((s) => ({ value: s.value, color: s.color }))}
          total={total}
          centerTop={<span className="text-3xl font-bold text-foreground">{total}</span>}
          centerBottom={<span className="text-xs text-muted-foreground">Total</span>}
        />

        <ul className="flex flex-1 flex-col gap-2.5">
          {slices.map((s) => {
            const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"
            return (
              <li key={s.label} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="flex-1 text-muted-foreground">{s.label}</span>
                <span className="font-semibold text-foreground">{s.value}</span>
                <span className="w-14 text-end text-xs text-muted-foreground">{`(${pct}%)`}</span>
              </li>
            )
          })}
        </ul>
      </div>

      <Link
        href={href}
        className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        {linkLabel}
        <ChevronRight className="size-4 flip-rtl" />
      </Link>
    </div>
  )
}

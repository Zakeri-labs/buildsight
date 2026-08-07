function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />
}

export default function MemberHomepageLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 overflow-hidden" aria-label="Loading Member dashboard">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <Skeleton className="h-[5.5rem]" />
        <Skeleton className="h-[5.5rem]" />
        <Skeleton className="h-[5.5rem]" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}

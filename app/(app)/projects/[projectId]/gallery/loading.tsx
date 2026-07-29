import { Card, CardContent } from "@/components/ui/card"

export default function ProjectGalleryLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl animate-pulse flex-col gap-5" aria-busy="true" aria-label="Loading project gallery">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="h-3 w-56 rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Card key={index} className="gap-0 overflow-hidden py-0">
            <div className="aspect-[4/3] bg-muted" />
            <CardContent className="h-12 border-t p-3" />
          </Card>
        ))}
      </div>
    </div>
  )
}

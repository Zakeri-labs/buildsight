"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ImageIcon } from "lucide-react"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"
import { cn } from "@/lib/utils"

export function ProjectImageDisplay({
  src,
  alt,
  className,
  imageClassName,
  children,
  iconClassName,
  projectId,
}: {
  src: string | null | undefined
  alt: string
  className?: string
  imageClassName?: string
  children?: ReactNode
  iconClassName?: string
  projectId?: string
}) {
  const resolved = projectImageDisplayUrl(src, projectId)
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [resolved])

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && projectId) {
      console.debug("[project-image-debug]", {
        project: { id: projectId, name: alt, imageUrl: resolved },
      })
    }
  }, [alt, projectId, resolved])

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {resolved && !failed ? (
        // Authenticated Storage proxy URLs and local previews are handled by the browser.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={resolved}
          src={resolved}
          alt={alt}
          className={cn("absolute inset-0 size-full object-cover", imageClassName)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground" aria-label={`${alt} placeholder`}>
          <ImageIcon className={cn("size-8", iconClassName)} />
        </div>
      )}
      {children}
    </div>
  )
}

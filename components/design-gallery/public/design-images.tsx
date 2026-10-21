"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import type { DesignImage } from "@/lib/design-gallery/types"

export function DesignImages({
  images,
  alt,
  imageLabel,
}: {
  images: DesignImage[]
  alt: string
  /** e.g. "Image {index} of {total}" */
  imageLabel: string
}) {
  const [active, setActive] = useState(0)
  const current = images[active] ?? images[0]
  if (!current) return null
  const label = (index: number) => imageLabel.replace("{index}", String(index + 1)).replace("{total}", String(images.length))

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.url} alt={alt} className="absolute inset-0 size-full object-cover" fetchPriority="high" />
      </div>
      {images.length > 1 ? (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={label(index)}
                aria-current={index === active ? "true" : undefined}
                className={cn(
                  "relative block aspect-[4/3] w-full overflow-hidden rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gallery-accent)]",
                  index === active ? "border-[var(--gallery-accent)]" : "border-transparent opacity-80 hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

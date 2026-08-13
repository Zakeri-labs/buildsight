import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function capitalizeWords(str: string | null | undefined): string {
  if (!str) return ''
  return str.replace(/\b[a-z]/g, (char) => char.toUpperCase())
}

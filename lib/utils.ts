import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `£${(value / 1_000_000_000).toFixed(2)}B`
  }
  if (value >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `£${(value / 1_000).toFixed(2)}K`
  }
  return `£${value.toFixed(0)}`
}

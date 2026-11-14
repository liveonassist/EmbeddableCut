// SPDX-License-Identifier: MIT

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names and resolves Tailwind conflicts, as the React app's `cn` does. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

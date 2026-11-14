// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'

export interface WindowPortalProps {
  /** Content rendered inside the external window */
  children: Snippet
  /** Window title */
  title: string
  /** Window width (inner/content-area pixels) */
  width?: number
  /** Window height (inner/content-area pixels) */
  height?: number
  /** localStorage key for persisting window position */
  storageKey?: string
  /** Reuse an already-opened window (useful for pop-out actions initiated by a click) */
  externalWindow?: Window | null
  /** Called when opening a fresh external window is blocked */
  onBlocked?: () => void
  /** When true, window height fits content after first render */
  autoHeight?: boolean
  /** Called when the external window is closed by the user */
  onClose: () => void
}

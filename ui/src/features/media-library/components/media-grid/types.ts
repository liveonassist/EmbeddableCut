// SPDX-License-Identifier: MIT

import type { MediaMetadata } from '@/types/storage'

export interface MediaGridProps {
  onMediaSelect?: (mediaId: string) => void
  /** Grid item size (1 = largest, 5 = smallest) */
  itemSize?: number
  /** When provided, renders these items instead of pulling from the store */
  items?: MediaMetadata[]
  /**
   * Whether the host lets the editor import local files (its media source policy).
   * When false, the empty state offers no file picker.
   */
  localImport?: boolean
  /** Opens adding media by URL; the empty state offers it when local import is off. */
  onAddFromUrl?: () => void
}

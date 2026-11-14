// SPDX-License-Identifier: MIT

import type { TimelineGhostPreviewType } from '@/features/timeline/utils/drag-drop-preview'

export { default as TimelineDropGhostPreviews } from './timeline-drop-ghost-previews.svelte'

export interface TimelineDropGhostPreview {
  left: number
  width: number
  label: string
  type: TimelineGhostPreviewType
}

/** What `bind:this` on `TimelineDropGhostPreviews` exposes (React's imperative handle). */
export interface TimelineDropGhostPreviewsHandle {
  sync: (ghostPreviews: TimelineDropGhostPreview[]) => void
  clear: () => void
}

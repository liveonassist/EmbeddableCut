// SPDX-License-Identifier: MIT

import type { TimelineItem } from '@/types/timeline'

export interface VideoPreviewProps {
  project: {
    width: number
    height: number
    backgroundColor?: string
  }
  containerSize: {
    width: number
    height: number
  }
  suspendOverlay?: boolean
  chrome?: PreviewOverlayChrome
}

export type PreviewOverlayChrome = 'edit' | 'color'

export interface PreviewItemsSnapshot {
  items: TimelineItem[]
  itemsByTrackId: Record<string, TimelineItem[]>
}

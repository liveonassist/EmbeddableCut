// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import type { MotionPickWhipPresentation } from '@/shared/hooks/use-pick-whip-drag.svelte'

export interface PropertyLinkDragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  sourceItemId: string | null
  clipBounds: {
    left: number
    top: number
    right: number
    bottom: number
  }
  presentation: MotionPickWhipPresentation
}

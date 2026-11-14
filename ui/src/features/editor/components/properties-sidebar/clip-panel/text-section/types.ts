// SPDX-License-Identifier: MIT

import type { TimelineItem } from '@/types/timeline'
import type { CanvasSettings } from '@/types/transform'

export interface TextSectionProps {
  items: TimelineItem[]
  canvas: CanvasSettings
}

export type TextSectionSlot = 'content' | 'effects' | 'animation'

export interface TextSectionComposerProps extends TextSectionProps {
  slots: TextSectionSlot[]
}

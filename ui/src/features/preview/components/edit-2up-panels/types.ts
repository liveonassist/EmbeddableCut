// SPDX-License-Identifier: MIT

import type { TimelineItem } from '@/types/timeline'

export interface EditTwoUpPanelData {
  item: TimelineItem | null
  sourceTime?: number
  sourceFrame?: number
  timecode: string
  label: string
  placeholderText?: string
}

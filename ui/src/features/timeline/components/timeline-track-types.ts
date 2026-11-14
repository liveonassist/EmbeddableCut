// SPDX-License-Identifier: MIT

import type { LazyContextMenuEventInit } from '@/features/timeline/utils/lazy-context-menu'

export interface TrackGapContextMenuRequest {
  frame: number
  pointer: LazyContextMenuEventInit
  token: number
}

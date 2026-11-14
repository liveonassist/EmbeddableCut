// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'

export interface TrackRowFrameProps {
  children?: Snippet
  class?: string
  onResizeMouseDown?: (event: MouseEvent) => void
  onResizeDoubleClick?: (event: MouseEvent) => void
  resizeHandleLabel?: string
  resizeHandlePosition?: 'top' | 'bottom'
}

export interface TrackRowFrameBaseProps extends TrackRowFrameProps {
  dividers: 'bottom' | 'top-and-bottom'
}

export interface TrackSectionDividerProps {
  class?: string
  onMouseDown?: (event: MouseEvent) => void
}

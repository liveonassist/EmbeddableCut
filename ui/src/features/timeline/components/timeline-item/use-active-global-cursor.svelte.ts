// SPDX-License-Identifier: MIT

import { addGlobalCursorClass, removeGlobalCursorClass } from '@/shared/ui/global-cursor-roots'

const ACTIVE_CURSOR_CLASSES = [
  'timeline-cursor-trim-left',
  'timeline-cursor-trim-right',
  'timeline-cursor-ripple-left',
  'timeline-cursor-ripple-right',
  'timeline-cursor-trim-center',
  'timeline-cursor-slip-smart',
  'timeline-cursor-slide-smart',
  'timeline-cursor-gauge',
  'timeline-cursor-track-push',
] as const

export interface ActiveGlobalCursorInput {
  isTrimming: boolean
  trimHandle: 'start' | 'end' | null
  isRollingEdit: boolean
  isRippleEdit: boolean
  isStretching: boolean
  isSlipSlideActive: boolean
  slipSlideMode: 'slip' | 'slide' | null
  isTrackPushActive: boolean
}

function resolveActiveGlobalCursorClass({
  isTrimming,
  trimHandle,
  isRollingEdit,
  isRippleEdit,
  isStretching,
  isSlipSlideActive,
  slipSlideMode,
  isTrackPushActive,
}: ActiveGlobalCursorInput): string | null {
  if (isTrimming) {
    if (trimHandle === 'start') {
      return isRollingEdit
        ? 'timeline-cursor-trim-center'
        : isRippleEdit
          ? 'timeline-cursor-ripple-left'
          : 'timeline-cursor-trim-left'
    }
    if (trimHandle === 'end') {
      return isRollingEdit
        ? 'timeline-cursor-trim-center'
        : isRippleEdit
          ? 'timeline-cursor-ripple-right'
          : 'timeline-cursor-trim-right'
    }
  }

  if (isStretching) {
    return 'timeline-cursor-gauge'
  }

  if (isSlipSlideActive) {
    return slipSlideMode === 'slide' ? 'timeline-cursor-slide-smart' : 'timeline-cursor-slip-smart'
  }

  if (isTrackPushActive) {
    return 'timeline-cursor-track-push'
  }

  return null
}

/**
 * Applies a document-wide cursor class while a clip gesture (trim/roll/ripple/
 * stretch/slip/slide/track-push) is active, so the cursor stays consistent even
 * when the pointer leaves the clip during the drag. Clears on gesture end and
 * unmount. Side-effecting only — returns nothing.
 */
export function useActiveGlobalCursor(input: () => ActiveGlobalCursorInput): void {
  const activeGlobalCursorClass = $derived(resolveActiveGlobalCursorClass(input()))

  $effect(() => {
    removeGlobalCursorClass(...ACTIVE_CURSOR_CLASSES)
    if (activeGlobalCursorClass) {
      addGlobalCursorClass(activeGlobalCursorClass)
    }

    return () => {
      removeGlobalCursorClass(...ACTIVE_CURSOR_CLASSES)
    }
  })
}

// SPDX-License-Identifier: MIT

import { captureContextMenuEventInit } from '@/features/timeline/utils/lazy-context-menu'

/**
 * Hands a right-click on a track section's empty space (the drop zones above
 * the top track and below the bottom one) to the nearest track row, so it
 * opens that track's menu at the same time position instead of the browser's.
 */
export function forwardContextMenuToNearestTrack(
  event: MouseEvent & { currentTarget: EventTarget & HTMLElement },
): void {
  const target = event.target
  if (!(target instanceof Node)) return
  const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-track-id]'))
  // Whatever sits in a row's frame handles its own right-clicks, including the
  // contextmenu events the lazily mounted menus beside a track replay to open.
  if (rows.some((row) => row.parentElement?.contains(target))) return

  let nearest: HTMLElement | null = null
  let nearestDistance = Infinity
  for (const row of rows) {
    const { top, bottom } = row.getBoundingClientRect()
    const distance = Math.max(top - event.clientY, event.clientY - bottom, 0)
    if (distance < nearestDistance) {
      nearest = row
      nearestDistance = distance
    }
  }
  if (!nearest) return

  const forwarded = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    ...captureContextMenuEventInit(event),
  })
  if (!nearest.dispatchEvent(forwarded)) event.preventDefault()
}

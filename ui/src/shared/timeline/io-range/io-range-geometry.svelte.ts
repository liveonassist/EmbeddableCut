// SPDX-License-Identifier: MIT

import type { Attachment } from 'svelte/attachments'

/**
 * Geometry + shared constants for the in/out (IO) range markers, kept apart
 * from the marker components.
 */

export const IO_HANDLE_WIDTH = 6
export const IO_HANDLE_COLOR = 'var(--color-timeline-io-handle)'

/**
 * Grip width that avoids the "solid blue block" artifact: when the in/out range
 * collapses to a few pixels wide the two fixed-width side grips would overlap and
 * cover the range bar. Cap each grip to half the range so they meet at the
 * midpoint (a clean pill spanning exactly the range) instead of overlapping.
 * `spanPx === null` (only one point set) renders a full-width grip.
 */
export function computeIoGripWidth(spanPx: number | null, nominal = IO_HANDLE_WIDTH): number {
  if (spanPx === null) return nominal
  return Math.max(0, Math.min(nominal, spanPx / 2))
}

/**
 * Tracks an element's live pixel width (for callers that position via `%`).
 *
 * Attach the returned `measureRef` to the element (`{@attach measured.measureRef}`):
 * it runs whenever the element mounts and cleans up when it unmounts, which
 * handles conditionally-rendered targets (e.g. the source monitor's IO strip,
 * which only mounts once an in/out point exists). It measures as soon as the
 * element is attached, so there's no first-frame zero-width flash. Pass `ref`
 * to also receive the node for imperative reads (e.g. `getBoundingClientRect`).
 * Read `width` off the returned object (don't destructure it).
 */
export function useMeasuredWidth<T extends HTMLElement>(ref?: {
  current: T | null
}): {
  readonly width: number
  measureRef: Attachment<T>
} {
  let width = $state(0)

  const measureRef: Attachment<T> = (node) => {
    if (ref) ref.current = node
    const update = () => {
      width = node.clientWidth
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => {
      observer.disconnect()
      if (ref && ref.current === node) ref.current = null
    }
  }

  return {
    get width() {
      return width
    },
    measureRef,
  }
}

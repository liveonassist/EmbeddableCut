// SPDX-License-Identifier: MIT

/**
 * Showing the whole timeline on request from outside its component. The
 * timeline fits itself, knowing its own width; a request made before it's
 * laid out (a host building a project in a hidden editor) waits until it is.
 */

/** Fits the timeline; false while it has no width to fit to. */
type ZoomToFitHandler = () => boolean

let handler: ZoomToFitHandler | null = null
let pending = false

export function registerZoomToFit(next: ZoomToFitHandler | null): void {
  handler = next
}

export function requestZoomToFit(): void {
  pending = true
  runPendingZoomToFit()
}

/** Called by the timeline whenever it may have become able to fit. */
export function runPendingZoomToFit(): void {
  if (pending && handler?.()) pending = false
}

/** Forgets a request nothing has answered, when its project or editor goes away. */
export function cancelZoomToFit(): void {
  pending = false
}

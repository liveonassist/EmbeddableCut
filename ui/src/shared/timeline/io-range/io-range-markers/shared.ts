// SPDX-License-Identifier: MIT

/**
 * Extra `data-*` attributes for the positioned element. The Motion timeline uses
 * these to drive the strip/handles imperatively during a zoom or pan gesture,
 * before the component updates with the settled viewport.
 */
export type PositionDataset = Record<`data-${string}`, string>

// Block the compatibility mousedown so mouse-driven scrub surfaces underneath
// (Edit ruler, source-monitor seek bar) don't also seek when a marker is
// grabbed. The real drag runs on pointerdown; pointer-driven scrub surfaces
// (mini-timeline) are stopped by the drag handler's own stopPropagation.
export function blockMouseDown(e: { preventDefault: () => void; stopPropagation: () => void }) {
  e.preventDefault()
  e.stopPropagation()
}

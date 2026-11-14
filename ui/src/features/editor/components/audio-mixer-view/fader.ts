// SPDX-License-Identifier: MIT

// ---------------------------------------------------------------------------
// dB <-> fader mapping
// ---------------------------------------------------------------------------

export const FADER_DB_MIN = -60
export const FADER_DB_MAX = 12
const FADER_DB_RANGE = FADER_DB_MAX - FADER_DB_MIN // 72
export const FADER_KNOB_HEIGHT_PX = 22
const FADER_KNOB_DRAG_TOLERANCE_PX = 14

export function dbToFaderPercent(db: number): number {
  if (!Number.isFinite(db)) return 83.33 // 0 dB default for NaN/Infinity
  const clamped = Math.max(FADER_DB_MIN, Math.min(FADER_DB_MAX, db))
  if (clamped <= FADER_DB_MIN) return 0
  if (clamped >= FADER_DB_MAX) return 100
  return ((clamped - FADER_DB_MIN) / FADER_DB_RANGE) * 100
}

export function faderPercentToDb(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent))
  return (clamped / 100) * FADER_DB_RANGE + FADER_DB_MIN
}

export function formatFaderDb(db: number): string {
  if (!Number.isFinite(db)) return '+0.0'
  if (db <= FADER_DB_MIN) return '-inf'
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`
}

/** dB readout color: green at unity, amber when boosted, dim when cut */
export function faderDbColor(db: number): string {
  return db > 0.05
    ? 'text-amber-400/90'
    : db > -0.05
      ? 'text-emerald-400/80'
      : 'text-muted-foreground/60'
}

export function percentFromPointerEvent(el: HTMLElement | null, e: PointerEvent): number {
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  if (rect.height <= 0) return 0
  const y = Math.max(0, Math.min(rect.height, rect.bottom - e.clientY))
  return (y / rect.height) * 100
}

/**
 * Grabbing the knob keeps its offset from the pointer, so a drag never jumps
 * the value; a press elsewhere on the track jumps the knob to the pointer.
 */
export function dragOffsetPercentFromPointerEvent(
  el: HTMLElement | null,
  e: PointerEvent,
  currentDb: number,
): number {
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  if (rect.height <= 0) return 0
  const pointerYFromBottom = Math.max(0, Math.min(rect.height, rect.bottom - e.clientY))
  const currentPercent = dbToFaderPercent(currentDb)
  const knobCenterYFromBottom = (currentPercent / 100) * rect.height
  const pointerIsNearKnob =
    Math.abs(pointerYFromBottom - knobCenterYFromBottom) <=
    Math.max(FADER_KNOB_DRAG_TOLERANCE_PX, FADER_KNOB_HEIGHT_PX / 2)
  if (!pointerIsNearKnob) return 0
  return currentPercent - (pointerYFromBottom / rect.height) * 100
}

// ---------------------------------------------------------------------------
// Segmented LED meter (shared between channel strips & bus)
// ---------------------------------------------------------------------------

// Segment dimensions: 3px tall segments with 1px gaps = 4px pitch.
// CSS mask-image creates the segmented look over the existing gradient fill.
// This keeps the same animation system (height %) while adding the hardware feel.
export const SEGMENT_MASK =
  'repeating-linear-gradient(to top, black 0px, black 3px, transparent 3px, transparent 4px)'
export const UNLIT_LED_BG =
  'repeating-linear-gradient(to top, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 3px, transparent 3px, transparent 4px)'

export const FADER_SCALE_MARKS = [12, 6, 0, -6, -12, -20, -30, -40, -50, -60] as const

export function getMeterFallbackPercent(params: {
  unresolvedSourceCount: number
  resolvedSourceCount: number
  isPlaying: boolean
}): number {
  if (!params.isPlaying) {
    return 0
  }

  if (params.unresolvedSourceCount > 0 && params.resolvedSourceCount === 0) {
    return 18
  }

  return 0
}

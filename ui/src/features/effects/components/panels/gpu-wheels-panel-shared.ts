// SPDX-License-Identifier: MIT

/** Helpers gpu-wheels-panel.tsx keeps module-private, shared by its split-out Svelte parts. */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getParamDecimals(step: unknown): number {
  if (typeof step !== 'number') return 2
  if (step >= 1) return 0
  if (step >= 0.01) return 2
  return 3
}

export const PUCK_RADIUS_PX = 4
// Outer master ring (dock): a fill gauge like Resolve's. A bright metallic
// ring sits under a pure-black cover that is revealed clockwise from 12
// o'clock proportionally to the master value — fully black at the range
// minimum, the full ring at the maximum.
export const DOCK_RING_THICKNESS = 5
export const DOCK_RING_GAP = 3
export const DOCK_RING_INSET = DOCK_RING_THICKNESS + DOCK_RING_GAP
export const DOCK_RING_COVER_COLOR = '#060607'
export const DOCK_RING_METAL_GRADIENT =
  'linear-gradient(180deg, #8b8b92 0%, #e4e4e9 55%, #f8f8fa 100%)'

// Hue 0 sits on the +x axis to match getHueAmountFromClient's atan2 mapping.
const WHEEL_HUE_CONIC =
  'conic-gradient(from 90deg, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #5856d6, #ff2d55, #ff3b30)'
// Resolve-style disc: heavily dimmed hue field inside, saturated rim band.
export const DOCK_DISC_BACKGROUND = `radial-gradient(circle closest-side, rgba(19,19,22,0.94) 0%, rgba(19,19,22,0.9) 62%, rgba(19,19,22,0.72) 80%, rgba(19,19,22,0.25) 88%, transparent 94%), ${WHEEL_HUE_CONIC}`
export const SIDEBAR_DISC_BACKGROUND = `radial-gradient(circle at center, hsl(0 0% 18%) 0%, hsl(0 0% 10%) 26%, transparent 28%), ${WHEEL_HUE_CONIC}`

export function getHueAmountFromClient(
  clientX: number,
  clientY: number,
  element: HTMLButtonElement,
) {
  const rect = element.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = clientX - cx
  const dy = clientY - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  const trackRadius = Math.max(1, rect.width / 2 - PUCK_RADIUS_PX - 1)
  const amount = clamp(dist / trackRadius, 0, 1)
  const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
  return { hue, amount }
}

export function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360
}

const KEYBOARD_WHEEL_ACTIONS = {
  ArrowLeft: (hue: number, amount: number) => [hue - 1, amount],
  ArrowRight: (hue: number, amount: number) => [hue + 1, amount],
  ArrowDown: (hue: number, amount: number) => [hue, amount - 0.01],
  ArrowUp: (hue: number, amount: number) => [hue, amount + 0.01],
  Home: (hue: number) => [hue, 0],
  End: (hue: number) => [hue, 1],
} satisfies Record<string, (hue: number, amount: number) => [number, number]>

export function getKeyboardWheelTarget(
  key: string,
  hue: number,
  amount: number,
): [number, number] | null {
  return KEYBOARD_WHEEL_ACTIONS[key as keyof typeof KEYBOARD_WHEEL_ACTIONS]?.(hue, amount) ?? null
}

export const THUMB_WHEEL_CLASS =
  'mt-1 h-3 w-full cursor-ew-resize appearance-none rounded-full border border-black/80 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.22)_0_1px,rgba(0,0,0,0.65)_1px_5px)] shadow-inner disabled:cursor-not-allowed disabled:opacity-60 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-black/80 [&::-moz-range-thumb]:bg-zinc-200 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/80 [&::-webkit-slider-thumb]:bg-zinc-200'

export const SCRUB_THRESHOLD_PX = 3

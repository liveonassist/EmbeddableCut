// SPDX-License-Identifier: MIT
//
// Color math and pointer handling for HexColorPicker, ported from
// react-colorful 5.6.1 (https://github.com/omgovich/react-colorful).
// Copyright (c) 2020 Vlad Shilov <omgovich@ya.ru>. MIT License.

export interface HsvaColor {
  h: number
  s: number
  v: number
  a: number
}

interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

export interface Interaction {
  left: number
  top: number
}

export const clamp = (number: number, min = 0, max = 1): number =>
  number > max ? max : number < min ? min : number

export const round = (number: number, digits = 0, base = Math.pow(10, digits)): number =>
  Math.round(base * number) / base

function hexToRgba(hex: string): RgbaColor {
  if (hex[0] === '#') hex = hex.substring(1)

  if (hex.length < 6) {
    return {
      r: parseInt(hex[0]! + hex[0], 16),
      g: parseInt(hex[1]! + hex[1], 16),
      b: parseInt(hex[2]! + hex[2], 16),
      a: hex.length === 4 ? round(parseInt(hex[3]! + hex[3], 16) / 255, 2) : 1,
    }
  }

  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
    a: hex.length === 8 ? round(parseInt(hex.substring(6, 8), 16) / 255, 2) : 1,
  }
}

function rgbaToHsva({ r, g, b, a }: RgbaColor): HsvaColor {
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)

  const hh = delta
    ? max === r
      ? (g - b) / delta
      : max === g
        ? 2 + (b - r) / delta
        : 4 + (r - g) / delta
    : 0

  return {
    h: round(60 * (hh < 0 ? hh + 6 : hh)),
    s: round(max ? (delta / max) * 100 : 0),
    v: round((max / 255) * 100),
    a,
  }
}

function hsvaToRgba({ h, s, v, a }: HsvaColor): RgbaColor {
  h = (h / 360) * 6
  s = s / 100
  v = v / 100

  const hh = Math.floor(h)
  const b = v * (1 - s)
  const c = v * (1 - (h - hh) * s)
  const d = v * (1 - (1 - h + hh) * s)
  const module = hh % 6

  return {
    r: round([v, c, b, b, d, v][module]! * 255),
    g: round([d, v, v, c, b, b][module]! * 255),
    b: round([b, b, d, v, v, c][module]! * 255),
    a: round(a, 2),
  }
}

function hsvaToHsla({ h, s, v, a }: HsvaColor) {
  const hh = ((200 - s) * v) / 100

  return {
    h: round(h),
    s: round(hh > 0 && hh < 200 ? ((s * v) / 100 / (hh <= 100 ? hh : 200 - hh)) * 100 : 0),
    l: round(hh / 2),
    a: round(a, 2),
  }
}

export function hsvaToHslString(hsva: HsvaColor): string {
  const { h, s, l } = hsvaToHsla(hsva)
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function hsvaToHslaString(hsva: HsvaColor): string {
  const { h, s, l, a } = hsvaToHsla(hsva)
  return `hsla(${h}, ${s}%, ${l}%, ${a})`
}

const format = (number: number) => {
  const hex = number.toString(16)
  return hex.length < 2 ? '0' + hex : hex
}

function rgbaToHex({ r, g, b, a }: RgbaColor): string {
  const alphaHex = a < 1 ? format(round(a * 255)) : ''
  return '#' + format(r) + format(g) + format(b) + alphaHex
}

export const hexToHsva = (hex: string): HsvaColor => rgbaToHsva(hexToRgba(hex))

/** `HexAlphaColorPicker`'s output keeps alpha; `HexColorPicker`'s drops it. */
export const hsvaToHex = (hsva: HsvaColor, alpha: boolean): string =>
  rgbaToHex(hsvaToRgba(alpha ? hsva : { ...hsva, a: 1 }))

export function equalColorObjects(first: HsvaColor, second: HsvaColor): boolean {
  if (first === second) return true
  return (
    first.h === second.h && first.s === second.s && first.v === second.v && first.a === second.a
  )
}

export function equalHex(first: string, second: string): boolean {
  if (first.toLowerCase() === second.toLowerCase()) return true
  const a = hexToRgba(first)
  const b = hexToRgba(second)
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

const isTouch = (event: MouseEvent | TouchEvent): event is TouchEvent => 'touches' in event

const getParentWindow = (node?: HTMLElement | null): Window =>
  (node && node.ownerDocument.defaultView) || self

function getTouchPoint(touches: TouchList, touchId: number | null): Touch {
  for (let i = 0; i < touches.length; i++) {
    if (touches[i]!.identifier === touchId) return touches[i]!
  }
  return touches[0]!
}

function getRelativePosition(
  node: HTMLElement,
  event: MouseEvent | TouchEvent,
  touchId: number | null,
): Interaction {
  const rect = node.getBoundingClientRect()
  const pointer = isTouch(event) ? getTouchPoint(event.touches, touchId) : event

  return {
    left: clamp((pointer.pageX - (rect.left + getParentWindow(node).pageXOffset)) / rect.width),
    top: clamp((pointer.pageY - (rect.top + getParentWindow(node).pageYOffset)) / rect.height),
  }
}

const preventDefaultMove = (event: MouseEvent | TouchEvent): void => {
  if (!isTouch(event)) event.preventDefault()
}

/**
 * react-colorful's `Interactive`: mouse/touch drags and arrow keys on a
 * picker surface. Attach it to the `react-colorful__interactive` element.
 */
export function interactive(
  getMove: () => (interaction: Interaction) => void,
  getKey: () => (offset: Interaction) => void,
) {
  return (node: HTMLElement) => {
    let hasTouch = false
    let touchId: number | null = null

    const handleMove = (event: MouseEvent | TouchEvent) => {
      preventDefaultMove(event)
      const isDown = isTouch(event) ? event.touches.length > 0 : event.buttons > 0
      if (isDown) getMove()(getRelativePosition(node, event, touchId))
      else toggleDocumentEvents(false)
    }

    const handleMoveEnd = () => toggleDocumentEvents(false)

    function toggleDocumentEvents(state: boolean) {
      const touch = hasTouch
      const parentWindow = getParentWindow(node)
      const toggleEvent = state
        ? parentWindow.addEventListener.bind(parentWindow)
        : parentWindow.removeEventListener.bind(parentWindow)
      toggleEvent(touch ? 'touchmove' : 'mousemove', handleMove as EventListener)
      toggleEvent(touch ? 'touchend' : 'mouseup', handleMoveEnd)
    }

    const handleMoveStart = (event: MouseEvent | TouchEvent) => {
      preventDefaultMove(event)
      // A touch device also fires the compatibility mouse events; ignore those.
      if (hasTouch && !isTouch(event)) return

      if (isTouch(event)) {
        hasTouch = true
        const changedTouches = event.changedTouches || []
        if (changedTouches.length) touchId = changedTouches[0]!.identifier
      }

      node.focus()
      getMove()(getRelativePosition(node, event, touchId))
      toggleDocumentEvents(true)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const keyCode = event.which || event.keyCode

      // Ignore all keys except arrow ones
      if (keyCode < 37 || keyCode > 40) return
      // Do not scroll page by arrow keys when document is focused on the element
      event.preventDefault()
      // Send relative offset to the parent component.
      // We use codes (37←, 38↑, 39→, 40↓) instead of keys ('ArrowRight', 'ArrowDown', etc)
      // to reduce the size of the library
      getKey()({
        left: keyCode === 39 ? 0.05 : keyCode === 37 ? -0.05 : 0,
        top: keyCode === 40 ? 0.05 : keyCode === 38 ? -0.05 : 0,
      })
    }

    node.addEventListener('mousedown', handleMoveStart)
    node.addEventListener('touchstart', handleMoveStart, { passive: true })
    node.addEventListener('keydown', handleKeyDown)
    return () => {
      node.removeEventListener('mousedown', handleMoveStart)
      node.removeEventListener('touchstart', handleMoveStart)
      node.removeEventListener('keydown', handleKeyDown)
      toggleDocumentEvents(false)
    }
  }
}

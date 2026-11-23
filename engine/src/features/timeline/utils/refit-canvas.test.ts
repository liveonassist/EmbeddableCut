// SPDX-License-Identifier: MIT
// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'
import { readCanvasFraming, refitCanvas, type CanvasFraming, type CanvasSize } from './refit-canvas'

const HD = { width: 1920, height: 1080 }
const TALL = { width: 1080, height: 1920 }

function item(type: TimelineItem['type'], extra: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: type,
    type,
    trackId: 't',
    from: 0,
    durationInFrames: 30,
    label: type,
    ...extra,
  } as TimelineItem
}

function refit(target: TimelineItem, from: CanvasSize, to: CanvasSize, framing: CanvasFraming) {
  return refitCanvas({
    items: [target],
    keyframes: [],
    from,
    to,
    framing,
    sourceSizeOf: (i) => (i.type === 'video' ? HD : undefined),
  }).items[0]!
}

describe('refitCanvas', () => {
  it('letterboxes a full-canvas clip, or covers the canvas with it', () => {
    const pinned = item('video', { transform: { x: 0, y: 0, width: 1920, height: 1080 } })
    expect(refit(pinned, HD, TALL, 'fit').transform).toMatchObject({ width: 1080, height: 608 })
    const filled = refit(pinned, HD, TALL, 'fill')
    expect(filled.transform).toMatchObject({ width: 3414, height: 1920 })
    // Back to a canvas of the clip's shape, where filling it is fitting it.
    expect(refit(filled, TALL, HD, 'fill').transform).toMatchObject({ width: 1920, height: 1080 })
  })

  it('leaves a clip with the default fit on the default', () => {
    expect(refit(item('video'), HD, TALL, 'fit').transform).toBeUndefined()
  })

  it('keeps a picture in picture on what it was over when fitting, in its corner when filling', () => {
    const pip = item('video', { transform: { x: 700, y: 350, width: 480, height: 270 } })
    const fitted = refit(pip, HD, TALL, 'fit').transform!
    expect(fitted).toMatchObject({ x: 393.75, y: 196.875, width: 270, height: 151.875 })
    const spread = refit(pip, HD, TALL, 'fill').transform!
    expect(spread.x).toBe(393.75)
    expect(spread.y).toBeCloseTo(622.2, 1)
    expect(spread.width).toBe(270)
  })

  it('scales text with the canvas and gives a full-canvas box the new canvas', () => {
    const title = item('text', {
      fontSize: 80,
      transform: { width: 1920, height: 1080 },
    } as Partial<TimelineItem>)
    expect(refit(title, HD, { width: 3840, height: 2160 }, 'fit')).toMatchObject({
      fontSize: 160,
      transform: { width: 3840, height: 2160 },
    })
    expect(refit(title, HD, TALL, 'fit')).toMatchObject({ fontSize: 45, transform: TALL })
  })

  it('scales position keyframes instead of refitting the clip they move', () => {
    const moving = item('video', { transform: { width: 1920, height: 1080 } })
    const { items, keyframes } = refitCanvas({
      items: [moving],
      keyframes: [
        {
          itemId: 'video',
          properties: [
            { property: 'x', keyframes: [{ id: 'k', frame: 0, value: 960, easing: 'linear' }] },
          ],
        },
      ],
      from: HD,
      to: { width: 960, height: 540 },
      framing: 'fill',
      sourceSizeOf: () => HD,
    })
    expect(items[0]!.transform).toMatchObject({ width: 960, height: 540 })
    expect(keyframes[0]!.properties[0]!.keyframes[0]!.value).toBe(480)
  })
})

describe('readCanvasFraming', () => {
  it('reads the framing only where a clip has another shape than the canvas', () => {
    const read = (items: TimelineItem[], canvas: CanvasSize) =>
      readCanvasFraming(items, canvas, () => HD, new Map())
    const filled = item('video', { transform: { width: 3413.33, height: 1920 } })
    expect(read([item('video')], HD)).toBeNull()
    expect(read([item('video')], TALL)).toBe('fit')
    expect(read([filled], TALL)).toBe('fill')
    expect(read([filled, item('video')], TALL)).toBe('mixed')
  })
})

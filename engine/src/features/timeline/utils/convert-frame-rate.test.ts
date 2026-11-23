// SPDX-License-Identifier: MIT
// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'
import { convertTimelineFrameRate, type FrameRateContent } from './convert-frame-rate'

function video(id: string, from: number, durationInFrames: number, extra = {}): TimelineItem {
  return {
    id,
    type: 'video',
    trackId: 'v1',
    from,
    durationInFrames,
    label: id,
    src: '',
    ...extra,
  } as TimelineItem
}

function content(items: TimelineItem[], extra: Partial<FrameRateContent> = {}): FrameRateContent {
  return {
    items,
    transitions: [],
    keyframes: [],
    markers: [],
    inPoint: null,
    outPoint: null,
    ...extra,
  }
}

const RATES = [24, 25, 30, 50, 60]

describe('convertTimelineFrameRate', () => {
  it('keeps clips that met meeting, and times within half a frame, at every rate', () => {
    // Odd lengths, so most cuts fall between frames of the new rate.
    const lengths = [1, 2, 7, 11, 13, 29, 101, 353, 1, 1, 1, 47]
    const items: TimelineItem[] = []
    let at = 5
    for (const [index, length] of lengths.entries()) {
      items.push(video(`c${index}`, at, length))
      at += length
    }
    for (const fromFps of RATES) {
      for (const toFps of RATES) {
        const out = convertTimelineFrameRate(content(items), fromFps, toFps).items
        for (let i = 0; i < out.length; i++) {
          expect(out[i]!.durationInFrames).toBeGreaterThanOrEqual(1)
          if (i > 0) expect(out[i]!.from).toBe(out[i - 1]!.from + out[i - 1]!.durationInFrames)
        }
        if (toFps >= fromFps) {
          for (const [i, item] of out.entries()) {
            expect(Math.abs(item.from / toFps - items[i]!.from / fromFps)).toBeLessThanOrEqual(
              0.5 / toFps + 1e-9,
            )
          }
        }
      }
    }
  })

  it('tells a clip that counted its source at the timeline rate what that rate was', () => {
    const [own, named] = convertTimelineFrameRate(
      content([
        video('own', 0, 90, { sourceStart: 30, sourceEnd: 120 }),
        video('named', 90, 90, { sourceStart: 48, sourceFps: 24 }),
      ]),
      30,
      60,
    ).items
    expect(own).toMatchObject({ sourceStart: 30, sourceEnd: 120, sourceFps: 30 })
    expect(named).toMatchObject({ sourceStart: 48, sourceFps: 24 })
  })

  it('moves everything counted in frames, and keeps keyframes distinct', () => {
    const out = convertTimelineFrameRate(
      content(
        [
          video('a', 0, 120, {
            motionModifiers: [{ phaseFrames: 10 }],
            effects: [{ id: 'e', audioPulse: { durationFrames: 12, beats: [{ frame: 60 }] } }],
          }),
          {
            ...video('t', 120, 60),
            type: 'text',
            textMotion: { in: { durationFrames: 20, staggerFrames: 1, offsetFrames: 0 } },
          } as unknown as TimelineItem,
        ],
        {
          transitions: [{ id: 'x', durationInFrames: 31 }] as never,
          keyframes: [
            {
              itemId: 'a',
              properties: [
                {
                  property: 'x',
                  keyframes: [0, 1, 2, 60].map((frame, i) => ({
                    id: `k${i}`,
                    frame,
                    value: i,
                    easing: 'linear',
                  })),
                },
              ],
              propertyLinks: [{ timeOffsetFrames: 60 }],
            },
          ] as never,
          markers: [{ id: 'm', frame: 60, color: '#fff' }],
          inPoint: 30,
          outPoint: 150,
        },
      ),
      60,
      30,
    )
    expect(out.markers[0]!.frame).toBe(30)
    expect([out.inPoint, out.outPoint]).toEqual([15, 75])
    expect(out.transitions[0]!.durationInFrames).toBe(15)
    const frames = out.keyframes[0]!.properties[0]!.keyframes.map((k) => k.frame)
    expect(frames).toEqual([0, 1, 2, 30])
    expect(out.keyframes[0]!.propertyLinks?.[0]?.timeOffsetFrames).toBe(30)
    expect(out.items[0]!.motionModifiers![0]!.phaseFrames).toBe(5)
    expect(out.items[0]!.effects![0]!.audioPulse).toMatchObject({
      durationFrames: 6,
      beats: [{ frame: 30 }],
    })
    expect(out.items[1]).toMatchObject({
      textMotion: { in: { durationFrames: 10, staggerFrames: 1, offsetFrames: 0 } },
    })
  })
})

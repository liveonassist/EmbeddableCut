// SPDX-License-Identifier: MIT
// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import type { VideoItem } from '@/types/timeline'
import { getItemRenderTimelineSpan, resolveVideoRenderSourceTimeSeconds } from './render-span'

const FPS = 30

function createVideoItem(overrides?: Partial<VideoItem>): VideoItem {
  return {
    id: 'clip-1',
    type: 'video',
    trackId: 'track-1',
    from: 30,
    durationInFrames: 120,
    label: 'Clip',
    src: 'clip.mp4',
    sourceStart: 90,
    sourceFps: FPS,
    ...overrides,
  }
}

const sourceTimeAt = (item: VideoItem, frame: number) =>
  resolveVideoRenderSourceTimeSeconds(item, getItemRenderTimelineSpan(item), frame, FPS)

describe('resolveVideoRenderSourceTimeSeconds with a held frame rate', () => {
  it('shows the step start source frame for every frame of the step', () => {
    const held = createVideoItem({ frameRate: 2, speed: 2 })
    const smooth = createVideoItem({ speed: 2 })
    for (const frame of [45, 52, 59]) {
      expect(sourceTimeAt(held, frame)).toBe(sourceTimeAt(smooth, 45))
    }
    expect(sourceTimeAt(held, 60)).toBe(sourceTimeAt(smooth, 60))
  })

  it('holds reversed clips the same way', () => {
    const held = createVideoItem({ frameRate: 5, isReversed: true, sourceEnd: 330 })
    const smooth = createVideoItem({ isReversed: true, sourceEnd: 330 })
    expect(sourceTimeAt(held, 35)).toBe(sourceTimeAt(smooth, 30))
    expect(sourceTimeAt(held, 36)).toBe(sourceTimeAt(smooth, 36))
  })
})

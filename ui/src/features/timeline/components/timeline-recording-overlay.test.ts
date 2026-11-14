// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { useMicRecordingStore } from '@/shared/state/mic-recording-store'
import { usePlaybackStore } from '@/shared/state/playback'

import { setTimelineState } from '@/features/timeline/test-helpers'
import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'
import TimelineRecordingOverlay from './timeline-recording-overlay.svelte'

describe('TimelineRecordingOverlay', () => {
  beforeEach(() => {
    _resetZoomStoreForTest()
    useMicRecordingStore.getState().reset()
    usePlaybackStore.setState({ currentFrame: 0 })
    setTimelineState({ fps: 30 })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing while recording is idle', () => {
    const view = render(TimelineRecordingOverlay)

    expect(view.container.querySelector('div')).toBeNull()
  })

  it('updates real-pixel geometry on live zoom without remounting', () => {
    usePlaybackStore.setState({ currentFrame: 60 })
    useMicRecordingStore.setState({
      status: 'recording',
      recordStartFrame: 30,
    })

    const view = render(TimelineRecordingOverlay)
    const overlay = view.container.querySelector('div')
    const bar = overlay?.children[0]
    const label = overlay?.children[1]

    expect(overlay).toBeInstanceOf(HTMLDivElement)
    expect(bar).toBeInstanceOf(HTMLDivElement)
    expect(label).toBeInstanceOf(HTMLDivElement)
    expect((bar as HTMLDivElement).style.left).toBe('100px')
    expect((bar as HTMLDivElement).style.width).toBe('100px')
    expect((label as HTMLDivElement).style.left).toBe('100px')

    useZoomStore.getState().setZoomLevelImmediate(1.5)
    flushSync()

    expect(useZoomStore.getState().contentPixelsPerSecond).toBe(100)
    expect(overlay?.children[0]).toBe(bar)
    expect(overlay?.children[1]).toBe(label)
    expect((bar as HTMLDivElement).style.left).toBe('150px')
    expect((bar as HTMLDivElement).style.width).toBe('150px')
    expect((label as HTMLDivElement).style.left).toBe('150px')
  })
})

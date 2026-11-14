// SPDX-License-Identifier: MIT

/**
 * Render isolation of the docked editor: the React test counted panel renders;
 * here an effect reading every geometry value the editor is built from counts
 * how often it would update.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'
import type { VideoItem } from '@/types/timeline'
import { act, renderHook } from '../test/render-hook.svelte'
import { useEditTimelineKeyframeGeometry } from './use-edit-timeline-keyframe-geometry.svelte'

const VIDEO_ITEM: VideoItem = {
  id: 'clip-video-1',
  type: 'video',
  trackId: 'track-v1',
  from: 0,
  durationInFrames: 90,
  label: 'clip.mp4',
  src: 'blob:video',
  mediaId: 'media-1',
}

function renderGeometry() {
  const container = document.createElement('div')
  const updates = { count: 0 }
  const view = renderHook(() => {
    const geometry = useEditTimelineKeyframeGeometry(() => ({
      timelineScrollContainer: container,
      surface: 'edit',
      isOpen: true,
      maxItemEndFrame: 300,
      selectedItemForEditor: VIDEO_ITEM,
    }))
    $effect(() => {
      void geometry.editTimelinePixelsPerSecond
      void geometry.editTimelineScrollLeft
      void geometry.editTimelineFrameViewport
      void geometry.editTimelineFps
      void geometry.editTimelineViewportWidth
      updates.count++
    })
    return geometry
  })
  vi.runAllTimers()
  act(() => {})
  updates.count = 0
  return { ...view, updates }
}

describe('KeyframeGraphPanel render isolation', () => {
  const unmounts: Array<() => void> = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle))
    _resetZoomStoreForTest()
    useZoomStore.getState().setZoomLevelSynchronized(1)
  })

  afterEach(() => {
    for (const unmount of unmounts.splice(0)) unmount()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not update the editor geometry for live-only zoom updates', () => {
    const { result, unmount, updates } = renderGeometry()
    unmounts.push(unmount)
    const settledPixelsPerSecond = result.current.editTimelinePixelsPerSecond

    act(() => {
      useZoomStore.setState({ pixelsPerSecond: 125, level: 1.25, isZoomInteracting: true })
    })
    vi.runAllTimers()
    act(() => {})

    expect(updates.count).toBe(0)
    expect(result.current.editTimelinePixelsPerSecond).toBe(settledPixelsPerSecond)
  })

  it('updates once when settled zoom geometry commits', () => {
    const { result, unmount, updates } = renderGeometry()
    unmounts.push(unmount)

    act(() => {
      useZoomStore.setState({
        level: 1.25,
        pixelsPerSecond: 125,
        contentLevel: 1.25,
        contentPixelsPerSecond: 125,
        isZoomInteracting: false,
      })
    })
    vi.runAllTimers()
    act(() => {})

    expect(result.current.editTimelinePixelsPerSecond).toBe(125)
    expect(updates.count).toBe(1)
  })
})

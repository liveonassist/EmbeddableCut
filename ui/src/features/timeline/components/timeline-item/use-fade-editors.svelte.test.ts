// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { TimelineItem, VideoItem } from '@/types/timeline'
import { act, renderHook } from '../../test/render-hook.svelte'
import { useFadeEditors } from './use-fade-editors.svelte'

function makeVideoItem(overrides: Partial<VideoItem> = {}): VideoItem {
  return {
    id: 'clip-1',
    type: 'video',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 100,
    label: 'clip.mp4',
    src: 'blob:test',
    mediaId: 'media-1',
    ...overrides,
  }
}

function makeControls(width: number): HTMLDivElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height: 40, right: width, bottom: 40 }) as DOMRect
  return element
}

describe('useFadeEditors', () => {
  let unmount: (() => void) | undefined

  afterEach(() => {
    unmount?.()
    unmount = undefined
  })

  function setup(initial: VideoItem) {
    let item = $state<TimelineItem>(initial)
    const updateTimelineItem = vi.fn((_id: string, patch: Partial<TimelineItem>) => {
      item = { ...item, ...patch } as TimelineItem
    })
    const hook = renderHook(() =>
      useFadeEditors(() => ({
        item,
        fps: 30,
        activeTool: 'select',
        trackLocked: false,
        isAnyDragActiveRef: { current: false },
        transform: null,
        updateTimelineItem,
      })),
    )
    unmount = hook.unmount
    hook.result.current.videoControlsRef.current = makeControls(200)
    return { editors: hook.result.current, updateTimelineItem }
  }

  it('previews a video fade drag live and commits it on mouseup', () => {
    const { editors, updateTimelineItem } = setup(makeVideoItem())

    act(() => {
      editors.handleVideoFadeHandleMouseDown(
        new MouseEvent('mousedown', { button: 0, clientX: 20 }),
        'in',
      )
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50 }))
    })

    // 50px of 200px over 100 frames is 25 frames, 0.8333s at 30fps.
    expect(editors.videoFadeEdit?.previewFadeIn).toBeCloseTo(25 / 30)
    expect(editors.displayedVideoFadeIn).toBeCloseTo(25 / 30)
    expect(updateTimelineItem).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(updateTimelineItem).toHaveBeenCalledWith('clip-1', { fadeIn: 25 / 30 })
    // The committing preview clears once the persisted value catches up.
    expect(editors.videoFadeEdit).toBeNull()
    expect(editors.displayedVideoFadeIn).toBeCloseTo(25 / 30)

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120 }))
    })
    expect(editors.videoFadeEdit).toBeNull()
  })

  it('ignores non-primary buttons and resets a fade on double-click', () => {
    const { editors, updateTimelineItem } = setup(makeVideoItem({ fadeOut: 1 }))

    act(() => {
      editors.handleVideoFadeHandleMouseDown(
        new MouseEvent('mousedown', { button: 2, clientX: 20 }),
        'out',
      )
    })
    expect(editors.videoFadeEdit).toBeNull()

    act(() => {
      editors.handleVideoFadeHandleDoubleClick('out')
    })
    expect(updateTimelineItem).toHaveBeenCalledWith('clip-1', { fadeOut: 0 })
    expect(editors.displayedVideoFadeOut).toBe(0)
  })
})

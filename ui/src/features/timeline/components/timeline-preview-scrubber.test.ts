// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { usePlaybackStore } from '@/shared/state/playback'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'
import TimelinePreviewScrubber from './timeline-preview-scrubber.svelte'

describe('TimelinePreviewScrubber', () => {
  beforeEach(() => {
    _resetZoomStoreForTest()
    useTimelineSettingsStore.setState({ fps: 30 })
    usePlaybackStore.setState({ previewFrame: null, previewItemId: null, isPlaying: false })
  })

  afterEach(() => {
    cleanup()
  })

  it('follows live zoom geometry without a component update', () => {
    render(TimelinePreviewScrubber)

    usePlaybackStore.getState().setPreviewFrame(30)
    flushSync()
    const scrubber = screen.getByTestId('timeline-preview-scrubber')
    expect(scrubber).toHaveStyle({ transform: 'translate3d(100px, 0, 0)' })

    useZoomStore.setState({
      level: 1.8,
      pixelsPerSecond: 180,
      isZoomInteracting: true,
    })

    // Repositioned synchronously from the store subscription, before any flush.
    expect(scrubber.style.transform).toBe('translate3d(180px, 0, 0)')
    expect(screen.getByTestId('timeline-preview-scrubber')).toBe(scrubber)
  })
})

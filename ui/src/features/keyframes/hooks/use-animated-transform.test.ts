// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { usePlaybackStore } from '@/shared/state/playback'
import { resetPlaybackPreviewState } from '@/shared/state/playback-preview-test-helpers'
import { setTimelineState } from '@/features/keyframes/deps/timeline-test-helpers-contract'
import type { TimelineItem } from '@/types/timeline'
import Probe from './use-animated-transform.harness.svelte'

const ANIMATED_ITEM = {
  id: 'item-1',
  type: 'text',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 200,
  label: 'Test Item',
  text: 'Hello',
  color: '#ffffff',
  transform: {
    x: 0,
    y: 0,
    width: 320,
    height: 120,
    rotation: 0,
    opacity: 1,
  },
} as unknown as TimelineItem

const STATIC_ITEM = {
  id: 'item-2',
  type: 'text',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 200,
  label: 'Static Item',
  text: 'World',
  color: '#ffffff',
  transform: {
    x: 480,
    y: 0,
    width: 320,
    height: 120,
    rotation: 0,
    opacity: 1,
  },
} as unknown as TimelineItem

const WRAPPED_TEXT_ITEM = {
  ...STATIC_ITEM,
  id: 'item-3',
  text: 'line one\nline two\nline three\nline four',
  fontSize: 48,
  lineHeight: 1.2,
  transform: {
    ...STATIC_ITEM.transform,
    width: 200,
    height: 80,
  },
} as unknown as TimelineItem

const CORNER_PINNED_WRAPPED_TEXT_ITEM = {
  ...WRAPPED_TEXT_ITEM,
  id: 'item-4',
  cornerPin: {
    topLeft: [0, 0],
    topRight: [12, -8],
    bottomRight: [10, 14],
    bottomLeft: [-10, 6],
  },
} as unknown as TimelineItem

function renderProbe(item: TimelineItem, alternate?: TimelineItem) {
  render(Probe, { item, alternate, testId: 'probe' })
  return screen.getByTestId('probe')
}

function resetStores() {
  localStorage.clear()

  resetPlaybackPreviewState(10)

  setTimelineState({
    keyframes: [
      {
        itemId: ANIMATED_ITEM.id,
        properties: [
          {
            property: 'x',
            keyframes: [
              { id: 'kf-10', frame: 10, value: 110, easing: 'linear' },
              { id: 'kf-20', frame: 20, value: 220, easing: 'linear' },
              { id: 'kf-30', frame: 30, value: 330, easing: 'linear' },
            ],
          },
        ],
      },
    ],
  })
}

describe('useAnimatedTransform skimming frame resolution', () => {
  beforeEach(() => {
    resetStores()
  })

  it('uses previewFrame while paused (single-item hook)', async () => {
    const probe = renderProbe(ANIMATED_ITEM)

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-x', '110')
      expect(probe).toHaveAttribute('data-relative-frame', '10')
    })

    usePlaybackStore.getState().setPreviewFrame(20)
    flushSync()

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-x', '220')
      expect(probe).toHaveAttribute('data-relative-frame', '20')
    })
  })

  it('uses previewFrame while paused (multi-item hook)', async () => {
    const probe = renderProbe(ANIMATED_ITEM)

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-multi-x', '110')
    })

    usePlaybackStore.getState().setPreviewFrame(20)
    flushSync()

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-multi-x', '220')
    })
  })

  it('ignores previewFrame while playing', async () => {
    const probe = renderProbe(ANIMATED_ITEM)

    const playback = usePlaybackStore.getState()
    playback.setPreviewFrame(20)
    playback.play()
    flushSync()

    await waitFor(() => {
      // Playing mode follows currentFrame, not previewFrame.
      expect(probe).toHaveAttribute('data-x', '110')
      expect(probe).toHaveAttribute('data-relative-frame', '10')
    })
  })

  it('falls back to currentFrame when previewFrame is stale', async () => {
    const probe = renderProbe(ANIMATED_ITEM)

    const playback = usePlaybackStore.getState()
    playback.setPreviewFrame(20)
    playback.setCurrentFrame(30)
    flushSync()

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-x', '330')
      expect(probe).toHaveAttribute('data-relative-frame', '30')
    })
  })

  it('updates keyframe source when switching items without timeline changes', async () => {
    const probe = renderProbe(ANIMATED_ITEM, STATIC_ITEM)

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-x', '110')
    })

    await fireEvent.click(screen.getByTestId('switch-item'))

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-x', '480')
    })
  })

  it('keeps corner-pinned text at its authored gizmo height', async () => {
    const probe = renderProbe(CORNER_PINNED_WRAPPED_TEXT_ITEM)

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-height', '80')
    })
  })

  it('still expands unpinned wrapped text to fit content', async () => {
    const probe = renderProbe(WRAPPED_TEXT_ITEM)

    await waitFor(() => {
      expect(Number(probe.getAttribute('data-height'))).toBeGreaterThan(80)
    })
  })

  it('keeps batched corner-pinned text at its authored gizmo height', async () => {
    const probe = renderProbe(CORNER_PINNED_WRAPPED_TEXT_ITEM)

    await waitFor(() => {
      expect(probe).toHaveAttribute('data-multi-height', '80')
    })
  })
})

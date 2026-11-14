// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'

const timelineState = vi.hoisted(() => ({
  updateItem: vi.fn(),
}))

const previewState = vi.hoisted(() => ({
  setPropertiesPreviewNew: vi.fn(),
  clearPreview: vi.fn(),
  clearPreviewForItems: vi.fn(),
}))

vi.mock('@/features/editor/deps/timeline-store', () => ({
  updateItem: timelineState.updateItem,
}))

vi.mock('@/features/editor/deps/preview', () => ({
  useGizmoStore: {
    getState: () => previewState,
    subscribe: () => () => undefined,
  },
}))

vi.mock('./audio-eq-curve-editor.svelte', async () => ({
  default: (await import('./audio-eq-curve-editor.stub.svelte')).default,
}))

import AudioEqPanelContent from './audio-eq-panel-content.svelte'

const AUDIO_ITEM = {
  id: 'item-1',
  type: 'audio',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 60,
  label: 'Audio',
  src: 'blob:audio',
  audioEqEnabled: true,
} as TimelineItem

describe('AudioEqPanelContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cancels compact live previews and clears item-scoped preview state on unmount', async () => {
    vi.useFakeTimers()

    try {
      const { unmount } = render(AudioEqPanelContent, {
        targetLabel: 'Clip',
        layoutMode: 'compact',
        items: [AUDIO_ITEM],
      })

      await fireEvent.click(screen.getByRole('button', { name: 'live-eq' }))
      expect(previewState.setPropertiesPreviewNew).not.toHaveBeenCalled()

      unmount()

      vi.advanceTimersByTime(100)

      expect(previewState.setPropertiesPreviewNew).not.toHaveBeenCalled()
      expect(previewState.clearPreviewForItems).toHaveBeenCalledWith(['item-1'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears clip EQ previews per item after a committed change', async () => {
    render(AudioEqPanelContent, { targetLabel: 'Clip', items: [AUDIO_ITEM] })

    await fireEvent.click(screen.getByRole('button', { name: 'commit-eq' }))
    await Promise.resolve()

    expect(timelineState.updateItem).toHaveBeenCalledWith('item-1', {
      audioEqLowGainDb: 6,
      audioEqMidGainDb: 0,
    })
    expect(previewState.clearPreviewForItems).toHaveBeenCalledWith(['item-1'])
    expect(previewState.clearPreview).not.toHaveBeenCalled()
  })
})

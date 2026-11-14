// SPDX-License-Identifier: MIT

import { render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { VideoItem } from '@/types/timeline'
import ColorGradePanel from './index.svelte'

const { VIDEO_ITEM, staticStore } = vi.hoisted(() => ({
  staticStore: <S>(state: S) => ({ getState: () => state, subscribe: () => () => {} }),
  VIDEO_ITEM: {
    id: 'clip-1',
    type: 'video',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 90,
    label: 'clip.mp4',
    src: 'blob:clip',
    mediaId: 'media-1',
  } satisfies VideoItem,
}))

vi.mock('@/features/editor/deps/timeline-store', () => ({
  useItemsStore: staticStore({ itemById: { [VIDEO_ITEM.id]: VIDEO_ITEM } }),
}))

vi.mock('@/shared/state/selection', () => ({
  useSelectionStore: staticStore({ selectedItemIds: [VIDEO_ITEM.id] }),
}))

vi.mock('@/features/editor/deps/effects-contract', async () => ({
  ColorGradeSection: (await import('./color-grade-section.stub.svelte')).default,
  EffectsSection: (await import('./effects-section.stub.svelte')).default,
}))

vi.mock('@/features/editor/deps/timeline-keyframe-ui', async () => ({
  KeyframeGraphPanel: (await import('./keyframe-graph-panel.stub.svelte')).default,
}))

describe('ColorGradePanel', () => {
  it('keeps the original graph lane with Effects as its default parameter filter', async () => {
    render(ColorGradePanel, { layout: 'dock' })

    const gradeSection = await screen.findByTestId('color-grade-section', {}, { timeout: 5000 })
    expect(gradeSection).toHaveAttribute('data-layout', 'dock')
    expect(gradeSection).toHaveTextContent('has adjustment action')
    expect(screen.getByText('Add Effect')).toBeInTheDocument()

    expect(screen.getByTestId('color-keyframes-lane')).toBeInTheDocument()
    const keyframePanel = screen.getByTestId('keyframe-graph-panel')
    expect(keyframePanel).toHaveAttribute('data-open', 'true')
    expect(keyframePanel).toHaveAttribute('data-placement', 'side')
    expect(keyframePanel).toHaveAttribute('data-show-close', 'false')
    expect(keyframePanel).toHaveAttribute('data-initial-groups', 'effects')
    expect(keyframePanel).toHaveAttribute('data-property-column-width', '336')
  })

  it('keeps the sidebar variant stacked without the dock graph lane', async () => {
    render(ColorGradePanel)

    await waitFor(() => expect(screen.getByTestId('color-grade-section')).toBeInTheDocument(), {
      timeout: 5000,
    })
    expect(screen.queryByTestId('color-keyframes-lane')).not.toBeInTheDocument()
    expect(screen.queryByTestId('keyframe-graph-panel')).not.toBeInTheDocument()
  })
})

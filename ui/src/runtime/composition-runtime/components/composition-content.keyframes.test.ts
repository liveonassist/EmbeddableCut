// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { render, screen } from '@testing-library/svelte'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
import { useCompositionsStore } from '@/runtime/composition-runtime/deps/stores'
import type { CompositionItem, ShapeItem, TimelineTrack } from '@/types/timeline'
import CompositionContentHarness from './composition-content.harness.svelte'
import {
  makeNestedAudioItem,
  makeNestedTimelineTrack,
  makeNestedVideoItem,
  makeParentCompositionItem,
  makeTestSubComposition,
  resetCompositionContentRuntimeState,
  storeTestSubComposition,
  type TestSubComposition,
} from './composition-content-test-helpers'
const blobUrlManagerGetSpy = vi.spyOn(blobUrlManager, 'get')

// The real player primitives, but every Sequence mounted at local frame 0.
vi.mock('@/runtime/composition-runtime/deps/player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/runtime/composition-runtime/deps/player')>()),
  Sequence: (await import('./composition-content-sequence.harness.svelte')).default,
  useBridgedIsPlaying: () => ({ current: false }),
  useClockPlaybackRate: () => ({ current: 1 }),
}))

vi.mock('../hooks/use-transition-participant-sync.svelte', () => ({
  useTransitionParticipantSync: vi.fn(),
}))

vi.mock('./item-content.svelte', async () => ({
  default: (await import('./composition-content-item.harness.svelte')).default,
}))

function act(fn: () => void) {
  fn()
  flushSync()
}

describe('CompositionContent keyframes', () => {
  beforeEach(() => {
    blobUrlManagerGetSpy.mockImplementation(() => null)
    resetCompositionContentRuntimeState()
  })

  it('provides sub-comp keyframes to nested items during parent timeline render', async () => {
    const subTracks: TimelineTrack[] = [
      {
        id: 'sub-track-content',
        name: 'Content',
        height: 60,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
    ]

    const contentItem: ShapeItem = {
      id: 'sub-content',
      type: 'shape',
      trackId: 'sub-track-content',
      from: 0,
      durationInFrames: 60,
      label: 'Content shape',
      shapeType: 'rectangle',
      fillColor: '#ff0000',
      transform: {
        x: 0,
        y: 0,
        width: 640,
        height: 360,
        rotation: 0,
        opacity: 1,
      },
    }

    const subComp: TestSubComposition = {
      id: 'sub-comp-1',
      name: 'Animated precomp',
      items: [contentItem],
      tracks: subTracks,
      transitions: [],
      keyframes: [
        {
          itemId: contentItem.id,
          properties: [
            {
              property: 'x',
              keyframes: [{ id: 'kf-1', frame: 0, value: 120, easing: 'linear' }],
            },
          ],
        },
      ],
      fps: 30,
      width: 1280,
      height: 720,
      durationInFrames: 60,
    }

    useCompositionsStore.setState({
      compositions: [subComp],
      compositionById: { [subComp.id]: subComp },
      mediaDependencyIds: [],
      mediaDependencyVersion: 0,
    })

    const compositionItem: CompositionItem = {
      id: 'parent-comp-item',
      type: 'composition',
      compositionId: subComp.id,
      trackId: 'parent-track',
      from: 0,
      durationInFrames: 60,
      label: 'Nested comp',
      compositionWidth: 1280,
      compositionHeight: 720,
    }

    render(CompositionContentHarness, { item: compositionItem })

    expect(screen.getByTestId('sub-item-sub-content')).toHaveAttribute('data-keyframe-count', '1')
  })

  it('mutes linked video items inside a precomp when a paired audio item exists', async () => {
    const subComp = makeTestSubComposition({
      id: 'sub-comp-audio-owned',
      name: 'Audio owned precomp',
      items: [
        makeNestedVideoItem({ linkedGroupId: 'group-1' }),
        makeNestedAudioItem({ linkedGroupId: 'group-1' }),
      ],
    })

    storeTestSubComposition(subComp)

    const compositionItem = makeParentCompositionItem({
      id: 'parent-comp-item-audio-owned',
      compositionId: subComp.id,
    })

    render(CompositionContentHarness, { item: compositionItem })

    expect(screen.getByTestId('sub-item-sub-video')).toHaveAttribute('data-muted', 'true')
    expect(screen.getByTestId('sub-item-sub-audio')).toHaveAttribute('data-muted', 'false')
  })

  it('renders only visual sub-items in visual-only mode', async () => {
    const subComp = makeTestSubComposition({
      id: 'sub-comp-visual-only',
      name: 'Visual only precomp',
      items: [
        makeNestedVideoItem({
          id: 'sub-video-visual-only',
        }),
        makeNestedAudioItem({
          id: 'sub-audio-visual-only',
        }),
      ],
    })

    storeTestSubComposition(subComp)

    const compositionItem = makeParentCompositionItem({
      id: 'parent-comp-item-visual-only',
      compositionId: subComp.id,
    })

    render(CompositionContentHarness, { item: compositionItem, renderMode: 'visual-only' })

    expect(screen.getByTestId('sub-item-sub-video-visual-only')).toBeInTheDocument()
    expect(screen.queryByTestId('sub-item-sub-audio-visual-only')).toBeNull()
  })

  it('renders only audio sub-items for compound audio wrappers in audio-only mode', async () => {
    const subComp = makeTestSubComposition({
      id: 'sub-comp-audio-only',
      name: 'Audio only precomp',
      items: [
        makeNestedVideoItem({
          id: 'sub-video-audio-only',
        }),
        makeNestedAudioItem({
          id: 'sub-audio-audio-only',
        }),
      ],
    })

    storeTestSubComposition(subComp)

    render(CompositionContentHarness, {
      item: {
        id: 'parent-comp-audio-wrapper',
        type: 'audio',
        trackId: 'parent-audio-track',
        from: 0,
        durationInFrames: 60,
        label: 'Nested comp audio',
        compositionId: subComp.id,
        src: '',
      },
      renderMode: 'audio-only',
    })

    expect(screen.queryByTestId('sub-item-sub-video-audio-only')).toBeNull()
    expect(screen.getByTestId('sub-item-sub-audio-audio-only')).toBeInTheDocument()
  })

  it('clears stale nested media src until fresh blob urls exist', async () => {
    const subComp = makeTestSubComposition({
      id: 'sub-comp-stale-audio',
      name: 'Stale audio precomp',
      items: [
        makeNestedVideoItem({
          id: 'sub-video-stale',
          trackId: 'sub-track-video-stale',
          src: 'blob:stale-video',
          audioSrc: 'blob:stale-video-audio',
          mediaId: 'media-video-stale',
        }),
        makeNestedAudioItem({
          id: 'sub-audio-stale',
          trackId: 'sub-track-audio-stale',
          src: 'blob:stale-audio',
          mediaId: 'media-stale',
        }),
      ],
      tracks: [
        makeNestedTimelineTrack({ id: 'sub-track-video-stale', name: 'V1', kind: 'video' }),
        makeNestedTimelineTrack({ id: 'sub-track-audio-stale', name: 'A1', kind: 'audio' }),
      ],
    })

    storeTestSubComposition(subComp)

    const { rerender } = render(CompositionContentHarness, {
      item: {
        id: 'parent-comp-stale-wrapper',
        type: 'composition',
        trackId: 'parent-video-track',
        from: 0,
        durationInFrames: 60,
        label: 'Nested stale comp',
        compositionId: subComp.id,
        compositionWidth: 1280,
        compositionHeight: 720,
      },
    })

    expect(screen.getByTestId('sub-item-sub-video-stale')).toHaveAttribute('data-src', '')
    expect(screen.getByTestId('sub-item-sub-video-stale')).toHaveAttribute('data-audio-src', '')
    expect(screen.getByTestId('sub-item-sub-audio-stale')).toHaveAttribute('data-src', '')

    blobUrlManagerGetSpy.mockImplementation((mediaId: string) =>
      mediaId === 'media-stale'
        ? 'blob:fresh-stale-audio'
        : mediaId === 'media-video-stale'
          ? 'blob:fresh-stale-video'
          : null,
    )

    const refreshedSubComp: TestSubComposition = {
      ...subComp,
      items: [...subComp.items],
    }
    act(() => {
      useCompositionsStore.setState({
        compositions: [refreshedSubComp],
        compositionById: { [refreshedSubComp.id]: refreshedSubComp },
        mediaDependencyIds: [],
        mediaDependencyVersion: 1,
      })
    })

    await rerender({
      item: {
        id: 'parent-comp-stale-wrapper',
        type: 'composition',
        trackId: 'parent-video-track',
        from: 0,
        durationInFrames: 60,
        label: 'Nested stale comp',
        compositionId: subComp.id,
        compositionWidth: 1280,
        compositionHeight: 720,
      },
    })

    expect(screen.getByTestId('sub-item-sub-video-stale')).toHaveAttribute(
      'data-src',
      'blob:fresh-stale-video',
    )
    expect(screen.getByTestId('sub-item-sub-video-stale')).toHaveAttribute(
      'data-audio-src',
      'blob:fresh-stale-video',
    )
    expect(screen.getByTestId('sub-item-sub-audio-stale')).toHaveAttribute(
      'data-src',
      'blob:fresh-stale-audio',
    )
  })

  it('keeps nested compound visuals hidden when the parent wrapper is hidden', async () => {
    const subComp = makeTestSubComposition({
      id: 'sub-comp-hidden-parent',
      name: 'Hidden parent precomp',
      items: [
        makeNestedVideoItem({ id: 'sub-video-hidden-parent', trackId: 'sub-track-video-hidden' }),
      ],
      tracks: [
        makeNestedTimelineTrack({ id: 'sub-track-video-hidden', name: 'V1', kind: 'video' }),
      ],
    })

    storeTestSubComposition(subComp)

    const compositionItem = makeParentCompositionItem({
      id: 'parent-comp-item-hidden',
      compositionId: subComp.id,
    })

    const { container } = render(CompositionContentHarness, {
      item: compositionItem,
      parentVisible: false,
    })

    expect(screen.getByTestId('sub-item-sub-video-hidden-parent')).toBeInTheDocument()

    const visibilityStyles = Array.from(container.querySelectorAll('div[style]'))
      .map((element) => element.getAttribute('style') ?? '')
      .filter((style) => style.includes('visibility:'))

    expect(visibilityStyles.length).toBeGreaterThan(0)
    expect(visibilityStyles.every((style) => style.includes('visibility: hidden'))).toBe(true)
  })
})

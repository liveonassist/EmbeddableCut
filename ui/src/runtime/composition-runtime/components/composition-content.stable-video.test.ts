// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { render } from '@testing-library/svelte'
import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
import CompositionContentHarness from './composition-content.harness.svelte'
import {
  makeNestedTimelineTrack,
  makeNestedVideoItem,
  makeParentCompositionItem,
  makeTestSubComposition,
  resetCompositionContentRuntimeState,
  storeTestSubComposition,
} from './composition-content-test-helpers'

const stableVideoSequenceSpy = vi.hoisted(() => vi.fn())
const resolveProxyUrlMock = vi.hoisted(() => vi.fn())
const blobUrlManagerGetSpy = vi.spyOn(blobUrlManager, 'get')

vi.mock('@/features/media-library/utils/media-resolver', () => ({
  resolveProxyUrl: resolveProxyUrlMock,
}))

// The real player primitives, but every Sequence mounted at local frame 0.
vi.mock('@/runtime/composition-runtime/deps/player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/runtime/composition-runtime/deps/player')>()),
  Sequence: (await import('./composition-content-sequence.harness.svelte')).default,
  useBridgedIsPlaying: () => ({ current: false }),
  useClockPlaybackRate: () => ({ current: 1 }),
}))

vi.mock('./item-content.svelte', async () => ({
  default: (await import('./composition-content-item.harness.svelte')).default,
}))

vi.mock('./stable-video-sequence', async () => {
  const { default: Stub } = await import('./composition-content-video.harness.svelte')
  return {
    // Reports the props object, whose getters read the current values.
    StableVideoSequence: (anchor: never, props: Record<string, unknown>) => {
      stableVideoSequenceSpy(props)
      return Stub(anchor, props as never)
    },
  }
})

describe('CompositionContent stable video identity', () => {
  beforeEach(() => {
    stableVideoSequenceSpy.mockClear()
    resolveProxyUrlMock.mockReset()
    blobUrlManagerGetSpy.mockReset()
    resetCompositionContentRuntimeState()
  })

  it('reuses nested stable-video items when only the wrapper transform changes', async () => {
    const subComp = makeTestSubComposition({
      id: 'sub-comp-stable-video',
      name: 'Stable video precomp',
      items: [
        makeNestedVideoItem({
          id: 'nested-video',
          originId: 'nested-video-origin',
        }),
      ],
      tracks: [makeNestedTimelineTrack({ id: 'sub-track-video', name: 'V1', kind: 'video' })],
    })

    storeTestSubComposition(subComp)

    const initialItem = makeParentCompositionItem({
      compositionId: subComp.id,
      transform: {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        rotation: 0,
        opacity: 1,
      },
    })

    const { rerender } = render(CompositionContentHarness, { item: initialItem })

    const firstItemsRef = stableVideoSequenceSpy.mock.lastCall?.[0]?.items
    expect(firstItemsRef).toBeDefined()

    await rerender({
      item: {
        ...initialItem,
        transform: {
          ...initialItem.transform!,
          x: 180,
        },
      },
    })

    const secondItemsRef = stableVideoSequenceSpy.mock.lastCall?.[0]?.items
    expect(secondItemsRef).toBe(firstItemsRef)
  })

  it('prefers proxy URLs for nested video items when proxy media is enabled', async () => {
    blobUrlManagerGetSpy.mockImplementation((mediaId: string) =>
      mediaId === 'media-1' ? 'blob://video-1' : null,
    )
    resolveProxyUrlMock.mockImplementation((mediaId: string) =>
      mediaId === 'media-1' ? 'proxy://video-1' : null,
    )

    const subComp = makeTestSubComposition({
      id: 'sub-comp-proxy-video',
      name: 'Proxy video precomp',
      items: [
        makeNestedVideoItem({
          id: 'nested-video',
          src: 'blob:stale',
          originId: 'nested-video-origin',
        }),
      ],
      tracks: [makeNestedTimelineTrack({ id: 'sub-track-video', name: 'V1', kind: 'video' })],
    })

    storeTestSubComposition(subComp)

    const compositionItem = makeParentCompositionItem({
      compositionId: subComp.id,
    })

    render(CompositionContentHarness, { nestedMediaResolution: 'proxy', item: compositionItem })

    const nestedVideoItems = stableVideoSequenceSpy.mock.lastCall?.[0]?.items
    expect(nestedVideoItems).toHaveLength(1)
    expect(nestedVideoItems?.[0]?.src).toBe('proxy://video-1')
    expect(nestedVideoItems?.[0]?.audioSrc).toBe('blob://video-1')
  })
})

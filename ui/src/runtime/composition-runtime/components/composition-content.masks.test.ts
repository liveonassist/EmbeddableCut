// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { render } from '@testing-library/svelte'
import { useMaskEditorStore } from '@/runtime/composition-runtime/deps/stores'
import type { ShapeItem } from '@/types/timeline'
import CompositionContentHarness from './composition-content.harness.svelte'
import {
  makeNestedTimelineTrack,
  makeNestedShapeItem,
  makeParentCompositionItem,
  makeTestSubComposition,
  resetCompositionContentRuntimeState,
  storeTestSubComposition,
} from './composition-content-test-helpers'

// The real player primitives, but every Sequence mounted at local frame 0.
vi.mock('@/runtime/composition-runtime/deps/player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/runtime/composition-runtime/deps/player')>()),
  Sequence: (await import('./composition-content-sequence.harness.svelte')).default,
  useBridgedIsPlaying: () => ({ current: false }),
  useClockPlaybackRate: () => ({ current: 1 }),
}))

function makeClipMask(overrides: Partial<ShapeItem> = {}): ShapeItem {
  return makeNestedShapeItem({
    id: 'clip-mask',
    trackId: 'mask-track',
    label: 'Clip mask',
    fillColor: '#ffffff',
    isMask: true,
    maskType: 'clip',
    ...overrides,
  })
}

function renderMaskedShapeItem(contentItem: ShapeItem, maskItem: ShapeItem) {
  return render(CompositionContentHarness, {
    itemProps: {
      item: contentItem,
      muted: false,
      masks: [
        {
          shape: maskItem,
          transform: maskItem.transform!,
          trackOrder: 1,
        },
      ],
    },
  })
}

function act(fn: () => void) {
  fn()
  flushSync()
}

describe('CompositionContent masks', () => {
  beforeEach(() => {
    resetCompositionContentRuntimeState()
    useMaskEditorStore.getState().stopEditing()
  })

  it('updates the applied mask clip-path while preview vertices are dragged', async () => {
    const contentItem = makeNestedShapeItem({
      id: 'content-shape',
      trackId: 'content-track',
    })

    const maskItem = makeClipMask({
      id: 'path-mask',
      label: 'Path mask',
      shapeType: 'path',
      pathVertices: [
        {
          position: [0.2, 0.2],
          inHandle: [0.2, 0.2],
          outHandle: [0.2, 0.2],
        },
        {
          position: [0.6, 0.2],
          inHandle: [0.6, 0.2],
          outHandle: [0.6, 0.2],
        },
        {
          position: [0.6, 0.7],
          inHandle: [0.6, 0.7],
          outHandle: [0.6, 0.7],
        },
      ],
    })

    const { container } = renderMaskedShapeItem(contentItem, maskItem)

    const maskedElement = container.querySelector('[style*="clip-path"]')
    expect(maskedElement).not.toBeNull()
    expect((maskedElement as HTMLElement).style.width).toBe('100%')
    expect((maskedElement as HTMLElement).style.height).toBe('100%')
    const before = maskedElement?.getAttribute('style')

    act(() => {
      useMaskEditorStore.setState({
        isEditing: true,
        editingItemId: maskItem.id,
        previewVertices: [
          {
            position: [0.35, 0.15],
            inHandle: [0.35, 0.15],
            outHandle: [0.35, 0.15],
          },
          {
            position: [0.85, 0.2],
            inHandle: [0.85, 0.2],
            outHandle: [0.85, 0.2],
          },
          {
            position: [0.8, 0.85],
            inHandle: [0.8, 0.85],
            outHandle: [0.8, 0.85],
          },
        ],
      })
    })

    const after = container.querySelector('[style*="clip-path"]')?.getAttribute('style')
    expect(after).not.toBe(before)
  })

  it('keeps clip masks on the full-canvas mask wrapper when corner pin is active', async () => {
    const contentItem = makeNestedShapeItem({
      id: 'pinned-shape',
      trackId: 'content-track',
      label: 'Pinned shape',
      cornerPin: {
        topLeft: [0, 0],
        topRight: [48, -24],
        bottomRight: [24, 18],
        bottomLeft: [-20, 16],
      },
    })

    const maskItem = makeClipMask({
      id: 'heart-mask',
      label: 'Heart mask',
      shapeType: 'heart',
    })

    const { container } = renderMaskedShapeItem(contentItem, maskItem)

    const pinnedElement = Array.from(container.querySelectorAll('div')).find((element) =>
      (element as HTMLElement).style.transform.includes('matrix3d'),
    ) as HTMLElement | undefined
    const maskedWrapper = container.querySelector('[style*="clip-path"]')

    expect(pinnedElement).toBeDefined()
    expect(maskedWrapper).not.toBeNull()
    expect(pinnedElement?.querySelector('[style*="clip-path"]')).toBeNull()
  })

  it('keeps clip masks hard-edged even if a feather value is present', async () => {
    const contentItem = makeNestedShapeItem({
      id: 'content-shape',
      trackId: 'content-track',
    })

    const maskItem = makeClipMask({
      id: 'clip-mask-with-feather',
      label: 'Clip mask with feather',
      maskFeather: 18,
    })

    const { container } = renderMaskedShapeItem(contentItem, maskItem)

    expect(container.querySelector('[style*="clip-path"]')).not.toBeNull()
    expect(container.querySelector('mask')).toBeNull()
  })

  it('applies sub-comp masks only to content on lower tracks', async () => {
    const maskItem = makeClipMask({
      id: 'sub-mask',
      trackId: 'sub-track-mask',
      label: 'Mask shape',
    })

    const contentItem = makeNestedShapeItem({
      id: 'sub-content',
      trackId: 'sub-track-content',
      transform: {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        rotation: 0,
        opacity: 1,
      },
    })

    const subComp = makeTestSubComposition({
      id: 'sub-comp-1',
      name: 'Masked precomp',
      items: [maskItem, contentItem],
      tracks: [
        makeNestedTimelineTrack({ id: 'sub-track-mask', name: 'Mask', order: 0 }),
        makeNestedTimelineTrack({ id: 'sub-track-content', name: 'Content', order: 1 }),
      ],
    })

    storeTestSubComposition(subComp)

    const compositionItem = makeParentCompositionItem({
      compositionId: subComp.id,
    })

    const { container } = render(CompositionContentHarness, {
      itemProps: { item: compositionItem, muted: false, masks: [] },
    })

    // Regression guard: mask control shapes inside precomp should not render as
    // regular timeline items when viewed from parent timeline.
    expect(container.querySelectorAll('[data-sequence-from]')).toHaveLength(1)

    // Regression guard: sub-comp mask should still clip child content in parent view.
    expect(container.querySelector('[style*="clip-path"]')).not.toBeNull()
  })

  it('does not apply a sub-comp mask to content above the mask track', async () => {
    const maskItem = makeClipMask({
      id: 'sub-mask',
      trackId: 'sub-track-mask',
      label: 'Mask shape',
    })

    const contentItem = makeNestedShapeItem({
      id: 'sub-content',
      trackId: 'sub-track-content',
      transform: {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        rotation: 0,
        opacity: 1,
      },
    })

    const subComp = makeTestSubComposition({
      id: 'sub-comp-1',
      name: 'Unmasked precomp',
      items: [maskItem, contentItem],
      tracks: [
        makeNestedTimelineTrack({ id: 'sub-track-mask', name: 'Mask', order: 1 }),
        makeNestedTimelineTrack({ id: 'sub-track-content', name: 'Content', order: 0 }),
      ],
    })

    storeTestSubComposition(subComp)

    const compositionItem = makeParentCompositionItem({
      compositionId: subComp.id,
    })

    const { container } = render(CompositionContentHarness, {
      itemProps: { item: compositionItem, muted: false, masks: [] },
    })

    expect(container.querySelector('[style*="clip-path"]')).toBeNull()
  })
})

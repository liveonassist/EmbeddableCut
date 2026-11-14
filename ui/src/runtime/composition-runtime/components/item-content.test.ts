// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/svelte'
import type { CompositionItem, ControllerItem } from '@/types/timeline'
import ItemContentHarness from './item-content.harness.svelte'

vi.mock('@/runtime/composition-runtime/deps/player', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/runtime/composition-runtime/deps/player')>()),
  useClockPlaybackRate: () => ({ current: 1 }),
}))

describe('ItemContent', () => {
  it('accepts a Null Object controller without rendering pixels', () => {
    const controller: ControllerItem = {
      id: 'null-1',
      type: 'controller',
      controllerKind: 'null',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 30,
      label: 'Null Object',
      transform: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        aspectRatioLocked: true,
        cornerRadius: 0,
      },
      speed: 1,
    }

    const { container } = render(ItemContentHarness, { item: controller })

    // Only Svelte's comment anchors remain: no elements, no text.
    expect(container.children).toHaveLength(0)
    expect(container.textContent).toBe('')
  })

  it('applies wrapper crop to flattened composition content', () => {
    const composition: CompositionItem = {
      id: 'composition-1',
      type: 'composition',
      compositionId: 'sub-comp-1',
      compositionWidth: 1920,
      compositionHeight: 1080,
      trackId: 'track-1',
      from: 0,
      durationInFrames: 30,
      label: 'Compound clip',
      crop: { left: 0.25 },
      transform: {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
        rotation: 0,
        opacity: 1,
      },
    }

    render(ItemContentHarness, { item: composition, compositionContent: true })

    const cropSurface = screen.getByTestId('composition-content').parentElement
    expect(cropSurface?.style.width).toBe('100%')
    expect(cropSurface?.style.height).toBe('100%')
    expect(cropSurface?.style.maskImage).toContain('linear-gradient')
  })
})

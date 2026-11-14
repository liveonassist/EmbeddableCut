// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ShapeItem } from '@/types/timeline'
import { useGizmoStore } from '@/features/editor/deps/preview'
import { useItemsStore, useKeyframesStore } from '@/features/editor/deps/timeline-store'
import LayoutSection from './layout-section.svelte'
import { layoutTestState } from './layout-section.test-state'

vi.mock('../components', async () => ({
  PropertySection: (await import('./layout-section-section.stub.svelte')).default,
  PropertyRow: (await import('./layout-section-row.stub.svelte')).default,
  NumberInput: (await import('./layout-section-number-input.stub.svelte')).default,
  SliderInput: (await import('./layout-section-slider-input.stub.svelte')).default,
}))

vi.mock('@/features/editor/deps/keyframes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/editor/deps/keyframes')>()
  return {
    ...actual,
    KeyframeToggle: (await import('./layout-section-keyframe-toggle.stub.svelte')).default,
  }
})

const SHAPE: ShapeItem = {
  id: 'shape-1',
  type: 'shape',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 120,
  label: 'Shape',
  shapeType: 'rectangle',
  fillColor: '#ffffff',
  strokeWidth: 0,
  transform: {
    x: 100,
    y: 80,
    width: 400,
    height: 220,
    rotation: 0,
    opacity: 1,
  },
}

const CANVAS = { width: 1920, height: 1080, fps: 30 }

function layoutProps(item: ShapeItem = SHAPE) {
  return {
    items: [item],
    canvas: CANVAS,
    onTransformChange: vi.fn(),
    aspectLocked: false,
    onAspectLockToggle: vi.fn(),
  }
}

describe('LayoutSection live gizmo position', () => {
  beforeEach(() => {
    layoutTestState.sectionMountCount = 0
    layoutTestState.keyframeUpdateCounts = { x: 0, y: 0 }
    useItemsStore.getState().setItems([SHAPE])
    useKeyframesStore.setState({ keyframesByItemId: {} })
    useGizmoStore.setState({
      activeGizmo: null,
      previewTransform: null,
      presentationHandoff: null,
      preview: null,
    })
  })

  it('updates only the X/Y leaves during drag and settles from the canonical item', () => {
    const view = render(LayoutSection, layoutProps())

    const sectionMountCount = layoutTestState.sectionMountCount
    const xKeyframeUpdateCount = layoutTestState.keyframeUpdateCounts.x
    const yKeyframeUpdateCount = layoutTestState.keyframeUpdateCounts.y
    const startTransform = {
      x: 100,
      y: 80,
      width: 400,
      height: 220,
      rotation: 0,
      opacity: 1,
    }

    const interactionId = useGizmoStore
      .getState()
      .startTranslate(SHAPE.id, { x: 0, y: 0 }, startTransform)
    flushSync()

    for (const [x, y] of [
      [180, 130],
      [310, 205],
      [470, 290],
    ] as const) {
      useGizmoStore.setState({
        previewTransform: { ...startTransform, x, y },
      })
      flushSync()
      expect(screen.getByRole('textbox', { name: 'number-X' })).toHaveValue(String(x))
      expect(screen.getByRole('textbox', { name: 'number-Y' })).toHaveValue(String(y))
    }

    expect(layoutTestState.sectionMountCount).toBe(sectionMountCount)
    expect(layoutTestState.keyframeUpdateCounts.x).toBe(xKeyframeUpdateCount)
    expect(layoutTestState.keyframeUpdateCounts.y).toBe(yKeyframeUpdateCount)

    useItemsStore.getState()._updateItemTransform(SHAPE.id, { x: 470, y: 290 })
    useGizmoStore.getState().clearInteraction(interactionId)
    flushSync()

    expect(screen.getByRole('textbox', { name: 'number-X' })).toHaveValue('470')
    expect(screen.getByRole('textbox', { name: 'number-Y' })).toHaveValue('290')
    expect(layoutTestState.sectionMountCount).toBe(sectionMountCount)

    view.rerender({
      items: [
        {
          ...SHAPE,
          transform: { ...SHAPE.transform!, x: 470, y: 290 },
        },
      ],
    })
    flushSync()

    expect(layoutTestState.keyframeUpdateCounts.x).toBe(xKeyframeUpdateCount)
    expect(layoutTestState.keyframeUpdateCounts.y).toBe(yKeyframeUpdateCount)
  })

  it('settles linked position values from the canonical source', () => {
    const source: ShapeItem = {
      ...SHAPE,
      id: 'source',
      transform: { ...SHAPE.transform!, x: 25, y: 15 },
    }
    const target: ShapeItem = {
      ...SHAPE,
      id: 'target',
      transform: { ...SHAPE.transform!, x: -20, y: -30 },
    }
    useItemsStore.getState().setItems([source, target])
    useKeyframesStore.setState({
      keyframesByItemId: {
        [source.id]: {
          itemId: source.id,
          properties: [
            {
              property: 'x',
              keyframes: [{ id: 'source-x', frame: 0, value: 325, easing: 'linear' }],
            },
            {
              property: 'y',
              keyframes: [{ id: 'source-y', frame: 0, value: 215, easing: 'linear' }],
            },
          ],
        },
        [target.id]: {
          itemId: target.id,
          properties: [],
          expressions: [
            {
              type: 'link',
              targetProperty: 'x',
              sourceItemId: source.id,
              sourceProperty: 'x',
              enabled: true,
              timeOffsetFrames: 0,
            },
            {
              type: 'link',
              targetProperty: 'y',
              sourceItemId: source.id,
              sourceProperty: 'y',
              enabled: true,
              timeOffsetFrames: 0,
            },
          ],
        },
      },
    })

    render(LayoutSection, layoutProps(target))

    expect(screen.getByRole('textbox', { name: 'number-X' })).toHaveValue('325')
    expect(screen.getByRole('textbox', { name: 'number-Y' })).toHaveValue('215')

    useKeyframesStore.setState((state) => ({
      keyframesByItemId: {
        ...state.keyframesByItemId,
        [source.id]: {
          itemId: source.id,
          properties: [
            {
              property: 'x',
              keyframes: [{ id: 'source-x', frame: 0, value: 510, easing: 'linear' }],
            },
            {
              property: 'y',
              keyframes: [{ id: 'source-y', frame: 0, value: 340, easing: 'linear' }],
            },
          ],
        },
      },
    }))
    flushSync()

    expect(screen.getByRole('textbox', { name: 'number-X' })).toHaveValue('510')
    expect(screen.getByRole('textbox', { name: 'number-Y' })).toHaveValue('340')
  })
})

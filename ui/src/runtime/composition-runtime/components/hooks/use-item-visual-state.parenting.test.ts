// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { ItemKeyframes } from '@/types/keyframe'
import type { ControllerItem, ShapeItem, TimelineItem } from '@/types/timeline'
import type { ResolvedTransform } from '@/types/transform'
import { createTransformParentBinding } from '@/shared/utils/transform-parenting'
import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
import type { LiveItemTransformSource } from '../../contexts/live-item-transform-context.svelte'
import VisualStateHarness from './use-item-visual-state.harness.svelte'

function resolvedTransform(overrides: Partial<ResolvedTransform> = {}): ResolvedTransform {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    anchorX: 50,
    anchorY: 50,
    rotation: 0,
    opacity: 1,
    cornerRadius: 0,
    ...overrides,
  }
}

const nullObject: ControllerItem = {
  id: 'null-1',
  type: 'controller',
  controllerKind: 'null',
  trackId: 'null-track',
  from: 0,
  durationInFrames: 120,
  label: 'Null Object',
  transform: resolvedTransform(),
}

const child: ShapeItem = {
  id: 'child-1',
  type: 'shape',
  shapeType: 'rectangle',
  trackId: 'child-track',
  from: 0,
  durationInFrames: 120,
  label: 'Child',
  fillColor: '#3b82f6',
  strokeWidth: 0,
  transform: resolvedTransform(),
  transformParent: createTransformParentBinding({
    childLocal: resolvedTransform(),
    childWorld: resolvedTransform(),
    parentItemId: nullObject.id,
    parentWorld: resolvedTransform(),
  }),
}

function act(fn: () => void) {
  fn()
  flushSync()
}

describe('useItemVisualState parenting', () => {
  afterEach(() => {
    cleanup()
    useGizmoStore.getState().cancelInteraction()
    useGizmoStore.getState().clearPreview()
    useGizmoStore.getState().setSnappingEnabled(true)
  })

  it('moves a child during its parent Null pointer drag before mouseup', () => {
    render(VisualStateHarness, {
      id: 'parenting-preview',
      item: child,
      items: [nullObject, child],
      keyframes: [],
      plan: 'none',
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('0')

    act(() => {
      const gizmo = useGizmoStore.getState()
      gizmo.setSnappingEnabled(false)
      gizmo.startTranslate(nullObject.id, { x: 0, y: 0 }, resolvedTransform())
      gizmo.updateInteraction({ x: 120, y: 0 }, false)
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('120')
  })

  it('keeps a child transform stable when its parent drag is presented imperatively', () => {
    render(VisualStateHarness, {
      id: 'parenting-imperative-preview',
      item: child,
      items: [nullObject, child],
      keyframes: [],
      plan: 'imperative-parent',
    })

    act(() => {
      const gizmo = useGizmoStore.getState()
      gizmo.setSnappingEnabled(false)
      gizmo.startTranslate(nullObject.id, { x: 0, y: 0 }, resolvedTransform())
      gizmo.updateInteraction({ x: 120, y: 0 }, false)
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('0')
  })

  it('keeps the transform stable while a parented item uses the imperative drag preview', () => {
    const movedParent: ControllerItem = {
      ...nullObject,
      transform: resolvedTransform({ x: 100 }),
    }
    const movedChild: ShapeItem = {
      ...child,
      transform: resolvedTransform({ x: 10, width: 20, height: 20 }),
      transformParent: createTransformParentBinding({
        childLocal: resolvedTransform({ x: 10, width: 20, height: 20 }),
        childWorld: resolvedTransform({ x: 10, width: 20, height: 20 }),
        parentItemId: movedParent.id,
        parentWorld: resolvedTransform(),
      }),
    }

    render(VisualStateHarness, {
      id: 'parented-child-gizmo-preview',
      item: movedChild,
      items: [movedParent, movedChild],
      keyframes: [],
      plan: 'none',
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('110')

    act(() => {
      const gizmo = useGizmoStore.getState()
      gizmo.setSnappingEnabled(false)
      gizmo.startTranslate(
        movedChild.id,
        { x: 110, y: 0 },
        resolvedTransform({ x: 110, width: 20, height: 20 }),
        0,
        'shape',
      )
      gizmo.updateInteraction({ x: 130, y: 0 }, false)
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('110')
  })

  it('moves a child during a coalesced parent Position preview before commit', () => {
    render(VisualStateHarness, {
      id: 'parenting-position-preview',
      item: child,
      items: [nullObject, child],
      keyframes: [],
      plan: 'none',
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('0')

    act(() => {
      useGizmoStore.getState().setTransformPreview({
        [nullObject.id]: { x: 80, y: 0 },
      })
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('80')
  })

  it('re-resolves a child from a live parent transform without replacing scene props', () => {
    let liveState = {
      itemById: {
        [nullObject.id]: nullObject as TimelineItem,
        [child.id]: child as TimelineItem,
      },
    }
    const listeners = new Set<() => void>()
    const liveSource: LiveItemTransformSource = {
      getState: () => liveState,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }

    render(VisualStateHarness, {
      id: 'parenting-live-transform',
      item: child,
      items: [nullObject, child],
      keyframes: [],
      plan: 'none',
      liveSource,
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('0')

    act(() => {
      const movedParent = {
        ...nullObject,
        transform: resolvedTransform({ x: 140 }),
      }
      liveState = {
        itemById: {
          ...liveState.itemById,
          [movedParent.id]: movedParent,
        },
      }
      for (const listener of listeners) listener()
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('140')
  })

  it('moves a Position-linked target during its source preview before commit', () => {
    const linkedTarget: ShapeItem = {
      ...child,
      id: 'linked-target',
      transformParent: undefined,
    }
    const linkedTargetKeyframes: ItemKeyframes = {
      itemId: linkedTarget.id,
      properties: [],
      expressions: [
        {
          type: 'link',
          targetProperty: 'position',
          sourceItemId: nullObject.id,
          sourceProperty: 'position',
          enabled: true,
          timeOffsetFrames: 0,
        },
      ],
    }
    render(VisualStateHarness, {
      id: 'linked-position-preview',
      item: linkedTarget,
      items: [nullObject, linkedTarget],
      keyframes: [linkedTargetKeyframes],
      plan: 'none',
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('0')

    act(() => {
      useGizmoStore.getState().setTransformPreview({
        [nullObject.id]: { x: 95, y: 0 },
      })
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('95')
    expect(nullObject.transform?.x).toBe(0)
  })

  it('re-resolves a Position link when source and target use different parent bases', () => {
    const parent = {
      ...nullObject,
      transform: resolvedTransform({ x: 100 }),
    }
    const sourceLocal = resolvedTransform({ x: 10 })
    const source: ShapeItem = {
      ...child,
      id: 'parented-source',
      transform: sourceLocal,
      transformParent: createTransformParentBinding({
        childLocal: sourceLocal,
        childWorld: resolvedTransform({ x: 110 }),
        parentItemId: parent.id,
        parentWorld: resolvedTransform({ x: 100 }),
      }),
    }
    const target: ShapeItem = {
      ...child,
      id: 'root-target',
      transformParent: undefined,
    }
    const targetKeyframes: ItemKeyframes = {
      itemId: target.id,
      properties: [],
      propertyLinks: [
        {
          type: 'link',
          targetProperty: 'position',
          sourceItemId: source.id,
          sourceProperty: 'position',
          enabled: true,
          timeOffsetFrames: 0,
        },
      ],
    }
    const items: TimelineItem[] = [parent, source, target]

    render(VisualStateHarness, {
      id: 'linked-position-different-bases',
      item: target,
      items: items,
      keyframes: [targetKeyframes],
      plan: 'planned',
    })

    expect(screen.getByTestId('transform-x')).toHaveTextContent('10')

    act(() => {
      const gizmo = useGizmoStore.getState()
      gizmo.setSnappingEnabled(false)
      gizmo.startTranslate(source.id, { x: 110, y: 0 }, resolvedTransform({ x: 110 }))
      gizmo.updateInteraction({ x: 130, y: 0 }, false)
    })

    // The source's world drag resolves to local x=30 before the root target
    // consumes the Position link. The probe would remain at x=10 if this
    // mismatched basis were incorrectly routed through the imperative bridge.
    expect(screen.getByTestId('transform-x')).toHaveTextContent('30')
  })
})

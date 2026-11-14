// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
import { renderHook } from '../../../test/render-hook.svelte'
import { useItemGizmoPreview } from './use-item-gizmo-preview.svelte'

const transform = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
}

/** Counts how often a reader of every returned field re-runs (React's render count). */
function renderCountingHook(itemId: string) {
  const counter = { renders: 0 }
  const rendered = renderHook(() => {
    const preview = useItemGizmoPreview(
      () => itemId,
      () => ({ imperativeTranslate: true }),
    )
    $effect(() => {
      void preview.activeGizmo
      void preview.previewTransform
      void preview.itemPreview
      counter.renders += 1
    })
    return preview
  })
  return { ...rendered, counter }
}

describe('useItemGizmoPreview', () => {
  beforeEach(() => {
    useGizmoStore.getState().cancelInteraction()
  })

  it('does not re-render item content for translate pointer updates', () => {
    const { result, counter } = renderCountingHook('polygon')

    useGizmoStore.getState().startTranslate('polygon', { x: 0, y: 0 }, transform, 0, 'shape')
    flushSync()
    const renderCountAfterStart = counter.renders

    useGizmoStore.getState().updateInteraction({ x: 24, y: 12 }, false)
    flushSync()

    expect(counter.renders).toBe(renderCountAfterStart)
    expect(result.current.activeGizmo).toEqual({
      itemId: 'polygon',
      mode: 'translate',
    })
    expect(result.current.previewTransform).toBeNull()
  })

  it('does not wake an unrelated item when another item is translated', () => {
    const { counter } = renderCountingHook('text')
    const initialRenderCount = counter.renders

    useGizmoStore.getState().startTranslate('polygon', { x: 0, y: 0 }, transform, 0, 'shape')
    useGizmoStore.getState().updateInteraction({ x: 24, y: 12 }, false)
    flushSync()

    expect(counter.renders).toBe(initialRenderCount)
  })
})

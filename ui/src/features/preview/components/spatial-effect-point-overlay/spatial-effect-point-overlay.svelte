<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { untrack } from 'svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import type { ItemEffect } from '@/types/effects'
  import type { TimelineItem } from '@/types/timeline'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { applyAutoKeyframeOperations, setItemEffects, useKeyframesStore } from '@/features/preview/deps/timeline-store'
  import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
  import type { CoordinateParams, Point } from '@/features/preview/types/gizmo'
  import { screenToCanvas } from '@/features/preview/utils/coordinate-transform'
  import { planEffectGizmoCommit } from '@/features/preview/utils/effect-gizmo-keyframes'
  import { canvasPointToSpatialEffectUv } from '@/features/preview/utils/spatial-effect-coordinates'
  import { buildSpatialPointEffects } from '../spatial-effect-point-overlay-utils'

  interface SpatialEffectPointOverlayProps {
    coordParams: CoordinateParams
    playerSize: { width: number; height: number }
    item: TimelineItem
    effect: ItemEffect
    xParam: string
    yParam: string
  }

  function readPoint(effect: ItemEffect, xParam: string, yParam: string): Point | null {
    if (effect.effect.type !== 'gpu-effect') return null
    const x = effect.effect.params[xParam]
    const y = effect.effect.params[yParam]
    return {
      x: typeof x === 'number' ? x : 0.5,
      y: typeof y === 'number' ? y : 0.5,
    }
  }

  function pointerToCanvasUv(
    event: Pick<PointerEvent & { currentTarget: HTMLElement }, 'clientX' | 'clientY'>,
    coordParams: CoordinateParams,
  ): Point {
    const projectPoint = screenToCanvas(event.clientX, event.clientY, coordParams)
    return canvasPointToSpatialEffectUv(projectPoint, coordParams.projectSize)
  }
</script>

<script lang="ts">
  let { coordParams, playerSize, item, effect: editedEffect, xParam, yParam }: SpatialEffectPointOverlayProps = $props()
  const handleRef: { current: HTMLButtonElement | null } = { current: null }
  const dragPointerIdRef: { current: number | null } = { current: null }
  const dragEffectsRef: { current: ItemEffect[] | null } = { current: null }
  const pendingPointRef: { current: Point | null } = { current: null }
  const previewFrameRef: { current: number | null } = { current: null }
  const setEffectsPreviewNew = useGizmoStore.getState().setEffectsPreviewNew
  const clearPreviewForItems = useGizmoStore.getState().clearPreviewForItems
  const previewEffect = selectDerived(useGizmoStore, (s) =>
    s.preview?.[item.id]?.effects?.find((entry) => entry.id === editedEffect.id))
  const itemKeyframes = selectDerived(useKeyframesStore, (s) => s.keyframesByItemId[item.id])
  const point = $derived(readPoint(previewEffect.current ?? editedEffect, xParam, yParam))
  const currentEffects = $derived.by(() =>
      (item.effects ?? []).map((entry) =>
        entry.id === editedEffect.id && previewEffect.current ? previewEffect.current : entry,
      ))

  const updateHandle = (nextPoint: Point) => {
    if (!handleRef.current) return
    handleRef.current.style.left = `${nextPoint.x * 100}%`
    handleRef.current.style.top = `${nextPoint.y * 100}%`
  }

  const applyPreview = (nextPoint: Point) => {
      setEffectsPreviewNew({
        [item.id]: buildSpatialPointEffects(
          dragEffectsRef.current ?? currentEffects,
          editedEffect.id,
          xParam,
          yParam,
          nextPoint,
        ),
      })
    }

  const schedulePreview = (nextPoint: Point) => {
      pendingPointRef.current = nextPoint
      if (previewFrameRef.current !== null) return
      previewFrameRef.current = requestAnimationFrame(() => {
        previewFrameRef.current = null
        const pendingPoint = pendingPointRef.current
        pendingPointRef.current = null
        if (pendingPoint) applyPreview(pendingPoint)
      })
    }

  const commit = (nextPoint: Point) => {
      const updates = { [xParam]: nextPoint.x, [yParam]: nextPoint.y }
      const plan = planEffectGizmoCommit(
        item,
        editedEffect,
        itemKeyframes.current,
        usePlaybackStore.getState().currentFrame,
        updates,
      )
      if (plan.autoKeyframeOperations.length > 0) {
        applyAutoKeyframeOperations(plan.autoKeyframeOperations)
      }
      const baseParamKeys = Object.keys(plan.baseParamUpdates)
      if (baseParamKeys.length > 0) {
        const rawPoint = readPoint(editedEffect, xParam, yParam) ?? nextPoint
        const basePoint = {
          x: plan.baseParamUpdates[xParam] ?? rawPoint.x,
          y: plan.baseParamUpdates[yParam] ?? rawPoint.y,
        }
        setItemEffects([
          {
            itemId: item.id,
            effects: buildSpatialPointEffects(
              dragEffectsRef.current ?? currentEffects,
              editedEffect.id,
              xParam,
              yParam,
              basePoint,
              [xParam, yParam],
            ),
          },
        ])
      }
      clearPreviewForItems([item.id])
    }

  $effect(() => {
    if (point && dragPointerIdRef.current === null) updateHandle(point)
  })

  $effect(() => untrack(() => () => {
      if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current)
    }))

  const handlePointerDown = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
      event.preventDefault()
      event.stopPropagation()
      dragPointerIdRef.current = event.pointerId
      dragEffectsRef.current = currentEffects
      event.currentTarget.setPointerCapture?.(event.pointerId)
    }

  const handlePointerMove = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
      if (dragPointerIdRef.current !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      const nextPoint = pointerToCanvasUv(event, coordParams)
      updateHandle(nextPoint)
      schedulePreview(nextPoint)
    }

  const handlePointerUp = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
      if (dragPointerIdRef.current !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      const nextPoint = pointerToCanvasUv(event, coordParams)
      dragPointerIdRef.current = null
      pendingPointRef.current = null
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current)
        previewFrameRef.current = null
      }
      updateHandle(nextPoint)
      commit(nextPoint)
      dragEffectsRef.current = null
    }

  const handlePointerCancel = () => {
    dragPointerIdRef.current = null
    dragEffectsRef.current = null
    pendingPointRef.current = null
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current)
      previewFrameRef.current = null
    }
    clearPreviewForItems([item.id])
    const originalPoint = readPoint(editedEffect, xParam, yParam)
    if (originalPoint) updateHandle(originalPoint)
  }
</script>

{#if point}
  <div
    class="pointer-events-auto absolute z-50"
    data-testid="spatial-effect-point-overlay"
    onclick={(event) => event.stopPropagation()}
    onpointerdown={(event) => event.stopPropagation()}
    oncontextmenu={(event) => {
      event.preventDefault()
      event.stopPropagation()
    }}
    style:left="0"
    style:top="0"
    style:width="{playerSize.width}px"
    style:height="{playerSize.height}px"
  >
    <button
      bind:this={handleRef.current}
      type="button"
      aria-label="Move effect center"
      title="Drag to move the effect center"
      class="pointer-events-auto absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-white bg-black/45 shadow-[0_0_0_1px_rgba(0,0,0,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      style:left={`${point.x * 100}%`}
      style:top={`${point.y * 100}%`}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerCancel}
    >
      <span
        class="pointer-events-none absolute left-1/2 top-1 h-4 -translate-x-1/2 border-l border-white"
      ></span>
      <span
        class="pointer-events-none absolute left-1 top-1/2 w-4 -translate-y-1/2 border-t border-white"
      ></span>
      <span
        class="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
      ></span>
    </button>
  </div>
{/if}

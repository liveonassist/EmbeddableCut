<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { cssStyle } from '@/features/preview/utils/css-style'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import type { ItemEffect } from '@/types/effects'
  import type { TimelineItem } from '@/types/timeline'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
  import { applyAutoKeyframeOperations, setItemEffects, useKeyframesStore } from '@/features/preview/deps/timeline-store'
  import type { CoordinateParams, Point } from '@/features/preview/types/gizmo'
  import { screenToCanvas } from '@/features/preview/utils/coordinate-transform'
  import { planEffectGizmoCommit } from '@/features/preview/utils/effect-gizmo-keyframes'
  import { buildPowerWindowEffects, derivePowerWindowDragParams, readPowerWindowParams, type PowerWindowDragState, type PowerWindowHandle, type PowerWindowParams } from '../power-window-overlay-utils'

  interface PowerWindowOverlayProps {
    coordParams: CoordinateParams
    playerSize: { width: number; height: number }
    item: TimelineItem
    effect: ItemEffect
  }

  const HANDLE_SIZE = 14

  const POWER_WINDOW_NUMBER_KEYS = ['centerX', 'centerY', 'sizeX', 'sizeY', 'rotation'] as const

  function pointerToCanvasUv(
    event: Pick<PointerEvent & { currentTarget: HTMLElement }, 'clientX' | 'clientY'>,
    coordParams: CoordinateParams,
  ): Point {
    const projectPoint = screenToCanvas(event.clientX, event.clientY, coordParams)
    return {
      x: projectPoint.x / coordParams.projectSize.width,
      y: projectPoint.y / coordParams.projectSize.height,
    }
  }
</script>

<script lang="ts">
  let { coordParams, effect, item, playerSize }: PowerWindowOverlayProps = $props()
  const dragRef: { current: PowerWindowDragState | null } = { current: null }
  const dragEffectsRef: { current: ItemEffect[] | null } = { current: null }
  const setEffectsPreviewNew = useGizmoStore.getState().setEffectsPreviewNew
  const clearPreviewForItems = useGizmoStore.getState().clearPreviewForItems
  const previewEffect = selectDerived(useGizmoStore, (s) =>
    s.preview?.[item.id]?.effects?.find((entry) => entry.id === effect.id))
  const itemKeyframes = selectDerived(useKeyframesStore, (s) => s.keyframesByItemId[item.id])

  const params = $derived(readPowerWindowParams(previewEffect.current ?? effect))
  const currentEffects = $derived.by(() =>
      (item.effects ?? []).map((entry) =>
        entry.id === effect.id && previewEffect.current ? previewEffect.current : entry,
      ))
  const canvasAspectRatio = $derived(coordParams.projectSize.width / Math.max(coordParams.projectSize.height, 1))

  const applyPreview = (nextParams: PowerWindowParams) => {
      setEffectsPreviewNew({
        [item.id]: buildPowerWindowEffects(
          dragEffectsRef.current ?? currentEffects,
          effect.id,
          nextParams,
        ),
      })
    }

  const commit = (nextParams: PowerWindowParams, startParams: PowerWindowParams) => {
      const changedUpdates: Record<string, number> = {}
      for (const key of POWER_WINDOW_NUMBER_KEYS) {
        if (nextParams[key] !== startParams[key]) changedUpdates[key] = nextParams[key]
      }
      const plan = planEffectGizmoCommit(
        item,
        effect,
        itemKeyframes.current,
        usePlaybackStore.getState().currentFrame,
        changedUpdates,
      )
      if (plan.autoKeyframeOperations.length > 0) {
        applyAutoKeyframeOperations(plan.autoKeyframeOperations)
      }
      if (Object.keys(plan.baseParamUpdates).length > 0) {
        const rawParams = readPowerWindowParams(effect) ?? startParams
        const baseParams: PowerWindowParams = { ...rawParams, ...plan.baseParamUpdates }
        setItemEffects([
          {
            itemId: item.id,
            effects: buildPowerWindowEffects(
              dragEffectsRef.current ?? currentEffects,
              effect.id,
              baseParams,
              POWER_WINDOW_NUMBER_KEYS,
            ),
          },
        ])
      }
      clearPreviewForItems([item.id])
    }

  const handlePointerDown = (handle: PowerWindowHandle, event: PointerEvent & { currentTarget: HTMLElement }) => {
      if (!params) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      dragRef.current = {
        handle,
        startParams: params,
        startUv: pointerToCanvasUv(event, coordParams),
      }
      dragEffectsRef.current = currentEffects
    }

  const handlePointerMove = (event: PointerEvent & { currentTarget: HTMLElement }) => {
      const drag = dragRef.current
      if (!drag || event.buttons !== 1) return
      event.preventDefault()
      event.stopPropagation()
      applyPreview(
        derivePowerWindowDragParams(drag, pointerToCanvasUv(event, coordParams), {
          canvasAspectRatio,
          snapRotation: event.shiftKey,
        }),
      )
    }

  const handlePointerUp = (event: PointerEvent & { currentTarget: HTMLElement }) => {
      const drag = dragRef.current
      if (!drag) return
      event.preventDefault()
      event.stopPropagation()
      const nextParams = derivePowerWindowDragParams(drag, pointerToCanvasUv(event, coordParams), {
        canvasAspectRatio,
        snapRotation: event.shiftKey,
      })
      dragRef.current = null
      commit(nextParams, drag.startParams)
      dragEffectsRef.current = null
    }

  const handleStyle = {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }
  const shapeBorderRadius = $derived(params?.shape === 'rectangle' ? '2px' : '50%')
</script>

{#if params}
  <div
    class="pointer-events-auto absolute z-50"
    data-testid="power-window-overlay"
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
    <div
      class="absolute border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.65)]"
      style:left={`${params.centerX * 100}%`}
      style:top={`${params.centerY * 100}%`}
      style:width={`${params.sizeX * 100}%`}
      style:height={`${params.sizeY * 100}%`}
      style:border-radius={shapeBorderRadius}
      style:transform={`translate(-50%, -50%) rotate(${params.rotation}deg)`}
    >
      <button
        type="button"
        aria-label="Move power window"
        class="pointer-events-auto absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-black/70 bg-white shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
        onpointerdown={(event) => handlePointerDown('center', event)}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
      ></button>
      {#each (
          [
            ['east', 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
            ['west', 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize'],
            ['north', 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize'],
            ['south', 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize'],
          ] as const
        ) as [handle, className] (handle)}
        <button
          type="button"
          aria-label={`Resize power window ${handle}`}
          class={`pointer-events-auto absolute rounded-full border border-black/70 bg-white shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white ${className}`}
          style={cssStyle(handleStyle)}
          onpointerdown={(event) => handlePointerDown(handle, event)}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
        ></button>
      {/each}
      <div
        class="pointer-events-none absolute -top-[22px] left-1/2 h-[22px] border-l border-dashed border-white/90 shadow-[1px_0_0_rgba(0,0,0,0.65)]"
        aria-hidden="true"
      ></div>
      <button
        type="button"
        aria-label="Rotate power window"
        title="Rotate power window · Hold Shift to snap to 15°"
        class="pointer-events-auto absolute -top-7 left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-black/70 bg-white shadow-sm active:cursor-grabbing focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
        onpointerdown={(event) => handlePointerDown('rotation', event)}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
      ></button>
    </div>
  </div>
{/if}

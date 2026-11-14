<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { evaluateMonotoneCurve } from '@/shared/utils/curve-spline'
  import {
    GPU_CURVES_MAX_POINTS,
    GPU_CURVES_POINT_MIN_GAP,
    readGpuCurvesChannelPoints,
    type GpuCurvesChannelKey,
    type GpuCurvesControlPoint,
  } from '@/shared/utils/gpu-curves'
  import type { GpuEffect } from '@/types/effects'

  type ChannelPointsDraft = Record<GpuCurvesChannelKey, GpuCurvesControlPoint[]>

  interface DragState {
    channel: GpuCurvesChannelKey
    index: number
  }

  const CURVE_SIZE = 230
  const CURVE_SAMPLE_STEPS = 64
  const CHANNELS: Array<{ key: GpuCurvesChannelKey; labelKey: string; color: string }> = [
    { key: 'master', labelKey: 'effects.curves.channelMaster', color: '#e5e7eb' },
    { key: 'red', labelKey: 'effects.curves.channelRed', color: '#ef4444' },
    { key: 'green', labelKey: 'effects.curves.channelGreen', color: '#22c55e' },
    { key: 'blue', labelKey: 'effects.curves.channelBlue', color: '#3b82f6' },
  ]

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  function readAllChannelPoints(params: GpuEffect['params']): ChannelPointsDraft {
    return {
      master: readGpuCurvesChannelPoints(params, 'master'),
      red: readGpuCurvesChannelPoints(params, 'red'),
      green: readGpuCurvesChannelPoints(params, 'green'),
      blue: readGpuCurvesChannelPoints(params, 'blue'),
    }
  }

  function buildSampledCurvePath(points: GpuCurvesControlPoint[], size: number): string {
    const segments: string[] = []
    for (let i = 0; i <= CURVE_SAMPLE_STEPS; i += 1) {
      const x = i / CURVE_SAMPLE_STEPS
      const y = evaluateMonotoneCurve(points, x)
      const command = i === 0 ? 'M' : 'L'
      segments.push(`${command} ${(x * size).toFixed(2)} ${((1 - y) * size).toFixed(2)}`)
    }
    return segments.join(' ')
  }

  /**
   * Endpoints keep their x locked to 0/1 (y free); interior points stay strictly
   * ordered by clamping x between their neighbors with a minimum gap.
   */
  function clampDraggedPoint(
    points: GpuCurvesControlPoint[],
    index: number,
    position: GpuCurvesControlPoint,
  ): GpuCurvesControlPoint | null {
    const lastIndex = points.length - 1
    const y = clamp(position.y, 0, 1)
    if (index === 0) return { x: 0, y }
    if (index === lastIndex) return { x: 1, y }

    const previous = points[index - 1]
    const next = points[index + 1]
    if (!previous || !next) return null

    const min = previous.x + GPU_CURVES_POINT_MIN_GAP
    const max = next.x - GPU_CURVES_POINT_MIN_GAP
    const x = min > max ? (previous.x + next.x) / 2 : clamp(position.x, min, max)
    return { x, y }
  }

  function getInsertIndexForCurvePoint(
    points: GpuCurvesControlPoint[],
    position: GpuCurvesControlPoint,
  ): number | null {
    if (points.length >= GPU_CURVES_MAX_POINTS) return null

    const firstGreaterIndex = points.findIndex((point) => position.x < point.x)
    const rawInsertIndex = firstGreaterIndex === -1 ? points.length : firstGreaterIndex
    const insertIndex = clamp(rawInsertIndex, 1, points.length - 1)
    const previous = points[insertIndex - 1]
    const next = points[insertIndex]
    if (!previous || !next) return null

    const minGap = GPU_CURVES_POINT_MIN_GAP / 2
    if (position.x - previous.x < minGap || next.x - position.x < minGap) {
      return null
    }

    return insertIndex
  }

  function getKeyboardPointDelta(event: KeyboardEvent): GpuCurvesControlPoint | null {
    const step = event.shiftKey ? 0.05 : 0.01
    if (event.key === 'ArrowLeft') return { x: -step, y: 0 }
    if (event.key === 'ArrowRight') return { x: step, y: 0 }
    if (event.key === 'ArrowDown') return { x: 0, y: -step }
    if (event.key === 'ArrowUp') return { x: 0, y: step }
    return null
  }

  function isRemovePointKey(key: string): boolean {
    return key === 'Delete' || key === 'Backspace'
  }
</script>

<script lang="ts">
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import { Button } from '@/components/ui/button'
  import { PropertyRow } from '@/shared/ui/property-controls'
  import { cn } from '@/shared/ui/cn'
  import { attachWindowDragListeners } from '@/shared/utils/window-drag-listeners'
  import {
    buildGpuCurvesChannelPoints,
    getDefaultGpuCurvesChannelControl,
    getGpuCurvesPointsParamKey,
    GPU_CURVES_CHANNELS,
    isGpuCurvesChannelIdentity,
    sanitizeGpuCurvesChannelPoints,
    serializeGpuCurvesChannelPoints,
    toGpuCurvesChannelParamUpdates,
  } from '@/shared/utils/gpu-curves'
  import { getEffectDefinitionName } from '@/features/effects/utils/effect-i18n'
  import { t } from '$lib/i18n.svelte'
  import { EffectPanelHeaderRow } from './effect-panel-header-actions'
  import type { GpuPanelBaseProps, GpuParamUpdates } from './panel-props'

  interface GpuCurvesPanelProps extends GpuPanelBaseProps {
    layout?: 'sidebar' | 'dock'
    onParamsBatchChange: (effectId: string, updates: GpuParamUpdates) => void
    onParamsBatchLiveChange: (effectId: string, updates: GpuParamUpdates) => void
  }

  let {
    effect: itemEffect,
    gpuEffect,
    definition,
    layout = 'sidebar',
    collapsible = false,
    onEditInColor,
    onParamsBatchChange,
    onParamsBatchLiveChange,
    onReset,
    onToggle,
    onRemove,
    onMove,
    canMoveUp,
    canMoveDown,
  }: GpuCurvesPanelProps = $props()

  const isDock = $derived(layout === 'dock')
  // Collapse only in the sidebar — the dock is the dedicated grading surface.
  const allowCollapse = $derived(collapsible && !isDock)
  // svelte-ignore state_referenced_locally
  let collapsed = $state(allowCollapse)
  const showBody = $derived(!(allowCollapse && collapsed))
  let svg: SVGSVGElement | null = $state(null)
  let svgSize = $state({ width: CURVE_SIZE, height: CURVE_SIZE })
  let activeChannel = $state<GpuCurvesChannelKey>('master')
  let dragging = $state(false)
  // svelte-ignore state_referenced_locally
  let draft = $state.raw<ChannelPointsDraft>(readAllChannelPoints(gpuEffect.params))
  // svelte-ignore state_referenced_locally
  let draftRef = draft

  let drag: DragState | null = null
  const rafRef: { current: number | null } = { current: null }
  let pendingPosition: GpuCurvesControlPoint | null = null

  const updateChannelDraft = (channel: GpuCurvesChannelKey, points: GpuCurvesControlPoint[]) => {
    draftRef = { ...draftRef, [channel]: points }
    draft = draftRef
  }

  $effect(() => {
    if (dragging) return
    const next = readAllChannelPoints(gpuEffect.params)
    draftRef = next
    draft = next
  })

  const isDefault = $derived(
    GPU_CURVES_CHANNELS.every((channel) => isGpuCurvesChannelIdentity(draft[channel])),
  )

  const activeChannelMeta = $derived(CHANNELS.find((channel) => channel.key === activeChannel)!)
  const activeChannelLabel = $derived(t(activeChannelMeta.labelKey))
  const activePoints = $derived(draft[activeChannel])

  const curvePaths = $derived(
    Object.fromEntries(
      GPU_CURVES_CHANNELS.map((channel) => [
        channel,
        buildSampledCurvePath(draft[channel], CURVE_SIZE),
      ]),
    ) as Record<GpuCurvesChannelKey, string>,
  )

  const getNormalizedPointFromClient = (clientX: number, clientY: number) => {
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp(1 - (clientY - rect.top) / rect.height, 0, 1),
    }
  }

  $effect(() => {
    const element = svg
    if (!element) return

    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      svgSize = { width: rect.width, height: rect.height }
    }

    updateSize()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  })

  const moveDraggedPoint = (
    state: DragState,
    position: GpuCurvesControlPoint,
  ): GpuCurvesControlPoint[] | null => {
    const points = draftRef[state.channel]
    if (state.index < 0 || state.index >= points.length) return null
    const moved = clampDraggedPoint(points, state.index, position)
    if (!moved) return null
    return points.map((point, index) => (index === state.index ? moved : point))
  }

  $effect(() => {
    const flushDragFrame = () => {
      rafRef.current = null
      const state = drag
      const position = pendingPosition
      if (!state || !position) return
      const points = moveDraggedPoint(state, position)
      if (!points) return
      updateChannelDraft(state.channel, points)
      onParamsBatchLiveChange(itemEffect.id, {
        [getGpuCurvesPointsParamKey(state.channel)]: serializeGpuCurvesChannelPoints(points),
      })
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!drag) return
      const position = getNormalizedPointFromClient(event.clientX, event.clientY)
      if (!position) return
      pendingPosition = position
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flushDragFrame)
      }
    }

    const handleMouseUp = (event: MouseEvent) => {
      const state = drag
      if (!state) return

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      const position = getNormalizedPointFromClient(event.clientX, event.clientY)
      const moved = position ? moveDraggedPoint(state, position) : null
      const points = sanitizeGpuCurvesChannelPoints(moved ?? draftRef[state.channel])

      updateChannelDraft(state.channel, points)
      onParamsBatchChange(itemEffect.id, {
        [getGpuCurvesPointsParamKey(state.channel)]: serializeGpuCurvesChannelPoints(points),
      })

      drag = null
      pendingPosition = null
      dragging = false
    }

    return attachWindowDragListeners(handleMouseMove, handleMouseUp, rafRef)
  })

  const handlePointMouseDown = (event: MouseEvent, index: number) => {
    if (!itemEffect.enabled || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const points = draftRef[activeChannel]
    const isEndpoint = index === 0 || index === points.length - 1

    if (event.detail >= 2) {
      // Double-click removes interior points; endpoints are fixed.
      if (isEndpoint) return
      const nextPoints = points.filter((_, pointIndex) => pointIndex !== index)
      updateChannelDraft(activeChannel, nextPoints)
      onParamsBatchChange(itemEffect.id, {
        [getGpuCurvesPointsParamKey(activeChannel)]: serializeGpuCurvesChannelPoints(nextPoints),
      })
      return
    }

    drag = { channel: activeChannel, index }
    dragging = true
  }

  const handlePointKeyDown = (event: KeyboardEvent, index: number) => {
    if (!itemEffect.enabled) return

    const points = draftRef[activeChannel]
    const point = points[index]
    if (!point) return

    const isEndpoint = index === 0 || index === points.length - 1
    if (isRemovePointKey(event.key) && !isEndpoint) {
      event.preventDefault()
      const nextPoints = points.filter((_, pointIndex) => pointIndex !== index)
      updateChannelDraft(activeChannel, nextPoints)
      onParamsBatchChange(itemEffect.id, {
        [getGpuCurvesPointsParamKey(activeChannel)]: serializeGpuCurvesChannelPoints(nextPoints),
      })
      return
    }

    const delta = getKeyboardPointDelta(event)
    if (!delta) return
    event.preventDefault()

    const nextPoint = clampDraggedPoint(points, index, {
      x: point.x + delta.x,
      y: point.y + delta.y,
    })
    if (!nextPoint) return
    const nextPoints = sanitizeGpuCurvesChannelPoints(
      points.map((candidate, pointIndex) => (pointIndex === index ? nextPoint : candidate)),
    )
    updateChannelDraft(activeChannel, nextPoints)
    onParamsBatchChange(itemEffect.id, {
      [getGpuCurvesPointsParamKey(activeChannel)]: serializeGpuCurvesChannelPoints(nextPoints),
    })
  }

  const handleSvgMouseDown = (event: MouseEvent) => {
    if (!itemEffect.enabled || event.button !== 0 || drag) return

    const position = getNormalizedPointFromClient(event.clientX, event.clientY)
    if (!position) return

    const points = draftRef[activeChannel]
    const insertIndex = getInsertIndexForCurvePoint(points, position)
    if (insertIndex === null) return

    event.preventDefault()
    const nextPoints = [
      ...points.slice(0, insertIndex),
      { x: position.x, y: position.y },
      ...points.slice(insertIndex),
    ]
    updateChannelDraft(activeChannel, nextPoints)
    onParamsBatchLiveChange(itemEffect.id, {
      [getGpuCurvesPointsParamKey(activeChannel)]: serializeGpuCurvesChannelPoints(nextPoints),
    })

    // The new point is grabbed immediately; mouseup commits it.
    drag = { channel: activeChannel, index: insertIndex }
    dragging = true
  }

  const handleResetChannel = () => {
    const updates: Record<string, number | string> = {
      [getGpuCurvesPointsParamKey(activeChannel)]: '',
      ...toGpuCurvesChannelParamUpdates(activeChannel, getDefaultGpuCurvesChannelControl()),
    }
    updateChannelDraft(
      activeChannel,
      buildGpuCurvesChannelPoints(getDefaultGpuCurvesChannelControl()),
    )
    onParamsBatchChange(itemEffect.id, updates)
  }

  const resetChannelLabel = $derived(t('effects.curves.resetChannel'))
  const pointScaleX = $derived(Math.max(svgSize.width / CURVE_SIZE, 0.001))
  const pointScaleY = $derived(Math.max(svgSize.height / CURVE_SIZE, 0.001))
  const pointScreenScale = $derived(Math.min(pointScaleX, pointScaleY))
  const pointRadiusX = $derived((6 * pointScreenScale) / pointScaleX)
  const pointRadiusY = $derived((6 * pointScreenScale) / pointScaleY)
  const pointStrokeWidth = $derived(
    (1.5 * pointScreenScale) / Math.max(pointScaleX, pointScaleY),
  )
</script>

{#snippet channelControls()}
  <div
    class={cn(
      'flex items-center gap-1 justify-end',
      isDock ? 'min-w-0 flex-nowrap' : 'flex-wrap',
    )}
  >
    {#each CHANNELS as channel (channel.key)}
      <Button
        variant={activeChannel === channel.key ? 'secondary' : 'outline'}
        size="sm"
        class={cn('h-7 text-xs', isDock ? 'shrink-0 px-1.5' : 'px-2')}
        onclick={() => (activeChannel = channel.key)}
      >
        {t(channel.labelKey)}
      </Button>
    {/each}
    <Button
      variant="ghost"
      size={isDock ? 'icon' : 'sm'}
      class={cn('h-7 text-xs', isDock ? 'w-7 shrink-0' : 'px-2')}
      onclick={handleResetChannel}
      disabled={!itemEffect.enabled}
      title={resetChannelLabel}
      aria-label={resetChannelLabel}
    >
      {#if isDock}
        <RotateCcw class="h-3 w-3" />
      {:else}
        {resetChannelLabel}
      {/if}
    </Button>
  </div>
{/snippet}

<div class={cn('space-y-0', isDock && 'flex h-full min-h-0 flex-col overflow-hidden')}>
  <EffectPanelHeaderRow
    label={getEffectDefinitionName(definition)}
    effectId={itemEffect.id}
    enabled={itemEffect.enabled}
    {isDefault}
    {onReset}
    {onToggle}
    {onRemove}
    {onMove}
    {canMoveUp}
    {canMoveDown}
    collapsed={allowCollapse ? collapsed : undefined}
    onToggleCollapsed={allowCollapse ? () => (collapsed = !collapsed) : undefined}
    {onEditInColor}
  />

  {#if showBody}
    {#if isDock}
      <div class="flex h-9 shrink-0 items-center justify-between gap-2 px-2">
        <span class="text-xs text-muted-foreground">{t('effects.curves.channel')}</span>
        {@render channelControls()}
      </div>
    {:else}
      <PropertyRow label={t('effects.curves.channel')}>{@render channelControls()}</PropertyRow>
    {/if}
  {/if}

  {#if showBody}
    <div class={cn('px-2', isDock && 'flex min-h-0 flex-1 pb-2')}>
      <div
        class={cn(
          'relative overflow-hidden rounded border border-border/70 bg-black/50',
          isDock && 'flex min-h-0 flex-1',
        )}
      >
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <svg
          bind:this={svg}
          data-curves-editor="true"
          aria-label={t('effects.curves.editorAriaLabel', {
            channel: activeChannelLabel,
            defaultValue: `${activeChannelLabel} curve editor`,
          })}
          viewBox={`0 0 ${CURVE_SIZE} ${CURVE_SIZE}`}
          preserveAspectRatio={isDock ? 'none' : 'xMidYMid meet'}
          class={cn(
            isDock ? 'h-full w-full' : 'aspect-square w-full',
            itemEffect.enabled ? 'cursor-crosshair' : 'cursor-default',
          )}
          onmousedown={handleSvgMouseDown}
        >
          {#each [0.25, 0.5, 0.75] as grid (grid)}
            <g>
              <line
                x1={grid * CURVE_SIZE}
                y1={0}
                x2={grid * CURVE_SIZE}
                y2={CURVE_SIZE}
                stroke="rgba(148,163,184,0.22)"
                stroke-width={1}
                vector-effect="non-scaling-stroke"
              />
              <line
                x1={0}
                y1={grid * CURVE_SIZE}
                x2={CURVE_SIZE}
                y2={grid * CURVE_SIZE}
                stroke="rgba(148,163,184,0.22)"
                stroke-width={1}
                vector-effect="non-scaling-stroke"
              />
            </g>
          {/each}

          <path
            d={`M 0 ${CURVE_SIZE} L ${CURVE_SIZE} 0`}
            stroke="rgba(148,163,184,0.35)"
            stroke-width={1}
            fill="none"
            stroke-dasharray="4 4"
            vector-effect="non-scaling-stroke"
          />

          {#if activeChannel === 'master'}
            <path
              d={curvePaths.red}
              stroke="#ef4444"
              stroke-width={1.2}
              fill="none"
              opacity={0.35}
              vector-effect="non-scaling-stroke"
            />
            <path
              d={curvePaths.green}
              stroke="#22c55e"
              stroke-width={1.2}
              fill="none"
              opacity={0.35}
              vector-effect="non-scaling-stroke"
            />
            <path
              d={curvePaths.blue}
              stroke="#3b82f6"
              stroke-width={1.2}
              fill="none"
              opacity={0.35}
              vector-effect="non-scaling-stroke"
            />
          {/if}

          {#if activeChannel !== 'master'}
            <path
              d={curvePaths.master}
              stroke="rgba(229,231,235,0.35)"
              stroke-width={1.2}
              fill="none"
              stroke-dasharray="5 4"
              vector-effect="non-scaling-stroke"
            />
          {/if}

          <path
            d={curvePaths[activeChannel]}
            stroke={activeChannelMeta.color}
            stroke-width={2}
            fill="none"
            vector-effect="non-scaling-stroke"
          />

          {#each activePoints as point, index (`${activeChannel}-${index}`)}
            {@const x = point.x * CURVE_SIZE}
            {@const y = (1 - point.y) * CURVE_SIZE}
            <g>
              <line
                x1={x}
                y1={CURVE_SIZE}
                x2={x}
                y2={y}
                stroke={activeChannelMeta.color}
                stroke-width={1}
                opacity={0.18}
                vector-effect="non-scaling-stroke"
              />
              <ellipse
                data-curve-point={index}
                tabindex={itemEffect.enabled ? 0 : -1}
                role="slider"
                aria-label={t('effects.curves.pointAriaLabel', {
                  channel: activeChannelLabel,
                  index: index + 1,
                  defaultValue: `${activeChannelLabel} curve point ${index + 1}`,
                })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(point.y * 100)}
                aria-valuetext={`input ${Math.round(point.x * 100)}%, output ${Math.round(point.y * 100)}%`}
                cx={x}
                cy={y}
                rx={pointRadiusX}
                ry={pointRadiusY}
                fill={activeChannelMeta.color}
                stroke="rgba(3,7,18,0.95)"
                stroke-width={pointStrokeWidth}
                class={itemEffect.enabled ? 'cursor-move' : 'pointer-events-none'}
                onmousedown={(event) => handlePointMouseDown(event, index)}
                onkeydown={(event) => handlePointKeyDown(event, index)}
              />
            </g>
          {/each}
        </svg>
      </div>
      {#if !isDock}
        <div class="mt-1 text-center text-[10px] text-muted-foreground">
          {t('effects.curves.multiPointHint', { channel: activeChannelLabel.toLowerCase() })}
        </div>
      {/if}
    </div>
  {/if}
</div>

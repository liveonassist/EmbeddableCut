<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { formatRulerSeconds } from './dopesheet-live-ruler-layout'

  /**
   * Ruler tick labels. Standalone axes show item-local frames; a linked main
   * timeline axis shows the timeline's own frame numbers.
   */
  function formatRulerTick(
    frame: number,
    rulerLabelFrameOffset: number,
    rulerUnit: 'frames' | 'seconds',
    fps: number,
  ): string {
    const displayFrame = frame + rulerLabelFrameOffset
    if (rulerUnit === 'frames' || !fps || fps <= 0) {
      return String(displayFrame)
    }
    return formatRulerSeconds(displayFrame / fps)
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { RULER_HEIGHT } from './dopesheet-constants'
  import type { Ref } from '../ref-state.svelte'

  type RulerPointerEvent = PointerEvent & { currentTarget: HTMLDivElement }

  interface DopesheetRulerHeaderProps {
    /** Inline style for the property/timeline grid (`grid-template-columns: …`). */
    propertyGridStyle: string
    timelineRef: Ref<HTMLDivElement | null>
    onRulerPointerDown: (event: RulerPointerEvent) => void
    onRulerPointerMove: (event: RulerPointerEvent) => void
    onRulerPointerUp: (event: RulerPointerEvent) => void
    onRulerPointerLeave: (event: RulerPointerEvent) => void
    /** Tick marks the standalone axis draws; the linked-axis canvas replaces them. */
    ticks: number[]
    frameToX: (frame: number) => number
    fps: number
    rulerUnit: 'frames' | 'seconds'
    rulerLabelFrameOffset: number
    liveRulerCanvas?: Snippet
    reservedRightGutterWidth?: number
    propertyFilter?: 'all' | 'keyframed'
    onPropertyFilterChange?: (filter: 'all' | 'keyframed') => void
  }

  let {
    propertyGridStyle,
    timelineRef,
    onRulerPointerDown,
    onRulerPointerMove,
    onRulerPointerUp,
    onRulerPointerLeave,
    ticks,
    frameToX,
    fps,
    rulerUnit,
    rulerLabelFrameOffset,
    liveRulerCanvas,
    reservedRightGutterWidth = 0,
    propertyFilter = 'all',
    onPropertyFilterChange,
  }: DopesheetRulerHeaderProps = $props()

  /**
   * Major ticks with a pooled minor-tick background between them. The layer spans
   * from the first to the last tick plus one major spacing so the pooled gradient
   * lands on the same pixels as the marks it sits under.
   */
  const tickLayout = $derived.by(() => {
    const firstTick = ticks[0]
    const lastTick = ticks[ticks.length - 1]
    const secondTick = ticks[1]
    const hasMinorTicks = firstTick !== undefined && lastTick !== undefined && ticks.length > 1
    const firstX = firstTick === undefined ? 0 : frameToX(firstTick)
    const majorSpacing =
      hasMinorTicks && secondTick !== undefined ? Math.abs(frameToX(secondTick) - firstX) : 0
    const minorSpacing = majorSpacing / 4
    return {
      minorLayer:
        hasMinorTicks && firstTick !== undefined && lastTick !== undefined
          ? {
              left: Math.round(firstX),
              width: Math.ceil(frameToX(lastTick) - firstX + majorSpacing),
              minorSpacing,
            }
          : null,
    }
  })
</script>

<div class="grid border-b border-border bg-muted/25" style={propertyGridStyle}>
  <div
    class="flex items-center justify-between gap-2 px-1 text-[10px] font-medium text-muted-foreground"
    style:height="{RULER_HEIGHT}px"
  >
    <span>{t('timeline.keyframeEditor.property')}</span>
    {#if onPropertyFilterChange}
      <div
        role="group"
        aria-label={t('timeline.keyframeEditor.propertyVisibility')}
        class="flex h-[18px] shrink-0 items-center rounded border border-border/70 bg-background/70 p-px"
      >
        {#each ['keyframed', 'all'] as const as filter (filter)}
          {@const selected = propertyFilter === filter}
          <button
            type="button"
            aria-pressed={selected}
            class="h-4 rounded px-1.5 text-[9px] leading-none transition-colors {selected
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => onPropertyFilterChange(filter)}
          >
            {t(
              filter === 'keyframed'
                ? 'timeline.keyframeEditor.animatedProperties'
                : 'timeline.keyframeEditor.allProperties',
            )}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    data-testid="dopesheet-ruler"
    bind:this={timelineRef.current}
    class="relative border-l border-border cursor-ew-resize overflow-x-clip"
    style:height="{RULER_HEIGHT}px"
    onpointerdown={onRulerPointerDown}
    onpointermove={onRulerPointerMove}
    onpointerup={onRulerPointerUp}
    onpointercancel={onRulerPointerUp}
    onpointerleave={onRulerPointerLeave}
  >
    {#if liveRulerCanvas}
      {@render liveRulerCanvas()}
    {:else}
      <div data-motion-viewport-surface data-motion-ruler-surface class="absolute inset-0">
        {#if tickLayout.minorLayer}
          <div
            data-dopesheet-ruler-minor-ticks
            class="pointer-events-none absolute bottom-0 h-1"
            style:left="{tickLayout.minorLayer.left}px"
            style:width="{tickLayout.minorLayer.width}px"
            style:background-image="linear-gradient(to right, rgba(255, 255, 255, 0.14) 1px, transparent 1px)"
            style:background-size="{tickLayout.minorLayer.minorSpacing}px 100%"
          ></div>
        {/if}
        {#each ticks as frame (frame)}
          <div
            data-dopesheet-ruler-major-tick
            class="pointer-events-none absolute bottom-0 h-2 border-l border-white/30"
            style:left="{Math.round(frameToX(frame))}px"
          >
            <span
              class="absolute bottom-[7px] left-1 whitespace-nowrap text-[10px] text-muted-foreground"
              >{formatRulerTick(frame, rulerLabelFrameOffset, rulerUnit, fps)}</span
            >
          </div>
        {/each}
      </div>
    {/if}
    {#if reservedRightGutterWidth > 0}
      <div
        data-testid="dopesheet-ruler-scrollbar-gutter"
        class="pointer-events-none absolute inset-y-0 right-0 z-10 border-l border-border/60 bg-background/80"
        style:width="{reservedRightGutterWidth}px"
      ></div>
    {/if}
  </div>
</div>

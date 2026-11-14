<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Classic Edit layout: a compact header with the frame inputs, a bordered sheet
   * taking the rest of the panel, and its own scrolling viewport.
   */
  import Scissors from 'lucide-svelte/icons/scissors'
  import { cn } from '@/shared/ui/cn'
  import { Button } from '@/components/ui/button'
  import DopesheetHeaderFrameInputs from '../dopesheet-header-frame-inputs.svelte'
  import { RULER_HEIGHT } from '../dopesheet-constants'
  import type { DopesheetClassicPresentationProps } from './types'

  let {
    pickWhipRootRef,
    class: className,
    height,
    width,
    disabled,
    t,
    keyframeCount,
    trimmedKeyframeCount,
    onTrimAnimation,
    headerFrameInputs,
    viewportInteractionEnabled,
    handleWheel,
    affectedFrameRangeOverlayElement,
    effectiveTimelineWidth,
    columnWidth,
    skimPlayheadOverlayElement,
    playheadOverlayElement,
    rulerHeaderElement,
    sheetBodyElement,
  }: DopesheetClassicPresentationProps = $props()
</script>

<div
  bind:this={pickWhipRootRef.current}
  data-testid="dopesheet-editor-root"
  class={cn('flex h-full flex-col gap-0.5 overflow-hidden', className)}
  style:height="{height}px"
  style:width="{width}px"
>
  <div class="flex min-h-7 flex-shrink-0 items-center justify-between gap-2 px-1">
    <div class="flex min-w-0 items-center gap-2">
      <span class="whitespace-nowrap text-xs text-muted-foreground">
        {t('timeline.keyframeEditor.keyframes', {
          count: keyframeCount,
        })}
      </span>
      {#if trimmedKeyframeCount > 0 && onTrimAnimation}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 gap-1 px-1.5 text-[10px] text-amber-300 hover:text-amber-200"
          onclick={onTrimAnimation}
          title={t('timeline.keyframeEditor.trimAnimationHint', {
            count: trimmedKeyframeCount,
          })}
        >
          <Scissors class="h-3 w-3" />
          {t('timeline.keyframeEditor.trimmedKeyframes', {
            count: trimmedKeyframeCount,
          })}
        </Button>
      {/if}
      <DopesheetHeaderFrameInputs {...headerFrameInputs} />
    </div>
  </div>

  <div
    class={cn(
      'relative min-h-0 flex-1 overflow-hidden border border-border',
      disabled && 'pointer-events-none opacity-60',
    )}
    onwheel={viewportInteractionEnabled ? handleWheel : undefined}
  >
    {#if affectedFrameRangeOverlayElement}
      <div
        data-motion-viewport-surface
        data-motion-viewport-axis-width={effectiveTimelineWidth}
        class="pointer-events-none absolute bottom-0 right-0 z-[5] overflow-hidden"
        style:left="{columnWidth}px"
        style:top="{RULER_HEIGHT}px"
      >
        {@render affectedFrameRangeOverlayElement()}
      </div>
    {/if}
    {@render skimPlayheadOverlayElement?.()}
    {@render playheadOverlayElement?.()}
    {@render rulerHeaderElement?.()}
    {@render sheetBodyElement?.()}
  </div>
</div>

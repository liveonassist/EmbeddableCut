<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Link2Off from 'lucide-svelte/icons/link-2-off'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import ClipLabelIndicators from './clip-label-indicators.svelte'
  import {
    hasClipLabelIndicators,
    type ClipIndicatorsProps,
    type ClipLabelIndicatorsProps,
  } from './types'

  /** Renders status indicators and badges on timeline clips. */
  let {
    hasKeyframes,
    keyframesExpanded,
    hasMotion,
    currentSpeed,
    isReversed,
    reverseConformStatus,
    isStretching,
    stretchFeedback,
    isBroken,
    hasMediaId,
    isMask,
    isShape,
    onKeyframesToggle,
    onMotionOpen,
  }: ClipIndicatorsProps = $props()

  const showSpeedBadge = $derived(Math.abs(currentSpeed - 1) > 0.005 && !isStretching)
  const labelIndicatorProps: ClipLabelIndicatorsProps = $derived({
    hasKeyframes,
    keyframesExpanded,
    hasMotion,
    isShapeMask: isShape && isMask,
    showSpeedBadge,
    currentSpeed,
    isReversed,
    reverseConformStatus,
    onKeyframesToggle,
    onMotionOpen,
  })
</script>

{#if hasClipLabelIndicators(labelIndicatorProps)}
  <ClipLabelIndicators {...labelIndicatorProps} />
{/if}

{#if isBroken && hasMediaId}
  <div
    class="absolute bottom-1 right-1 p-0.5 rounded bg-destructive/90 text-destructive-foreground"
    title={t('timeline.clipIndicators.mediaMissing')}
  >
    <Link2Off class="w-3 h-3" />
  </div>
{/if}

<div
  class={cn(
    'absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none z-10 transition-opacity duration-75',
    isStretching && stretchFeedback ? 'opacity-100' : 'opacity-0',
  )}
>
  <span class="text-white font-mono text-sm font-bold">
    {stretchFeedback?.speed.toFixed(2) ?? '1.00'}x
  </span>
</div>

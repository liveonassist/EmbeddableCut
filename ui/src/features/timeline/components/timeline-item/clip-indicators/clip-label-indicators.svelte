<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles'
  import { t } from '$lib/i18n.svelte'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import KeyframeIndicator from './keyframe-indicator.svelte'
  import ReverseIndicator from './reverse-indicator.svelte'
  import { stopClipIndicatorEvent, type ClipLabelIndicatorsProps } from './types'

  let {
    hasKeyframes,
    keyframesExpanded,
    hasMotion,
    isShapeMask,
    showSpeedBadge,
    currentSpeed,
    isReversed,
    reverseConformStatus,
    onKeyframesToggle,
    onMotionOpen,
  }: ClipLabelIndicatorsProps = $props()
</script>

<div
  class="absolute right-6 z-40 pointer-events-none flex items-center gap-1"
  style:top="0"
  style:height={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
>
  {#if hasKeyframes}
    <KeyframeIndicator expanded={keyframesExpanded} onToggle={onKeyframesToggle} />
  {/if}
  {#if hasMotion}
    <button
      type="button"
      class="pointer-events-auto rounded-sm p-0.5 text-sky-400 hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
      title={t('timeline.clipIndicators.hasMotion')}
      aria-label={t('timeline.clipIndicators.hasMotion')}
      onpointerdown={stopClipIndicatorEvent}
      onmousedown={stopClipIndicatorEvent}
      onclick={(event) => {
        stopClipIndicatorEvent(event)
        onMotionOpen?.()
      }}
    >
      <WandSparkles class="w-3 h-3 text-sky-400" />
    </button>
  {/if}
  {#if isShapeMask}
    <span
      class="px-1 py-0.5 text-[10px] font-bold bg-cyan-500/80 text-white rounded"
      title={t('timeline.clipIndicators.mask')}
    >
      M
    </span>
  {/if}
  {#if showSpeedBadge}
    <span
      class="px-1 py-0.5 text-[10px] font-bold bg-black/60 text-white rounded font-mono"
      title={t('timeline.clipIndicators.speed', { speed: currentSpeed.toFixed(2) })}
    >
      {currentSpeed.toFixed(2)}x
    </span>
  {/if}
  {#if isReversed}
    <ReverseIndicator status={reverseConformStatus} />
  {/if}
  {#if reverseConformStatus === 'pending'}
    <span
      class="px-1 py-0.5 text-[10px] font-bold bg-sky-600/80 text-white rounded font-mono"
      title={t('timeline.clipIndicators.preparingReversed')}
    >
      PREP
    </span>
  {/if}
  {#if reverseConformStatus === 'error'}
    <span
      class="px-1 py-0.5 text-[10px] font-bold bg-red-600/80 text-white rounded font-mono"
      title={t('timeline.clipIndicators.reversePrepFailedShort')}
    >
      ERR
    </span>
  {/if}
</div>

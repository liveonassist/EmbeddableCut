<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import type { AudioFadeHandle } from '@/features/timeline/utils/audio-fade'
  import FloatingReadout from './floating-readout.svelte'

  interface VideoFadeHandlesProps {
    trackLocked: boolean
    activeTool: string
    lineYPercent: number
    fadeInPercent: number
    fadeOutPercent: number
    isSelected: boolean
    isEditing: boolean
    editingHandle?: AudioFadeHandle | null
    fadeInLabel?: string
    fadeOutLabel?: string
    onFadeHandleMouseDown: (e: MouseEvent, handle: AudioFadeHandle) => void
    onFadeHandleDoubleClick: (handle: AudioFadeHandle) => void
  }

  let {
    trackLocked,
    activeTool,
    lineYPercent,
    fadeInPercent,
    fadeOutPercent,
    isSelected,
    isEditing,
    editingHandle = null,
    fadeInLabel,
    fadeOutLabel,
    onFadeHandleMouseDown,
    onFadeHandleDoubleClick,
  }: VideoFadeHandlesProps = $props()

  let hoveredHandle = $state<AudioFadeHandle | null>(null)
  let fadeInHandle = $state<HTMLButtonElement | null>(null)
  let fadeOutHandle = $state<HTMLButtonElement | null>(null)

  $effect(() => {
    void isEditing
    untrack(() => {
      if (!isEditing) {
        hoveredHandle = null
      }
    })
  })

  const handleVisibilityClass = $derived(
    isEditing || isSelected ? 'opacity-100' : 'opacity-0 group-hover/timeline-item:opacity-100',
  )
  const densityVisibilityClass = $derived(
    isEditing ? 'opacity-100' : 'opacity-0 @min-[44px]:opacity-40 @min-[64px]:opacity-100',
  )
  const densityPointerClass = $derived(
    isEditing ? 'pointer-events-auto' : 'pointer-events-none @min-[44px]:pointer-events-auto',
  )
  const fadeInLeft = $derived(Math.max(0, Math.min(100, fadeInPercent)))
  const fadeOutLeft = $derived(Math.max(0, Math.min(100, 100 - fadeOutPercent)))
  const visibleLabelHandle = $derived(editingHandle ?? hoveredHandle)
  const visibleLabel = $derived(
    visibleLabelHandle === 'in' ? fadeInLabel : visibleLabelHandle === 'out' ? fadeOutLabel : null,
  )
  const visibleLabelAnchor = $derived(visibleLabelHandle === 'in' ? fadeInHandle : fadeOutHandle)
  const handleTop = '-2px'

  const handleClass = $derived(
    cn(
      'absolute h-2.5 w-2.5 -translate-x-1/2 rounded-[2px] border transition-opacity cursor-ew-resize touch-none before:absolute before:-inset-[9px] before:content-[""] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-l-[3px] after:border-r-[3px] after:border-t-[4px] after:border-l-transparent after:border-r-transparent focus-visible:outline-none',
      'border-slate-950/70 bg-white after:border-t-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.25)]',
      densityPointerClass,
      handleVisibilityClass,
    ),
  )

  function stopClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }
</script>

{#if !trackLocked && activeTool === 'select'}
  <div
    data-clip-fade-controls="video"
    class={cn(
      'absolute inset-0 pointer-events-none z-30 transition-opacity duration-150',
      densityVisibilityClass,
    )}
  >
    <button
      bind:this={fadeInHandle}
      type="button"
      class={handleClass}
      style:left="{fadeInLeft}%"
      style:top={handleTop}
      onclick={stopClick}
      onmousedown={(e) => {
        hoveredHandle = 'in'
        onFadeHandleMouseDown(e, 'in')
      }}
      ondblclick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onFadeHandleDoubleClick('in')
      }}
      onmouseenter={() => (hoveredHandle = 'in')}
      onmouseleave={() => {
        if (!isEditing && hoveredHandle === 'in') hoveredHandle = null
      }}
      aria-label={t('timeline.fadeHandles.adjustVideoFadeIn')}
    ></button>
    <button
      bind:this={fadeOutHandle}
      type="button"
      class={handleClass}
      style:left="{fadeOutLeft}%"
      style:top={handleTop}
      onclick={stopClick}
      onmousedown={(e) => {
        hoveredHandle = 'out'
        onFadeHandleMouseDown(e, 'out')
      }}
      ondblclick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onFadeHandleDoubleClick('out')
      }}
      onmouseenter={() => (hoveredHandle = 'out')}
      onmouseleave={() => {
        if (!isEditing && hoveredHandle === 'out') hoveredHandle = null
      }}
      aria-label={t('timeline.fadeHandles.adjustVideoFadeOut')}
    ></button>

    {#if visibleLabelHandle && visibleLabel}
      <FloatingReadout
        anchor={visibleLabelAnchor}
        measureKey="{visibleLabelHandle}:{visibleLabel}:{lineYPercent}:{fadeInLeft}:{fadeOutLeft}"
        offsetY={6}
        >{visibleLabel}</FloatingReadout
      >
    {/if}
  </div>
{/if}

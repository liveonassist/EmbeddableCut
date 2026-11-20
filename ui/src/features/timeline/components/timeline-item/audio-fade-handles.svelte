<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import FloatingReadout from './floating-readout.svelte'

  interface AudioFadeHandlesProps {
    trackLocked: boolean
    activeTool: string
    lineYPercent: number
    fadeInPercent: number
    fadeOutPercent: number
    isSelected: boolean
    isEditing: boolean
    editingHandle?: 'in' | 'out' | null
    curveEditingHandle: 'in' | 'out' | null
    fadeInLabel?: string
    fadeOutLabel?: string
    fadeInCurveDot?: { xPercent: number; yPercent: number } | null
    fadeOutCurveDot?: { xPercent: number; yPercent: number } | null
    onFadeHandleMouseDown: (e: MouseEvent, handle: 'in' | 'out') => void
    onFadeHandleDoubleClick: (handle: 'in' | 'out') => void
    onFadeCurveDotMouseDown: (e: MouseEvent, handle: 'in' | 'out') => void
    onFadeCurveDotDoubleClick: (handle: 'in' | 'out') => void
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
    curveEditingHandle,
    fadeInLabel,
    fadeOutLabel,
    fadeInCurveDot,
    fadeOutCurveDot,
    onFadeHandleMouseDown,
    onFadeHandleDoubleClick,
    onFadeCurveDotMouseDown,
    onFadeCurveDotDoubleClick,
  }: AudioFadeHandlesProps = $props()

  let hoveredHandle = $state<'in' | 'out' | null>(null)
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

  const isAnyEditing = $derived(isEditing || curveEditingHandle !== null)
  const handleVisibilityClass = $derived(
    isEditing || isSelected ? 'opacity-100' : 'opacity-0 group-hover/timeline-item:opacity-100',
  )
  const densityVisibilityClass = $derived(
    isAnyEditing ? 'opacity-100' : 'opacity-0 @min-[44px]:opacity-40 @min-[64px]:opacity-100',
  )
  const densityPointerClass = $derived(
    isAnyEditing ? 'pointer-events-auto' : 'pointer-events-none @min-[44px]:pointer-events-auto',
  )
  const fadeInLeft = $derived(Math.max(0, Math.min(100, fadeInPercent)))
  const fadeOutLeft = $derived(Math.max(0, Math.min(100, 100 - fadeOutPercent)))
  const visibleLabelHandle = $derived(editingHandle ?? hoveredHandle)
  const visibleLabel = $derived(
    hoveredHandle === 'in' ? fadeInLabel : hoveredHandle === 'out' ? fadeOutLabel : null,
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

  function getCurveDotClass(handle: 'in' | 'out') {
    const isActive = curveEditingHandle === handle || hoveredHandle === handle

    return cn(
      'absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[color-mix(in_oklab,var(--color-primary)_35%,white)]/90 shadow-[0_0_0_1px_rgba(15,23,42,0.2)] transition-opacity cursor-move touch-none before:absolute before:-inset-[8px] before:content-[""] focus-visible:outline-none',
      densityPointerClass,
      isActive
        ? 'bg-primary opacity-100'
        : 'bg-primary/90 opacity-0 group-hover/timeline-item:opacity-100',
    )
  }
</script>

{#if !trackLocked && activeTool === 'select'}
  <div
    data-clip-fade-controls="audio"
    class={cn(
      'absolute inset-0 pointer-events-none z-40 transition-opacity duration-150',
      densityVisibilityClass,
    )}
  >
    <button
      bind:this={fadeInHandle}
      type="button"
      class={handleClass}
      style:left="{fadeInLeft}%"
      style:top={handleTop}
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
      aria-label={t('timeline.fadeHandles.adjustAudioFadeIn')}
    ></button>
    <button
      bind:this={fadeOutHandle}
      type="button"
      class={handleClass}
      style:left="{fadeOutLeft}%"
      style:top={handleTop}
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
      aria-label={t('timeline.fadeHandles.adjustAudioFadeOut')}
    ></button>

    {#if fadeInCurveDot}
      <button
        type="button"
        class={getCurveDotClass('in')}
        style:left="{fadeInCurveDot.xPercent}%"
        style:top="{fadeInCurveDot.yPercent}%"
        onmousedown={(e) => onFadeCurveDotMouseDown(e, 'in')}
        ondblclick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onFadeCurveDotDoubleClick('in')
        }}
        onmouseenter={() => (hoveredHandle = null)}
        onmouseleave={() => {
          if (hoveredHandle === 'in') hoveredHandle = null
        }}
        aria-label={t('timeline.fadeHandles.adjustAudioFadeInCurve')}
      ></button>
    {/if}
    {#if fadeOutCurveDot}
      <button
        type="button"
        class={getCurveDotClass('out')}
        style:left="{fadeOutCurveDot.xPercent}%"
        style:top="{fadeOutCurveDot.yPercent}%"
        onmousedown={(e) => onFadeCurveDotMouseDown(e, 'out')}
        ondblclick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onFadeCurveDotDoubleClick('out')
        }}
        onmouseenter={() => (hoveredHandle = null)}
        onmouseleave={() => {
          if (hoveredHandle === 'out') hoveredHandle = null
        }}
        aria-label={t('timeline.fadeHandles.adjustAudioFadeOutCurve')}
      ></button>
    {/if}

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

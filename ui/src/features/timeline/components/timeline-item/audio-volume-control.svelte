<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import FloatingReadout from './floating-readout.svelte'

  const AUDIO_VOLUME_HOVER_ARM_DELAY_MS = 180

  interface AudioVolumeControlProps {
    trackLocked: boolean
    activeTool: string
    lineYPercent: number
    isEditing: boolean
    editLabel?: string | null
    editLabelRef?: { current: HTMLElement | null }
    onVolumeMouseDown: (e: MouseEvent) => void
    onVolumeDoubleClick: () => void
  }

  let {
    trackLocked,
    activeTool,
    lineYPercent,
    isEditing,
    editLabel,
    editLabelRef = { current: null },
    onVolumeMouseDown,
    onVolumeDoubleClick,
  }: AudioVolumeControlProps = $props()

  let isHovered = $state(false)
  let isHoverArmed = $state(false)
  let volumeHandle = $state<HTMLButtonElement | null>(null)

  $effect(() => {
    void [isEditing, isHovered]
    return untrack(() => {
      if (isEditing) {
        isHoverArmed = true
        return
      }

      if (!isHovered) {
        isHoverArmed = false
        return
      }

      const timeoutId = window.setTimeout(() => {
        isHoverArmed = true
      }, AUDIO_VOLUME_HOVER_ARM_DELAY_MS)

      return () => {
        window.clearTimeout(timeoutId)
      }
    })
  })

  const isDragEnabled = $derived(isEditing || isHoverArmed)
</script>

{#if !trackLocked && activeTool === 'select'}
  <div class="absolute inset-x-0 inset-y-0 pointer-events-none z-30">
    <button
      bind:this={volumeHandle}
      type="button"
      class="absolute left-0 right-0 h-2 -translate-y-1/2 pointer-events-auto touch-none {isDragEnabled
        ? 'cursor-ns-resize'
        : 'cursor-default'}"
      style:top="var(--timeline-audio-volume-line-y, {lineYPercent}%)"
      onmouseenter={() => (isHovered = true)}
      onmouseleave={() => (isHovered = false)}
      onclick={(e) => {
        if (!isDragEnabled) {
          return
        }
        e.preventDefault()
        e.stopPropagation()
      }}
      onmousedown={(e) => {
        if (!isDragEnabled) {
          return
        }

        e.preventDefault()
        e.stopPropagation()
        onVolumeMouseDown(e)
      }}
      ondblclick={(e) => {
        e.preventDefault()
        e.stopPropagation()

        if (isDragEnabled) {
          onVolumeDoubleClick()
        }
      }}
      tabindex={-1}
      aria-label={t('timeline.volumeControl.adjustClipVolume')}
    ></button>

    {#if isEditing && editLabel}
      <FloatingReadout anchor={volumeHandle} measureKey="{lineYPercent}:{editLabel}" offsetY={6}
        ><span bind:this={editLabelRef.current}>{editLabel}</span></FloatingReadout
      >
    {/if}
  </div>
{/if}

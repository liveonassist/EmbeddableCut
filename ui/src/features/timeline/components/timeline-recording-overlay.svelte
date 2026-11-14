<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useMicRecordingStore } from '@/shared/state/mic-recording-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'

  /**
   * Live "recording" bar drawn over the timeline while a voiceover take is being
   * captured. It grows from the record-start frame to the live playhead.
   *
   * It is NOT a real timeline item — mutating an item every frame would pollute
   * undo history and trigger transition repairs. Instead it's a lightweight
   * overlay positioned with direct real-pixel values. Anchoring the width to the
   * playhead (not an independent timer) keeps it exactly aligned with where the
   * committed clip will land, and self-heals after clock catch-up or live zoom.
   */
  const status = select(useMicRecordingStore, (s) => s.status)
  const recordStartFrame = select(useMicRecordingStore, (s) => s.recordStartFrame)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  let bar = $state<HTMLDivElement | null>(null)
  let label = $state<HTMLDivElement | null>(null)

  const active = $derived(
    status.current === 'recording' ||
      status.current === 'paused' ||
      status.current === 'finalizing',
  )

  $effect(() => {
    if (!active) return
    const el = bar
    const labelEl = label
    if (!el || !labelEl) return
    const currentFps = fps.current
    const startFrame = recordStartFrame.current

    const update = () => {
      const pixelsPerFrame =
        currentFps > 0 ? useZoomStore.getState().pixelsPerSecond / currentFps : 0
      const frames = Math.max(0, usePlaybackStore.getState().currentFrame - startFrame)
      const left = startFrame * pixelsPerFrame
      el.style.left = `${left}px`
      el.style.width = `${frames * pixelsPerFrame}px`
      labelEl.style.left = `${left}px`
    }
    update()
    const unsubscribePlayback = usePlaybackStore.subscribe((state, prev) => {
      if (state.currentFrame !== prev.currentFrame) update()
    })
    const unsubscribeZoom = useZoomStore.subscribe((state, prev) => {
      if (state.pixelsPerSecond !== prev.pixelsPerSecond) update()
    })
    return () => {
      unsubscribePlayback()
      unsubscribeZoom()
    }
  })

  // Initial geometry, sampled (not subscribed) like the effect above.
  const pixelsPerFrame = $derived(
    fps.current > 0 ? useZoomStore.getState().pixelsPerSecond / fps.current : 0,
  )
  const initialLeft = $derived(recordStartFrame.current * pixelsPerFrame)
  const initialWidth = $derived(
    Math.max(0, usePlaybackStore.getState().currentFrame - recordStartFrame.current) *
      pixelsPerFrame,
  )
</script>

{#if active}
  <div class="pointer-events-none absolute inset-x-0 bottom-1 z-10 h-10">
    <div
      bind:this={bar}
      class="absolute top-0 h-full rounded-sm border border-destructive/70 bg-destructive/20"
      style:left="{initialLeft}px"
      style:width="{initialWidth}px"
    ></div>
    <div
      bind:this={label}
      class="absolute top-1 flex items-center gap-1 rounded-sm bg-destructive/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
      style:left="{initialLeft}px"
    >
      <span
        class="h-1.5 w-1.5 rounded-full bg-white {status.current === 'recording'
          ? 'animate-pulse'
          : ''}"
        aria-hidden="true"
      ></span>
      {status.current === 'finalizing' ? t('recording.saving') : t('recording.rec')}
    </div>
  </div>
{/if}

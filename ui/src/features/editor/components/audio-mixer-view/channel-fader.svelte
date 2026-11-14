<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { getMixerLiveGain, setMixerLiveGains } from '@/shared/state/mixer-live-gain'
  import { clearLiveTrackVolumeOverride, setLiveTrackVolumeOverride } from '../audio-meter-utils'
  import {
    FADER_KNOB_HEIGHT_PX,
    dbToFaderPercent,
    dragOffsetPercentFromPointerEvent,
    faderPercentToDb,
    formatFaderDb,
    percentFromPointerEvent,
  } from './fader'

  interface ChannelFaderProps {
    trackId: string
    volumeDb: number
    /** Item IDs on this track — used to set per-item live gain during drag */
    itemIds: string[]
    /** Called once on drag end — triggers store update + markDirty */
    onVolumeChange: (trackId: string, volumeDb: number) => void
    /** The dB readout, updated during drag without re-rendering */
    dbReadout?: HTMLDivElement | null
    /** Immediate visual preview for the per-track meter while graph estimates catch up */
    onMeterPreviewChange?: (previewDb: number | null) => void
  }

  let { trackId, volumeDb, itemIds, onVolumeChange, dbReadout, onMeterPreviewChange }: ChannelFaderProps =
    $props()

  let track: HTMLDivElement | null = $state(null)
  let knob: HTMLDivElement | null = $state(null)
  let isDragging = false
  let dragOffsetPercent = 0
  // svelte-ignore state_referenced_locally
  let latestDb = volumeDb
  // svelte-ignore state_referenced_locally
  let dragStartDb = volumeDb
  let dragStartGains = new Map<string, number>()

  // Sync from props when not dragging
  $effect.pre(() => {
    const next = volumeDb
    if (!isDragging) latestDb = next
  })

  // Pure DOM update + live audio gain — zero store writes, zero renders of the composition
  function applyDragValue(db: number) {
    latestDb = db
    if (knob) {
      knob.style.top = `${100 - dbToFaderPercent(db)}%`
    }
    if (dbReadout) {
      dbReadout.textContent = formatFaderDb(db)
    }
    // Compute gain multiplier relative to the committed track volume.
    const gainRatio = Math.pow(10, (db - dragStartDb) / 20)
    setMixerLiveGains(
      itemIds.map((id) => ({
        itemId: id,
        gain: (dragStartGains.get(id) ?? 1) * gainRatio,
      })),
    )

    // Feed live volume into the meter source builder so both per-track
    // and bus meters update in real-time during drag.
    setLiveTrackVolumeOverride(trackId, db)
    onMeterPreviewChange?.(db)
  }

  function handlePointerDown(e: PointerEvent & { currentTarget: HTMLDivElement }) {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    isDragging = true
    dragStartDb = latestDb
    dragStartGains = new Map(itemIds.map((id) => [id, getMixerLiveGain(id)]))
    dragOffsetPercent = dragOffsetPercentFromPointerEvent(track, e, latestDb)
    const percent = percentFromPointerEvent(track, e)
    const adjustedPercent = Math.max(0, Math.min(100, percent + dragOffsetPercent))
    applyDragValue(Math.round(faderPercentToDb(adjustedPercent) * 10) / 10)
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return
    const percent = percentFromPointerEvent(track, e)
    const adjustedPercent = Math.max(0, Math.min(100, percent + dragOffsetPercent))
    applyDragValue(Math.round(faderPercentToDb(adjustedPercent) * 10) / 10)
  }

  function finalizeDrag(params?: {
    pointerId?: number
    target?: Pick<HTMLDivElement, 'releasePointerCapture'> | null
  }) {
    if (!isDragging) {
      return
    }

    const { pointerId, target } = params ?? {}
    isDragging = false
    dragOffsetPercent = 0
    if (target && pointerId !== undefined) {
      target.releasePointerCapture?.(pointerId)
    }
    // Commit to store first so the graph recompiles with the new value,
    // then clear the live override so the next resolution uses the compiled value.
    onVolumeChange(trackId, latestDb)
    clearLiveTrackVolumeOverride(trackId)
    onMeterPreviewChange?.(null)
  }

  function handlePointerUp(e: PointerEvent & { currentTarget: HTMLDivElement }) {
    finalizeDrag({ pointerId: e.pointerId, target: e.currentTarget })
  }

  $effect(() => {
    return () => finalizeDrag()
  })

  function handleDoubleClick() {
    applyDragValue(0)
    onVolumeChange(trackId, 0)
    clearLiveTrackVolumeOverride(trackId)
  }

  const knobPercent = $derived(dbToFaderPercent(volumeDb))
  const unityPercent = dbToFaderPercent(0)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={track}
  data-track-id={trackId}
  data-fader-root="true"
  class="relative h-full cursor-ns-resize select-none touch-none"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  ondblclick={handleDoubleClick}
>
  <!-- Fader track line -->
  <div class="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-border/70"></div>

  <!-- Unity (0 dB) notch — small horizontal ticks -->
  <div
    class="absolute left-0 right-0 flex items-center justify-center"
    style:bottom="{unityPercent}%"
    style:transform="translateY(50%)"
  >
    <div class="w-full h-px bg-muted-foreground/25"></div>
  </div>

  <!-- Fader knob — capsule shape -->
  <div
    bind:this={knob}
    data-track-id={trackId}
    data-fader-knob="true"
    class="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
    style:top="{100 - knobPercent}%"
    style:width="18px"
    style:height="{FADER_KNOB_HEIGHT_PX}px"
  >
    <!-- Knob body -->
    <div
      class="w-full h-full rounded-[4px] bg-gradient-to-b from-zinc-300 to-zinc-400 shadow-[0_1px_4px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.3)] border border-zinc-500/40"
    >
      <!-- Grip lines -->
      <div class="absolute inset-x-[3px] top-[7px] h-px bg-zinc-600/50"></div>
      <div class="absolute inset-x-[3px] top-[10px] h-px bg-zinc-600/50"></div>
      <div class="absolute inset-x-[3px] top-[13px] h-px bg-zinc-600/50"></div>
      <!-- Center notch — unity indicator -->
      <div
        class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-zinc-600/30 rounded-full mx-[2px]"
      ></div>
    </div>
  </div>
</div>

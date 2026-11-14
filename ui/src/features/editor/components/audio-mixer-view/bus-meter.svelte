<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { getMixerLiveGain, setMixerLiveGains } from '@/shared/state/mixer-live-gain'
  import {
    clearLiveBusVolumeOverride,
    linearLevelToPercent,
    setLiveBusVolumeOverride,
  } from '../audio-meter-utils'
  import {
    FADER_KNOB_HEIGHT_PX,
    SEGMENT_MASK,
    UNLIT_LED_BG,
    dbToFaderPercent,
    dragOffsetPercentFromPointerEvent,
    faderDbColor,
    faderPercentToDb,
    formatFaderDb,
    getMeterFallbackPercent,
    percentFromPointerEvent,
  } from './fader'
  import type { AudioMixerLevel } from './types'

  interface BusMeterProps {
    masterEstimate: AudioMixerLevel
    isPlaying: boolean
    volumeDb: number
    muted: boolean
    allItemIds: string[]
    onVolumeChange: (volumeDb: number) => void
    onMuteToggle: () => void
    onEqToggle?: () => void
    eqActive?: boolean
  }

  let {
    masterEstimate,
    isPlaying,
    volumeDb,
    muted,
    allItemIds,
    onVolumeChange,
    onMuteToggle,
    onEqToggle,
    eqActive = false,
  }: BusMeterProps = $props()

  let leftBar: HTMLDivElement | null = $state(null)
  let rightBar: HTMLDivElement | null = $state(null)
  let dbReadout: HTMLDivElement | null = $state(null)

  // Bus fader state
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

  function applyBusDragValue(db: number) {
    latestDb = db
    if (knob) {
      knob.style.top = `${100 - dbToFaderPercent(db)}%`
    }
    if (dbReadout) {
      dbReadout.textContent = formatFaderDb(db)
      dbReadout.className = `text-[10px] font-mono py-0.5 leading-none ${faderDbColor(db)}`
    }
    // Apply live gain to all items (bus = master gain offset)
    const gainRatio = Math.pow(10, (db - dragStartDb) / 20)
    setMixerLiveGains(
      allItemIds.map((id) => ({
        itemId: id,
        gain: (dragStartGains.get(id) ?? 1) * gainRatio,
      })),
    )
    setLiveBusVolumeOverride(db)
  }

  function handlePointerDown(e: PointerEvent & { currentTarget: HTMLDivElement }) {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    isDragging = true
    dragStartDb = latestDb
    dragStartGains = new Map(allItemIds.map((id) => [id, getMixerLiveGain(id)]))
    dragOffsetPercent = dragOffsetPercentFromPointerEvent(track, e, latestDb)
    const percent = percentFromPointerEvent(track, e)
    const adjustedPercent = Math.max(0, Math.min(100, percent + dragOffsetPercent))
    applyBusDragValue(Math.round(faderPercentToDb(adjustedPercent) * 10) / 10)
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return
    const percent = percentFromPointerEvent(track, e)
    const adjustedPercent = Math.max(0, Math.min(100, percent + dragOffsetPercent))
    applyBusDragValue(Math.round(faderPercentToDb(adjustedPercent) * 10) / 10)
  }

  function finalizeBusDrag(params?: {
    pointerId?: number
    target?: Pick<HTMLDivElement, 'releasePointerCapture'> | null
  }) {
    if (!isDragging) return
    const { pointerId, target } = params ?? {}
    isDragging = false
    dragOffsetPercent = 0
    if (target && pointerId !== undefined) {
      target.releasePointerCapture?.(pointerId)
    }
    onVolumeChange(latestDb)
    clearLiveBusVolumeOverride()
  }

  function handlePointerUp(e: PointerEvent & { currentTarget: HTMLDivElement }) {
    finalizeBusDrag({ pointerId: e.pointerId, target: e.currentTarget })
  }

  function handlePointerCancel() {
    if (!isDragging) return
    isDragging = false
    dragOffsetPercent = 0
    applyBusDragValue(volumeDb)
    clearLiveBusVolumeOverride()
  }

  $effect(() => {
    return () => finalizeBusDrag()
  })

  function handleDoubleClick() {
    applyBusDragValue(0)
    onVolumeChange(0)
    clearLiveBusVolumeOverride()
  }

  // Smooth the bus meter with CSS transitions rather than rAF
  const fallbackPercent = $derived(
    getMeterFallbackPercent({
      unresolvedSourceCount: masterEstimate.unresolvedSourceCount,
      resolvedSourceCount: masterEstimate.resolvedSourceCount,
      isPlaying,
    }),
  )
  const leftPercent = $derived(
    isPlaying ? Math.max(linearLevelToPercent(masterEstimate.left), fallbackPercent) : 0,
  )
  const rightPercent = $derived(
    isPlaying ? Math.max(linearLevelToPercent(masterEstimate.right), fallbackPercent) : 0,
  )
  const showScanningFallback = $derived(fallbackPercent > 0)

  // Update imperatively for smoother animation
  $effect(() => {
    if (leftBar) leftBar.style.height = `${leftPercent}%`
    if (rightBar) rightBar.style.height = `${rightPercent}%`
  })

  // The readout is written directly while the fader drags; render it the same way.
  $effect(() => {
    if (dbReadout) dbReadout.textContent = formatFaderDb(volumeDb)
  })

  const knobPercent = $derived(dbToFaderPercent(volumeDb))
  const unityPercent = dbToFaderPercent(0)
  const dbColor = $derived(faderDbColor(volumeDb))
</script>

<div class="flex flex-col items-center h-full w-[60px] min-w-[60px] shrink-0">
  <!-- Inset panel -->
  <div
    class="flex flex-col items-center h-full w-full rounded-[3px] bg-black/30 shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)] border border-border/20 px-1"
  >
    <!-- Label -->
    <div
      class="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 py-1 leading-tight font-mono whitespace-nowrap"
    >
      Bus 1
    </div>
    <div class="flex justify-center py-0.5 shrink-0">
      <button
        type="button"
        class="min-w-[28px] rounded-[3px] px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] transition-colors {eqActive
          ? 'border border-sky-400/50 bg-sky-500/15 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.22)]'
          : 'border border-transparent bg-muted/30 text-muted-foreground/45 hover:bg-sky-500/10 hover:text-sky-300'} {!onEqToggle
          ? 'pointer-events-none opacity-50'
          : ''}"
        onclick={() => onEqToggle?.()}
        aria-label="EQ Bus 1"
        aria-pressed={eqActive}
      >
        EQ
      </button>
    </div>

    <!-- Mute button — aligned with S/M row -->
    <div class="flex justify-center py-0.5 shrink-0">
      <button
        type="button"
        class="w-[18px] h-[16px] rounded-[3px] text-[9px] font-bold leading-none flex items-center justify-center transition-colors {muted
          ? 'bg-red-600 text-white shadow-[0_0_8px_rgba(220,38,38,0.4)]'
          : 'bg-muted/40 text-muted-foreground/40 hover:bg-muted/70 hover:text-muted-foreground/70'}"
        onclick={onMuteToggle}
        aria-label="Mute master"
        aria-pressed={muted}
      >
        M
      </button>
    </div>

    <!-- Meter bars + fader area -->
    <div class="flex-1 min-h-0 flex items-stretch gap-px py-1">
      <!-- Stereo segmented meter bars -->
      <div class="flex gap-[2px] w-[14px] shrink-0">
        <div class="relative flex-1 rounded-[2px] bg-[#08090b] overflow-hidden">
          <!-- Unlit LED backdrop -->
          <div class="absolute inset-0 pointer-events-none" style:background={UNLIT_LED_BG}></div>
          <!-- Active fill -->
          <div
            bind:this={leftBar}
            data-bus-channel="left"
            class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1be255] via-[#f5e146] to-[#ff6633] {showScanningFallback
              ? 'opacity-50'
              : ''}"
            style:height="0%"
            style:mask-image={SEGMENT_MASK}
            style:-webkit-mask-image={SEGMENT_MASK}
            style:transition="height 100ms ease-out"
          ></div>
        </div>
        <div class="relative flex-1 rounded-[2px] bg-[#08090b] overflow-hidden">
          <!-- Unlit LED backdrop -->
          <div class="absolute inset-0 pointer-events-none" style:background={UNLIT_LED_BG}></div>
          <!-- Active fill -->
          <div
            bind:this={rightBar}
            data-bus-channel="right"
            class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1be255] via-[#f5e146] to-[#ff6633] {showScanningFallback
              ? 'opacity-50'
              : ''}"
            style:height="0%"
            style:mask-image={SEGMENT_MASK}
            style:-webkit-mask-image={SEGMENT_MASK}
            style:transition="height 100ms ease-out"
          ></div>
        </div>
      </div>

      <!-- Bus fader — same hit area structure as channel faders -->
      <div class="min-w-[20px] w-[20px] shrink-0">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={track}
          data-fader-root="true"
          class="relative h-full cursor-ns-resize select-none touch-none"
          onpointerdown={handlePointerDown}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
          onpointercancel={handlePointerCancel}
          ondblclick={handleDoubleClick}
        >
          <!-- Fader track line -->
          <div class="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 bg-border/70"></div>

          <!-- Unity (0 dB) notch -->
          <div
            class="absolute left-0 right-0 flex items-center justify-center"
            style:bottom="{unityPercent}%"
            style:transform="translateY(50%)"
          >
            <div class="w-full h-px bg-muted-foreground/25"></div>
          </div>

          <!-- Fader knob — gold tint to distinguish from channel faders -->
          <div
            bind:this={knob}
            class="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style:top="{100 - knobPercent}%"
            style:width="18px"
            style:height="{FADER_KNOB_HEIGHT_PX}px"
          >
            <div
              class="w-full h-full rounded-[4px] bg-gradient-to-b from-[#d4c9a8] to-[#b8ad8e] shadow-[0_1px_4px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.25)] border border-[#9a9076]/50"
            >
              <div class="absolute inset-x-[3px] top-[7px] h-px bg-[#6b6350]/45"></div>
              <div class="absolute inset-x-[3px] top-[10px] h-px bg-[#6b6350]/45"></div>
              <div class="absolute inset-x-[3px] top-[13px] h-px bg-[#6b6350]/45"></div>
              <div
                class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-[#6b6350]/25 rounded-full mx-[2px]"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- dB readout -->
    <div bind:this={dbReadout} class="text-[10px] font-mono py-0.5 leading-none {dbColor}"></div>
  </div>
</div>

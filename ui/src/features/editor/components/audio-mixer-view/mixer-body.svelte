<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const TRACKS_PEEK_WIDTH = 4 // min visible sliver when fully tucked
  // Channel strips + trailing border (scale column is outside the tuckable area)
  const MIN_EMPTY_WIDTH = 80
</script>

<script lang="ts">
  import BusMeter from './bus-meter.svelte'
  import ChannelStrip from './channel-strip.svelte'
  import ScaleColumn from './scale-column.svelte'
  import type { AudioMixerLevel, AudioMixerTrack } from './types'

  interface MixerBodyProps {
    tracks: AudioMixerTrack[]
    perTrackLevels: Map<string, AudioMixerLevel>
    masterEstimate: AudioMixerLevel
    isPlaying: boolean
    expanded?: boolean
    masterVolumeDb: number
    masterMuted: boolean
    allItemIds: string[]
    onMasterVolumeChange: (volumeDb: number) => void
    onMasterMuteToggle: () => void
    onTrackVolumeChange: (trackId: string, volumeDb: number) => void
    onTrackMuteToggle: (trackId: string) => void
    onTrackSoloToggle: (trackId: string) => void
    onTrackEqToggle?: (trackId: string) => void
    onBusEqToggle?: () => void
    busEqEnabled?: boolean
  }

  let {
    tracks,
    perTrackLevels,
    masterEstimate,
    isPlaying,
    expanded,
    masterVolumeDb,
    masterMuted,
    allItemIds,
    onMasterVolumeChange,
    onMasterMuteToggle,
    onTrackVolumeChange,
    onTrackMuteToggle,
    onTrackSoloToggle,
    onTrackEqToggle,
    onBusEqToggle,
    busEqEnabled,
  }: MixerBodyProps = $props()

  const stripPx = $derived(expanded ? 68 : 52)
  const naturalWidth = $derived(
    tracks.length > 0 ? tracks.length * stripPx + 2 : MIN_EMPTY_WIDTH,
  )
  let tracksWidth: number | null = $state(null) // null = natural
  let animating = $state(false)
  let drag: { startX: number; startWidth: number } | null = null
  let didDrag = false

  // Reset to natural width when track count changes
  $effect(() => {
    void tracks.length
    tracksWidth = null
  })

  function handlePointerDown(e: PointerEvent) {
    e.preventDefault()
    animating = false // kill transition during drag
    const current = tracksWidth ?? naturalWidth
    drag = { startX: e.clientX, startWidth: current }
    didDrag = false
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: PointerEvent) {
    if (!drag) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 2) didDrag = true
    // Left-edge resize: drag left = wider, drag right = narrower
    tracksWidth = Math.max(TRACKS_PEEK_WIDTH, Math.min(naturalWidth, drag.startWidth - dx))
  }

  function handlePointerUp() {
    drag = null
  }

  const effectiveWidth = $derived(tracksWidth ?? naturalWidth)
  const isTucked = $derived(effectiveWidth < naturalWidth)

  function handleClick() {
    if (didDrag) return // don't toggle after a drag
    animating = true
    tracksWidth = isTucked ? null : TRACKS_PEEK_WIDTH
  }
</script>

<div class="flex-1 min-h-0 flex {expanded ? 'px-1 py-1.5' : 'px-0.5 py-1'} gap-0.5">
  <!-- Drag handle — left edge of the mixer, click to toggle -->
  {#if tracks.length > 0}
    <button
      type="button"
      aria-label="Tuck mixer"
      aria-pressed={isTucked}
      class="w-[5px] shrink-0 flex items-center justify-center cursor-col-resize select-none group border-0 bg-transparent p-0"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
      onclick={handleClick}
    >
      <div
        class="w-[2px] h-8 rounded-full transition-colors {isTucked
          ? 'bg-primary/70 group-hover:bg-primary'
          : 'bg-primary/30 group-hover:bg-primary/60'}"
      ></div>
    </button>
  {/if}

  <!-- dB scale — always visible -->
  <ScaleColumn />

  <!-- Channel strips — tuckable from the right (rightmost tracks hide first) -->
  <div
    class="min-h-0 overflow-hidden shrink-0 {animating ? 'transition-[width] duration-200 ease-out' : ''}"
    style:width="{effectiveWidth}px"
    ontransitionend={() => (animating = false)}
  >
    <div class="flex h-full">
      {#each tracks as track (track.id)}
        <ChannelStrip
          {track}
          level={perTrackLevels.get(track.id)}
          {isPlaying}
          {expanded}
          onVolumeChange={onTrackVolumeChange}
          onMuteToggle={onTrackMuteToggle}
          onSoloToggle={onTrackSoloToggle}
          onEqToggle={onTrackEqToggle}
          eqActive={!!track.eqEnabled}
        />
      {/each}

      <!-- Trailing border after last strip -->
      {#if tracks.length > 0}
        <div class="w-[2px] shrink-0 bg-border/40"></div>
      {/if}

      {#if tracks.length === 0}
        <div class="flex-1 flex items-center justify-center text-[10px] text-muted-foreground/30 italic">
          No audio tracks
        </div>
      {/if}
    </div>
  </div>

  <!-- Bus / master strip — ml-auto pins it to the right when tracks are tucked -->
  <BusMeter
    {masterEstimate}
    {isPlaying}
    volumeDb={masterVolumeDb}
    muted={masterMuted}
    {allItemIds}
    onVolumeChange={onMasterVolumeChange}
    onMuteToggle={onMasterMuteToggle}
    onEqToggle={onBusEqToggle}
    eqActive={!!busEqEnabled}
  />
</div>

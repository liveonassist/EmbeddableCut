<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { linearLevelToPercent } from '../audio-meter-utils'
  import ChannelFader from './channel-fader.svelte'
  import SegmentedMeterBar from './segmented-meter-bar.svelte'
  import { faderDbColor, formatFaderDb, getMeterFallbackPercent } from './fader'
  import type { AudioMixerLevel, AudioMixerTrack } from './types'

  interface ChannelStripProps {
    track: AudioMixerTrack
    level: AudioMixerLevel | undefined
    isPlaying: boolean
    expanded?: boolean
    onVolumeChange: (trackId: string, volumeDb: number) => void
    onMuteToggle: (trackId: string) => void
    onSoloToggle: (trackId: string) => void
    onEqToggle?: (trackId: string) => void
    eqActive?: boolean
  }

  let {
    track,
    level,
    isPlaying,
    expanded,
    onVolumeChange,
    onMuteToggle,
    onSoloToggle,
    onEqToggle,
    eqActive = false,
  }: ChannelStripProps = $props()

  let dbReadout: HTMLDivElement | null = $state(null)
  let leftBar: HTMLDivElement | null = $state(null)
  let rightBar: HTMLDivElement | null = $state(null)

  const fallbackPercent = $derived(
    level
      ? getMeterFallbackPercent({
          unresolvedSourceCount: level.unresolvedSourceCount,
          resolvedSourceCount: level.resolvedSourceCount,
          isPlaying,
        })
      : 0,
  )
  const leftPercent = $derived(
    isPlaying ? Math.max(level ? linearLevelToPercent(level.left) : 0, fallbackPercent) : 0,
  )
  const rightPercent = $derived(
    isPlaying ? Math.max(level ? linearLevelToPercent(level.right) : 0, fallbackPercent) : 0,
  )
  const showScanningFallback = $derived(fallbackPercent > 0)

  $effect(() => {
    if (!leftBar || !rightBar) return
    leftBar.style.height = `${leftPercent}%`
    rightBar.style.height = `${rightPercent}%`
  })

  // The readout is written directly while the fader drags; render it the same way.
  $effect(() => {
    if (dbReadout) dbReadout.textContent = formatFaderDb(track.volume)
  })

  const dbColor = $derived(faderDbColor(track.volume))

  const stripWidth = $derived(expanded ? 'min-w-[68px] w-[68px]' : 'min-w-[52px] w-[52px]')
  const meterBarWidth = 'w-[14px]'
  const meterBarGap = 'gap-[2px]'
  const buttonSize = $derived(
    expanded ? 'w-[22px] h-[18px] text-[10px]' : 'w-[18px] h-[16px] text-[9px]',
  )
</script>

<div class="flex h-full {stripWidth}">
  <!-- Track color stripe — doubles as channel divider -->
  <div class="w-[2px] shrink-0" style:background-color={track.color || 'var(--border)'}></div>

  <!-- Strip body -->
  <div class="flex flex-1 flex-col items-center {expanded ? 'px-1' : 'px-0.5'}">
    <!-- Track name -->
    <div
      class="w-full text-center uppercase tracking-wider text-muted-foreground/80 truncate px-0.5 py-1 leading-tight {expanded
        ? 'text-[11px]'
        : 'text-[10px]'}"
      title={track.name}
    >
      {track.name}
    </div>

    <div class="flex w-full justify-center py-0.5 shrink-0">
      <button
        type="button"
        class="min-w-[28px] rounded-[3px] px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] transition-colors {eqActive
          ? 'border border-sky-400/50 bg-sky-500/15 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.22)]'
          : 'border border-transparent bg-muted/30 text-muted-foreground/45 hover:bg-sky-500/10 hover:text-sky-300'} {!onEqToggle
          ? 'pointer-events-none opacity-50'
          : ''}"
        onclick={() => onEqToggle?.(track.id)}
        aria-label="EQ {track.name}"
        aria-pressed={eqActive}
      >
        EQ
      </button>
    </div>

    <!-- Solo / Mute buttons -->
    <div class="flex {expanded ? 'gap-1' : 'gap-0.5'} py-0.5 shrink-0">
      <button
        type="button"
        class="{buttonSize} rounded-[3px] font-bold leading-none flex items-center justify-center transition-colors {track.solo
          ? 'bg-amber-500 text-black shadow-[0_0_8px_rgba(245,158,11,0.4)]'
          : 'bg-muted/40 text-muted-foreground/40 hover:bg-muted/70 hover:text-muted-foreground/70'}"
        onclick={() => onSoloToggle(track.id)}
        aria-label="Solo {track.name}"
        aria-pressed={track.solo}
      >
        S
      </button>
      <button
        type="button"
        class="{buttonSize} rounded-[3px] font-bold leading-none flex items-center justify-center transition-colors {track.muted
          ? 'bg-red-600 text-white shadow-[0_0_8px_rgba(220,38,38,0.4)]'
          : 'bg-muted/40 text-muted-foreground/40 hover:bg-muted/70 hover:text-muted-foreground/70'}"
        onclick={() => onMuteToggle(track.id)}
        aria-label="Mute {track.name}"
        aria-pressed={track.muted}
      >
        M
      </button>
    </div>

    <!-- Fader + segmented level meter area -->
    <div class="flex-1 w-full min-h-0 flex items-stretch {expanded ? 'gap-0.5' : 'gap-px'} py-1">
      <!-- Segmented per-track level bars -->
      <div class="flex {meterBarGap} {meterBarWidth} shrink-0">
        <SegmentedMeterBar
          height="0%"
          scanning={showScanningFallback}
          bind:fill={leftBar}
          fillProps={{ 'data-track-id': track.id, 'data-track-channel': 'left' }}
        />
        <SegmentedMeterBar
          height="0%"
          scanning={showScanningFallback}
          bind:fill={rightBar}
          fillProps={{ 'data-track-id': track.id, 'data-track-channel': 'right' }}
        />
      </div>

      <!-- Fader -->
      <div class="flex-1 min-w-0">
        <ChannelFader
          trackId={track.id}
          volumeDb={track.volume}
          itemIds={track.itemIds}
          {onVolumeChange}
          {dbReadout}
        />
      </div>
    </div>

    <!-- dB readout — color-coded -->
    <div bind:this={dbReadout} class="text-[10px] font-mono py-0.5 leading-none {dbColor}"></div>
  </div>
</div>

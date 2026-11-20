<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineTrack } from '@/types/timeline'
  import type { MiniTimelineClip } from './types'

  interface MiniTimelineTrackLanesProps {
    tracks: readonly TimelineTrack[]
    clips: readonly MiniTimelineClip[]
    selectedIds: ReadonlySet<string>
    maxFrame: number
    trackAreaHeight: number
    labelWidth: number
    onSelectClip: (clip: MiniTimelineClip) => void
    fallbackLabelPrefix?: string
    clipTestId?: string
    /**
     * Clips drawn as dimmed, secondary context rather than primary targets (e.g.
     * a linked-audio companion in the Animate workspace). Still clickable —
     * `onSelectClip` is expected to forward the press to the primary partner.
     */
    mutedClipIds?: ReadonlySet<string>
  }

  /**
   * Track label gutter + lane dividers + the compact clip bars. Clip selection is
   * delegated to `onSelectClip` so the Color (seek + select) and Animate (pick
   * animation target) workspaces can supply their own behavior.
   */
  let {
    tracks,
    clips,
    selectedIds,
    maxFrame,
    trackAreaHeight,
    labelWidth,
    onSelectClip,
    fallbackLabelPrefix = 'V',
    clipTestId,
    mutedClipIds,
  }: MiniTimelineTrackLanesProps = $props()

  const laneIndexById = $derived(new Map(tracks.map((track, index) => [track.id, index])))
  const rowCount = $derived(Math.max(1, tracks.length))
  const rowHeight = $derived(trackAreaHeight / rowCount)
</script>

<div class="relative" style:height="{trackAreaHeight}px">
  <div
    class="absolute left-0 top-0 h-full border-r border-black/35 text-[9px] font-semibold text-zinc-400"
    style:width="{labelWidth}px"
  >
    {#if tracks.length > 0}
      {#each tracks as track, index (track.id)}
        <span
          class="absolute left-0 flex w-full items-center justify-center overflow-hidden leading-none"
          style:top="{index * rowHeight}px"
          style:height="{rowHeight}px"
        >
          {track.name || `${fallbackLabelPrefix}${index + 1}`}
        </span>
      {/each}
    {:else}
      <span class="flex h-full items-center justify-center">{`${fallbackLabelPrefix}1`}</span>
    {/if}
  </div>
  <div class="absolute inset-y-0 right-0" style:left="{labelWidth}px">
    {#each tracks as track, index (track.id)}
      <div class="absolute left-0 right-0 border-t border-zinc-700/70" style:top="{index * rowHeight}px"></div>
    {/each}
    {#each clips as clip (`${clip.id}-mini`)}
      {@const selected = selectedIds.has(clip.id)}
      {@const muted = mutedClipIds?.has(clip.id) ?? false}
      {@const laneIndex = laneIndexById.get(clip.trackId) ?? 0}
      {@const clipHeight =
        rowHeight >= 10 ? Math.max(8, Math.min(16, rowHeight - 4)) : Math.max(4, rowHeight - 2)}
      {@const clipTop = laneIndex * rowHeight + Math.max(1, (rowHeight - clipHeight) / 2)}
      {@const clipTone = selected
        ? 'border-primary bg-primary/20 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_45%,transparent)]'
        : muted
          ? 'border-zinc-600/60 bg-zinc-500/20 opacity-70 hover:opacity-100'
          : 'border-sky-500/70 bg-sky-500/45 hover:border-sky-300'}
      <button
        type="button"
        data-testid={clipTestId}
        data-track-id={clip.trackId}
        data-muted={muted ? '1' : undefined}
        class={`absolute overflow-hidden rounded-[2px] border text-left transition-colors ${clipTone}`}
        style:left="{(clip.from / maxFrame) * 100}%"
        style:width="{Math.max(0.6, (clip.durationInFrames / maxFrame) * 100)}%"
        style:min-width="16px"
        style:top="{clipTop}px"
        style:height="{clipHeight}px"
        onclick={(event) => {
          event.stopPropagation()
          onSelectClip(clip)
        }}
        onpointerdown={(event) => event.stopPropagation()}
        title={clip.label}
        aria-label={clip.label}
      ></button>
    {/each}
  </div>
</div>

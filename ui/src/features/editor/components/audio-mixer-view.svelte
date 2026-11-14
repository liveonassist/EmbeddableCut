<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import MixerBody from './audio-mixer-view/mixer-body.svelte'
  import type { AudioMixerViewProps } from './audio-mixer-view/types'

  let {
    tracks,
    perTrackLevels,
    masterEstimate,
    isPlaying,
    masterVolumeDb,
    masterMuted,
    onMasterVolumeChange,
    onMasterMuteToggle,
    onTrackVolumeChange,
    onTrackMuteToggle,
    onTrackSoloToggle,
    onTrackEqToggle,
    onBusEqToggle,
    busEqEnabled,
    headerExtra,
    expanded,
  }: AudioMixerViewProps = $props()

  const outerClass = $derived(
    expanded
      ? 'panel-bg flex h-full flex-col overflow-hidden w-fit'
      : 'panel-bg border-l border-border flex h-full flex-col overflow-hidden w-fit',
  )

  const allItemIds = $derived(tracks.flatMap((track) => track.itemIds))
</script>

<aside class={outerClass} aria-label={t('editor.audioMeters.audioMixer')}>
  <!-- Header — only shown when docked (floating panel has its own title bar) -->
  {#if !expanded}
    <div
      class="flex min-w-0 items-center justify-between gap-2 border-b border-border bg-secondary/20 px-2"
      style:height={EDITOR_LAYOUT_CSS_VALUES.timelineTracksHeaderHeight}
    >
      <span class="min-w-0 text-xs text-muted-foreground font-mono uppercase tracking-[0.18em]">
        {t('editor.audioMeters.mixer')}
      </span>
      {#if headerExtra}
        {@render headerExtra()}
      {:else}
        <span
          class="h-2 w-2 rounded-full {isPlaying
            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]'
            : 'bg-muted-foreground/30'}"
          aria-hidden="true"
        ></span>
      {/if}
    </div>
  {/if}

  <!-- Mixer body -->
  <MixerBody
    {tracks}
    {perTrackLevels}
    {masterEstimate}
    {isPlaying}
    {expanded}
    {masterVolumeDb}
    {masterMuted}
    {allItemIds}
    {onMasterVolumeChange}
    {onMasterMuteToggle}
    {onTrackVolumeChange}
    {onTrackMuteToggle}
    {onTrackSoloToggle}
    {onTrackEqToggle}
    {onBusEqToggle}
    {busEqEnabled}
  />
</aside>

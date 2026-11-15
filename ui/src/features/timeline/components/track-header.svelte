<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
  } from '@/components/ui/context-menu'
  import Power from 'lucide-svelte/icons/power'
  import PowerOff from 'lucide-svelte/icons/power-off'
  import Lock from 'lucide-svelte/icons/lock'
  import GripVertical from 'lucide-svelte/icons/grip-vertical'
  import Radio from 'lucide-svelte/icons/radio'
  import FoldHorizontal from 'lucide-svelte/icons/fold-horizontal'
  import Link2 from 'lucide-svelte/icons/link-2'
  import type { TimelineTrack } from '@/types/timeline'
  import { useTrackDrag } from '../hooks/use-track-drag.svelte'
  import { TIMELINE_SIDEBAR_WIDTH } from '@/features/timeline/constants'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { isTrackDisabled } from '@/features/timeline/utils/classic-tracks'
  import { isTrackSyncLockActive } from '@/features/timeline/utils/track-sync-lock'
  import { useFeatures } from '../../../extensions/feature-gate.svelte'

  interface TrackHeaderProps {
    track: TimelineTrack
    isActive: boolean
    isSelected: boolean
    canDeleteTrack: boolean
    canDeleteEmptyTracks: boolean
    onToggleLock: () => void
    onToggleSyncLock: () => void
    onToggleDisabled: () => void
    onToggleSolo: () => void
    onSelect: (e: MouseEvent) => void
    onCloseGaps?: () => void
    onAddVideoTrack: () => void
    onAddAudioTrack: () => void
    onDeleteTrack: () => void
    onDeleteEmptyTracks: () => void
  }

  /**
   * Track Header Component
   *
   * Displays track name, controls, and handles selection.
   * Shows active state with background color.
   * Supports group tracks with collapse/expand and indentation.
   * Right-click context menu for track actions.
   */
  let {
    track,
    isActive,
    isSelected,
    canDeleteTrack,
    canDeleteEmptyTracks,
    onToggleLock,
    onToggleSyncLock,
    onToggleDisabled,
    onToggleSolo,
    onSelect,
    onCloseGaps,
    onAddVideoTrack,
    onAddAudioTrack,
    onDeleteTrack,
    onDeleteEmptyTracks,
  }: TrackHeaderProps = $props()

  const itemCount = $derived(
    select(useItemsStore, (s) => s.itemsByTrackId[track.id]?.length ?? 0),
  )
  const features = useFeatures()
  const closeGapsMode = $derived(features.mode('track.close-gaps', { track }))
  const addMode = $derived(features.mode('track.add', { track }))
  const deleteMode = $derived(features.mode('track.delete', { track }))
  const syncLockEnabled = $derived(isTrackSyncLockActive(track))
  const trackDisabled = $derived(isTrackDisabled(track))

  // Use track drag hook (visuals handled centrally by timeline.svelte via DOM)
  const trackDrag = useTrackDrag(() => track)
  const itemCountLabel = $derived(
    t('timeline.trackHeader.clipCount', { count: itemCount.current }),
  )

  const buttonStyle = `width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`

  const disableLabel = $derived(
    trackDisabled
      ? t('timeline.trackHeader.enableTrack')
      : t('timeline.trackHeader.disableTrack'),
  )
  const soloLabel = $derived(
    track.solo ? t('timeline.trackHeader.unsoloTrack') : t('timeline.trackHeader.soloTrack'),
  )
  const lockLabel = $derived(
    track.locked ? t('timeline.trackHeader.unlockTrack') : t('timeline.trackHeader.lockTrack'),
  )
  const syncLockLabel = $derived(
    syncLockEnabled
      ? t('timeline.trackHeader.disableSyncLock')
      : t('timeline.trackHeader.enableSyncLock'),
  )

  const rowClass = $derived(`
    flex flex-col overflow-hidden px-1
    cursor-grab active:cursor-grabbing relative
    ${isSelected ? 'bg-primary/10' : trackDisabled ? 'bg-muted/30 hover:bg-muted/40' : 'hover:bg-secondary/50'}
    ${isActive ? 'border-l-3 border-l-primary' : 'border-l-3 border-l-transparent'}
    ${trackDisabled ? 'text-muted-foreground' : ''}
    transition-colors duration-150
  `)

  const stopPropagation =(e: MouseEvent) => e.stopPropagation()
</script>

<ContextMenu>
  <ContextMenuTrigger>
    {#snippet child({ props })}
      <div
        {...props}
        class="relative overflow-hidden"
        style:height="{track.height}px"
        style:content-visibility="auto"
        style:contain-intrinsic-size="{TIMELINE_SIDEBAR_WIDTH}px {track.height}px"
        data-track-id={track.id}
        data-track-disabled={trackDisabled ? 'true' : undefined}
      >
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          class={rowClass}
          style:height="{track.height}px"
          onclick={onSelect}
          onmousedown={trackDrag.handleDragStart}
        >
          <div
            class="flex h-6 shrink-0 items-center gap-0.5 overflow-hidden border-b border-border/60"
          >
            <div class="flex h-5 w-4 shrink-0 items-center justify-center">
              <GripVertical class="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
            <!-- Disable Button -->
            <Button
              variant="ghost"
              size="icon"
              class="rounded hover:bg-secondary"
              style={buttonStyle}
              onclick={(e) => {
                e.stopPropagation()
                onToggleDisabled()
              }}
              onmousedown={stopPropagation}
              aria-label={disableLabel}
              data-tooltip={disableLabel}
            >
              {#if trackDisabled}
                <PowerOff class="w-3 h-3 text-primary" />
              {:else}
                <Power class="w-3 h-3 opacity-70" />
              {/if}
            </Button>

            <!-- Solo Button -->
            <Button
              variant="ghost"
              size="icon"
              class="rounded hover:bg-secondary"
              style={buttonStyle}
              onclick={(e) => {
                e.stopPropagation()
                onToggleSolo()
              }}
              onmousedown={stopPropagation}
              aria-label={soloLabel}
              data-tooltip={soloLabel}
            >
              <Radio class="w-3 h-3 {track.solo ? 'text-primary' : ''}" />
            </Button>

            <!-- Lock Button -->
            <Button
              variant="ghost"
              size="icon"
              class="rounded hover:bg-secondary"
              style={buttonStyle}
              onclick={(e) => {
                e.stopPropagation()
                onToggleLock()
              }}
              onmousedown={stopPropagation}
              aria-label={lockLabel}
              data-tooltip={lockLabel}
            >
              <Lock class="w-3 h-3 {track.locked ? 'text-primary' : 'opacity-70'}" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              class="rounded hover:bg-secondary"
              style={buttonStyle}
              onclick={(e) => {
                e.stopPropagation()
                onToggleSyncLock()
              }}
              onmousedown={stopPropagation}
              aria-label={syncLockLabel}
              data-tooltip={syncLockLabel}
            >
              <Link2 class="w-3 h-3 {syncLockEnabled ? 'text-primary' : 'opacity-70'}" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              class="rounded hover:bg-secondary"
              style={buttonStyle}
              onclick={(e) => {
                e.stopPropagation()
                onCloseGaps?.()
              }}
              onmousedown={stopPropagation}
              aria-label={t('timeline.trackHeader.closeAllGaps')}
              data-tooltip={t('timeline.trackHeader.closeAllGaps')}
            >
              <FoldHorizontal class="w-3 h-3" />
            </Button>
          </div>

          <div class="flex min-h-0 flex-1 items-center gap-1.5 overflow-hidden px-1.5">
            <span class="min-w-0 truncate text-xs font-semibold leading-none font-mono"
              >{track.name}</span
            >
            <span class="shrink-0 text-[10px] leading-none text-muted-foreground"
              >{itemCountLabel}</span
            >
          </div>
        </div>
      </div>
    {/snippet}
  </ContextMenuTrigger>

  <ContextMenuContent class="w-52">
    {#if closeGapsMode !== 'hidden'}
      <ContextMenuItem disabled={closeGapsMode === 'locked'} onclick={onCloseGaps}>
        {t('timeline.trackHeader.closeAllGaps')}
      </ContextMenuItem>
    {/if}

    {#if addMode !== 'hidden'}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={addMode === 'locked'} onclick={onAddVideoTrack}>
        {t('timeline.trackHeader.addVideoTrack')}
      </ContextMenuItem>
      <ContextMenuItem disabled={addMode === 'locked'} onclick={onAddAudioTrack}>
        {t('timeline.trackHeader.addAudioTrack')}
      </ContextMenuItem>
    {/if}
    {#if deleteMode !== 'hidden'}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canDeleteTrack || deleteMode === 'locked'} onclick={onDeleteTrack}>
        {t('timeline.trackHeader.deleteTrack')}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!canDeleteEmptyTracks || deleteMode === 'locked'}
        onclick={onDeleteEmptyTracks}
      >
        {t('timeline.trackHeader.deleteEmptyTracks')}
      </ContextMenuItem>
    {/if}
  </ContextMenuContent>
</ContextMenu>

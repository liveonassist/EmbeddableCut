<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Button } from '@/components/ui/button'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Progress } from '@/components/ui/progress'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { cn } from '@/shared/ui/cn'
  import type { EmbeddedSubtitleTrack } from '@/shared/utils/matroska-subtitles'
  import type { MediaMetadata } from '@/types/storage'
  import {
    chooseEmbeddedSubtitleTrackForMedia,
    getEmbeddedSubtitleTrackLabel,
    subtitleSidecarService,
  } from '@/features/media-library/services/subtitle-sidecar-service'
  import { t } from '$lib/i18n.svelte'

  interface EmbeddedSubtitleTrackPickerProps {
    /** When non-null, the picker is open scanning/listing tracks for this media. */
    media: MediaMetadata | null
    /** Resolved blob — caller is responsible for permission + opening. */
    blob: Blob | null
    onClose: () => void
    onTrackPicked: (track: EmbeddedSubtitleTrack) => void
    /** Optional notice rendered in the body (used to surface scan errors). */
    errorMessage?: string | null
  }

  type ScanState =
    | { status: 'idle' }
    | { status: 'scanning'; bytesRead: number; totalBytes: number }
    | {
        status: 'ready'
        tracks: readonly EmbeddedSubtitleTrack[]
        fromCache: boolean
        defaultTrackNumber: number | null
      }
    | { status: 'empty' }
    | { status: 'error'; message: string }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  let { media, blob, onClose, onTrackPicked, errorMessage }: EmbeddedSubtitleTrackPickerProps =
    $props()

  let scan = $state.raw<ScanState>({ status: 'idle' })
  let selectedTrackNumber = $state<number | null>(null)

  const isOpen = $derived(media !== null)

  $effect(() => {
    const currentMedia = media
    const currentBlob = blob
    if (!currentMedia || !currentBlob) {
      scan = { status: 'idle' }
      selectedTrackNumber = null
      return
    }

    let cancelled = false
    const abortController = new AbortController()
    scan = { status: 'scanning', bytesRead: 0, totalBytes: currentBlob.size }
    selectedTrackNumber = null

    void subtitleSidecarService
      .scanEmbeddedSubtitleTracks(currentMedia, currentBlob, {
        onProgress: ({ bytesRead, totalBytes }) => {
          if (cancelled) return
          if (scan.status === 'scanning') scan = { ...scan, bytesRead, totalBytes }
        },
        signal: abortController.signal,
      })
      .then((result) => {
        if (cancelled) return
        if (result.tracks.length === 0) {
          scan = { status: 'empty' }
          return
        }
        const defaultTrack = chooseEmbeddedSubtitleTrackForMedia(result.tracks)
        const defaultTrackNumber = defaultTrack?.trackNumber ?? null
        scan = {
          status: 'ready',
          tracks: result.tracks,
          fromCache: result.fromCache,
          defaultTrackNumber,
        }
        selectedTrackNumber = defaultTrackNumber
      })
      .catch((error: unknown) => {
        if (cancelled) return
        scan = {
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to scan embedded subtitles.',
        }
      })

    return () => {
      cancelled = true
      abortController.abort()
    }
  })

  const selectedTrack = $derived(
    scan.status === 'ready' && selectedTrackNumber !== null
      ? (scan.tracks.find((track) => track.trackNumber === selectedTrackNumber) ?? null)
      : null,
  )
</script>

{#snippet badge(label: string)}
  <span
    class="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground"
  >
    {label}
  </span>
{/snippet}

{#snippet trackRow(
  track: EmbeddedSubtitleTrack,
  selected: boolean,
  isDefault: boolean,
  onSelect: () => void,
)}
  <li>
    <button
      type="button"
      onclick={onSelect}
      class={cn(
        'w-full flex items-center justify-between gap-3 rounded border px-3 py-2 text-left',
        'transition-colors',
        selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40',
      )}
    >
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium truncate">{getEmbeddedSubtitleTrackLabel(track)}</span>
          {#if track.forced}{@render badge(t('media.embeddedSubtitles.badgeForced'))}{/if}
          {#if track.default}{@render badge(t('media.embeddedSubtitles.badgeDefault'))}{/if}
          {#if isDefault && !track.forced && !track.default}
            {@render badge(t('media.embeddedSubtitles.badgeAutoPick'))}
          {/if}
        </div>
        <div class="text-xs text-muted-foreground truncate">
          {t('media.embeddedSubtitles.trackInfo', {
            n: track.trackNumber,
            codec: track.codecId.replace('S_TEXT/', ''),
          })}
        </div>
      </div>
      <div class="text-xs text-muted-foreground tabular-nums shrink-0">
        {t('media.embeddedSubtitles.cuesCount', { count: track.cues.length })}
      </div>
    </button>
  </li>
{/snippet}

<Dialog
  bind:open={
    () => isOpen,
    (open) => {
      if (!open) onClose()
    }
  }
>
  <DialogContent class="max-w-lg">
    <DialogHeader>
      <DialogTitle>{t('media.embeddedSubtitles.title')}</DialogTitle>
      <DialogDescription>
        {media
          ? t('media.embeddedSubtitles.descForFile', { name: media.fileName })
          : t('media.embeddedSubtitles.desc')}
      </DialogDescription>
    </DialogHeader>

    <div class="min-h-32 max-h-[55vh]">
      {#if scan.status === 'scanning'}
        <div class="flex flex-col gap-2 py-6">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">
              {t('media.embeddedSubtitles.scanning')}
            </span>
            <span class="tabular-nums text-xs text-muted-foreground">
              {scan.totalBytes > 0 ? `${Math.round((scan.bytesRead / scan.totalBytes) * 100)}%` : ''}
            </span>
          </div>
          <Progress
            value={scan.totalBytes > 0 ? Math.min(100, (scan.bytesRead / scan.totalBytes) * 100) : 0}
            class="h-2"
          />
          {#if scan.totalBytes > 0}
            <p class="text-xs text-muted-foreground tabular-nums">
              {formatBytes(scan.bytesRead)} / {formatBytes(scan.totalBytes)}
            </p>
          {/if}
        </div>
      {/if}

      {#if scan.status === 'empty'}
        <p class="py-6 text-sm text-muted-foreground">
          {t('media.embeddedSubtitles.empty')}
        </p>
      {/if}

      {#if scan.status === 'error'}
        <p class="py-6 text-sm text-destructive">{scan.message}</p>
      {/if}

      {#if scan.status === 'ready'}
        {@const ready = scan}
        <ScrollArea class="h-full max-h-[55vh] pr-2">
          <ul class="flex flex-col gap-1.5">
            {#each ready.tracks as track (track.trackNumber)}
              {@render trackRow(
                track,
                track.trackNumber === selectedTrackNumber,
                track.trackNumber === ready.defaultTrackNumber,
                () => (selectedTrackNumber = track.trackNumber),
              )}
            {/each}
          </ul>
          {#if ready.fromCache}
            <p class="pt-3 text-xs text-muted-foreground">
              {t('media.embeddedSubtitles.loadedFromCache')}
            </p>
          {/if}
        </ScrollArea>
      {/if}

      {#if errorMessage}
        <p class="pt-2 text-sm text-destructive">{errorMessage}</p>
      {/if}
    </div>

    <DialogFooter>
      <Button variant="ghost" onclick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        disabled={!selectedTrack}
        onclick={() => {
          if (selectedTrack) onTrackPicked(selectedTrack)
        }}
      >
        {selectedTrack
          ? t('media.embeddedSubtitles.insertWithCues', { count: selectedTrack.cues.length })
          : t('media.embeddedSubtitles.insert')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

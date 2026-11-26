<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Info from '@lucide/svelte/icons/info'
  import Video from '@lucide/svelte/icons/video'
  import FileAudio from '@lucide/svelte/icons/file-audio'
  import ImageIcon from '@lucide/svelte/icons/image'
  import Film from '@lucide/svelte/icons/film'
  import Clock from '@lucide/svelte/icons/clock'
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import FileType from '@lucide/svelte/icons/file-type'
  import FileJson from '@lucide/svelte/icons/file-json'
  import Loader2 from '@lucide/svelte/icons/loader-circle'
  import FileText from '@lucide/svelte/icons/file-text'
  import Link from '@lucide/svelte/icons/link'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import type { MediaMetadata, MediaTranscript } from '@/types/storage'
  import { getMediaType, formatDuration } from '@/features/media-library/utils/validation'
  import { formatBytes } from '@/shared/utils/format-utils'
  import { mediaTranscriptionService } from '@/features/media-library/services/media-transcription-service'
  import { getMediaTranscriptionModelLabel } from '@/features/media-library/transcription/registry'
  import { hasMediaSource, validateMediaHandle } from '@/infrastructure/storage'
  import { t } from '$lib/i18n.svelte'

  function formatTimestamp(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  interface MediaInfoPopoverProps {
    media: MediaMetadata
    /** Tailwind classes for the trigger button */
    triggerClass?: string
    /** Called when user clicks a caption timestamp to open source monitor at that time */
    onSeekToCaption?: (timeSec: number) => void
  }

  type SourceStatus =
    | 'checking'
    | 'linked'
    | 'workspace-copy'
    | 'app-storage'
    | 'needs-permission'
    | 'unavailable'
    | 'changed'

  async function resolveSourceStatus(media: MediaMetadata): Promise<SourceStatus> {
    const hasWorkspaceCopy = await hasMediaSource(media.id)

    if (media.storageType === 'handle') {
      const validation = await validateMediaHandle(media.id)
      if (validation.kind === 'ok') return 'linked'
      if (hasWorkspaceCopy) return 'workspace-copy'
      if (validation.kind === 'permission') return 'needs-permission'
      if (validation.kind === 'changed') return 'changed'
      return 'unavailable'
    }

    if (hasWorkspaceCopy) return 'workspace-copy'
    if (media.storageType === 'opfs') return 'app-storage'
    return 'unavailable'
  }

  let { media, triggerClass, onSeekToCaption }: MediaInfoPopoverProps = $props()

  let open = $state(false)
  let transcript = $state.raw<MediaTranscript | null>(null)
  let transcriptLoading = $state(false)
  let sourceStatus = $state<SourceStatus>('checking')
  const mediaType = $derived(getMediaType(media.mimeType))
  const typeLabel = $derived(
    mediaType === 'video'
      ? t('media.type.video')
      : mediaType === 'audio'
        ? t('media.type.audio')
        : mediaType === 'lottie'
          ? t('media.type.lottie')
          : t('media.type.image'),
  )
  const isTranscribable = $derived(mediaType === 'video' || mediaType === 'audio')

  const rows = $derived.by(() => {
    const next: Array<{ icon: typeof FileType; label: string; value: string }> = []

    next.push({
      icon: FileType,
      label: t('media.info.type'),
      value: `${typeLabel} (${media.mimeType.split('/')[1]})`,
    })

    if (
      (mediaType === 'video' || mediaType === 'audio' || mediaType === 'lottie') &&
      media.duration > 0
    ) {
      next.push({
        icon: Clock,
        label: t('media.info.duration'),
        value: formatDuration(media.duration),
      })
    }

    if (
      (mediaType === 'video' || mediaType === 'image' || mediaType === 'lottie') &&
      media.width > 0 &&
      media.height > 0
    ) {
      next.push({
        icon: Maximize2,
        label: t('media.info.dimensions'),
        value: `${media.width} × ${media.height}`,
      })
    }

    if (media.codec && media.codec !== 'importing...') {
      let codecStr = media.codec
      if (media.audioCodec) codecStr += ` / ${media.audioCodec}`
      next.push({ icon: Film, label: t('media.info.codec'), value: codecStr })
    }

    next.push({
      icon: HardDrive,
      label: t('media.info.size'),
      value: formatBytes(media.fileSize),
    })
    next.push({
      icon: Link,
      label: t('media.info.source'),
      value: t(`media.info.sourceStatus.${sourceStatus}`),
    })

    if (mediaType === 'video' && media.fps > 0) {
      next.push({
        icon: Film,
        label: t('media.info.frameRate'),
        value: t('media.info.fpsValue', { value: media.fps.toFixed(2) }),
      })
    }

    return next
  })

  $effect(() => {
    if (!open || !isTranscribable) {
      return
    }

    const mediaId = media.id
    let cancelled = false
    transcriptLoading = true

    void mediaTranscriptionService
      .getTranscript(mediaId)
      .then((loadedTranscript) => {
        if (!cancelled) {
          transcript = loadedTranscript ?? null
        }
      })
      .finally(() => {
        if (!cancelled) {
          transcriptLoading = false
        }
      })

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    if (!open) {
      return
    }

    const current = media
    let cancelled = false
    sourceStatus = 'checking'

    void resolveSourceStatus(current)
      .then((status) => {
        if (!cancelled) {
          sourceStatus = status
        }
      })
      .catch(() => {
        if (!cancelled) {
          sourceStatus = 'unavailable'
        }
      })

    return () => {
      cancelled = true
    }
  })
</script>

<Popover bind:open>
  <PopoverTrigger onclick={(e: MouseEvent) => e.stopPropagation()}>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class={triggerClass ??
          'p-0.5 rounded bg-black/60 text-white/80 hover:text-white hover:bg-black/80 transition-colors'}
        title={t('media.info.mediaInfo')}
      >
        <Info class="w-3 h-3" />
      </button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent
    side="right"
    align="start"
    sideOffset={8}
    class="w-56 p-0"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/50">
      {#if mediaType === 'video'}
        <Video class="w-3.5 h-3.5 text-primary" />
      {/if}
      {#if mediaType === 'audio'}
        <FileAudio class="w-3.5 h-3.5 text-green-500" />
      {/if}
      {#if mediaType === 'image'}
        <ImageIcon class="w-3.5 h-3.5 text-blue-500" />
      {/if}
      {#if mediaType === 'lottie'}
        <FileJson class="w-3.5 h-3.5 text-purple-500" />
      {/if}
      <span class="text-[11px] font-medium text-foreground truncate">{media.fileName}</span>
    </div>

    <!-- Info rows -->
    <div class="p-3 space-y-1">
      {#each rows as row (row.label)}
        <div class="flex items-center gap-2 text-[10px]">
          <span class="text-muted-foreground flex-shrink-0"><row.icon class="w-3 h-3" /></span>
          <span class="text-muted-foreground w-16 flex-shrink-0">{row.label}</span>
          <span class="text-foreground truncate">{row.value}</span>
        </div>
      {/each}
    </div>

    {#if transcriptLoading || transcript}
      <div class="border-t border-border/50">
        <div class="flex items-center gap-1.5 px-3 py-1.5">
          <FileText class="w-3 h-3 text-primary" />
          <span class="text-[10px] font-medium text-muted-foreground">
            {transcript
              ? t('media.info.transcriptWithCount', { count: transcript.segments.length })
              : t('media.info.transcript')}
          </span>
          {#if transcript}
            <span class="ml-auto text-[10px] text-muted-foreground">
              {getMediaTranscriptionModelLabel(transcript.model)}
            </span>
          {/if}
        </div>
        {#if transcriptLoading}
          <div class="px-3 pb-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Loader2 class="w-3 h-3 animate-spin" />
            {t('media.info.loadingTranscript')}
          </div>
        {:else if transcript}
          <div class="px-3 pb-2 space-y-2">
            <p class="text-[10px] leading-snug text-foreground/85 line-clamp-3">
              {transcript.text}
            </p>
            <div class="space-y-1.5 max-h-40 overflow-y-auto">
              {#each transcript.segments as segment, i (`${segment.start}-${segment.end}-${i}`)}
                <div class="flex gap-2 text-[10px]">
                  <button
                    type="button"
                    class="text-primary/80 hover:text-primary font-mono flex-shrink-0 w-10 text-right cursor-pointer hover:underline"
                    onclick={(e) => {
                      e.stopPropagation()
                      onSeekToCaption?.(segment.start)
                    }}
                    title={t('media.info.openInSourceMonitor')}
                  >
                    {formatTimestamp(segment.start)}
                  </button>
                  <span class="text-foreground leading-snug">{segment.text}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </PopoverContent>
</Popover>

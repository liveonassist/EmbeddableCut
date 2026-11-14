<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import { PlayerEmitterProvider, ClockBridgeProvider, VideoConfigProvider } from '@/features/preview/deps/player-context'
  import { resolveMediaUrl } from '@/features/preview/utils/media-resolver'
  import { useMediaLibraryStore, getMediaType } from '@/features/preview/deps/media-library'
  import { useEditorStore } from '@/shared/state/editor'
  import { useSourcePlayerStore } from '@/shared/state/source-player'
  import SourceMonitorInner from './source-monitor-inner.svelte'

  interface SourceMonitorProps {
    mediaId: string
    onClose?: () => void
    variant?: 'panel' | 'program'
    interactive?: boolean
    seekFrame?: number | null
  }

  let { mediaId, onClose, variant = 'panel', interactive = true, seekFrame = null }: SourceMonitorProps = $props()
  let blobUrl = $state.raw<string>('')
  const setBlobUrl = (next: string | ((prev: string) => string)) => {
    blobUrl = typeof next === 'function' ? (next as (prev: string) => string)(untrack(() => blobUrl)) : next
  }
  const media = selectDerived(useMediaLibraryStore, (s) => s.mediaById[mediaId])

  // Sync current media ID into source player store for I/O points
  $effect(() => {
    if (!interactive) return
    useSourcePlayerStore.getState().setCurrentMediaId(mediaId)
    return () => {
      // In React Strict Mode the source monitor may mount, clean up, and remount
      // while still representing the same open panel. Only release ownership once
      // the editor has actually switched away from this source monitor.
      if (useEditorStore.getState().sourcePreviewMediaId === mediaId) {
        return
      }
      useSourcePlayerStore.getState().releaseCurrentMediaId(mediaId)
    }
  })

  // Auto-close if media is deleted
  $effect(() => {
    if (!media.current) {
      onClose?.()
    }
  })

  // Resolve the original source URL once. SourceComposition can swap to a
  // ready proxy for video preview without losing the original fallback URL.
  $effect(() => {
    let cancelled = false
    resolveMediaUrl(mediaId)
      .then((url) => {
        if (!cancelled) setBlobUrl(url)
      })
      .catch(() => {
        // Resolution failure already logged in resolveMediaUrl
      })
    return () => {
      cancelled = true
    }
  })

  const mediaType = $derived(getMediaType(media.current!.mimeType))

  const fps = $derived(media.current!.fps || 30)
  const mediaWidth = $derived(media.current!.width || 640)
  const mediaHeight = $derived(media.current!.height || 360)
  const durationInFrames = $derived(mediaType === 'image' ? 1 : Math.max(1, Math.round(media.current!.duration * fps)))
</script>

{#if media.current && mediaType !== 'unknown'}
  <PlayerEmitterProvider>
    <ClockBridgeProvider
      fps={fps}
      durationInFrames={durationInFrames}
      onVolumeChange={() => {}}
    >
      <VideoConfigProvider
        fps={fps}
        width={mediaWidth}
        height={mediaHeight}
        durationInFrames={durationInFrames}
      >
        <SourceMonitorInner
          mediaId={mediaId}
          src={blobUrl}
          mediaType={mediaType}
          hasAudio={mediaType === 'video' && !!media.current.audioCodec}
          fileName={media.current.fileName}
          mediaWidth={mediaWidth}
          mediaHeight={mediaHeight}
          durationInFrames={durationInFrames}
          fps={fps}
          variant={variant}
          interactive={interactive}
          seekFrame={seekFrame}
          onClose={onClose}
         />
      </VideoConfigProvider>
    </ClockBridgeProvider>
  </PlayerEmitterProvider>
{/if}

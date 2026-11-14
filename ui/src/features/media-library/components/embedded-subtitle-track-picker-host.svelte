<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Single mount point for the embedded subtitle track picker.
   *
   * Subscribes to `useEmbeddedSubtitlePickerStore` and renders the
   * picker dialog when `media` is non-null. After insertion succeeds the
   * store is closed and a success toast is fired via the media library
   * notification channel.
   */
  import { useEmbeddedSubtitlePickerStore } from '@/features/media-library/stores/embedded-subtitle-picker-store'
  import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
  import {
    subtitleSidecarService,
    type ExtractEmbeddedSubtitlesResult,
  } from '@/features/media-library/services/subtitle-sidecar-service'
  import type { EmbeddedSubtitleTrack } from '@/shared/utils/matroska-subtitles'
  import { select } from '$lib/store.svelte'
  import EmbeddedSubtitleTrackPicker from './embedded-subtitle-track-picker.svelte'

  const media = select(useEmbeddedSubtitlePickerStore, (s) => s.media)
  const blob = select(useEmbeddedSubtitlePickerStore, (s) => s.blob)
  const errorMessage = select(useEmbeddedSubtitlePickerStore, (s) => s.errorMessage)

  const close = () => useEmbeddedSubtitlePickerStore.getState().close()

  const handlePicked = (track: EmbeddedSubtitleTrack) => {
    const current = media.current
    if (!current) return
    const store = useMediaLibraryStore.getState()
    let result: ExtractEmbeddedSubtitlesResult
    try {
      result = subtitleSidecarService.insertEmbeddedSubtitleTrack(current, track)
    } catch (error) {
      useEmbeddedSubtitlePickerStore
        .getState()
        .setError(error instanceof Error ? error.message : 'Failed to insert subtitles.')
      return
    }
    close()
    store.showNotification({
      type: 'success',
      message:
        result.insertedItemCount > 0
          ? `Inserted ${result.insertedItemCount} subtitle segment${result.insertedItemCount === 1 ? '' : 's'} from "${result.trackLabel}".`
          : `No cues fell inside the clip's range for "${result.trackLabel}".`,
    })
  }
</script>

<EmbeddedSubtitleTrackPicker
  media={media.current}
  blob={blob.current}
  errorMessage={errorMessage.current}
  onClose={close}
  onTrackPicked={handlePicked}
/>

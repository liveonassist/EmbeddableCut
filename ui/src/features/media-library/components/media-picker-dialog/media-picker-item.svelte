<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Video from 'lucide-svelte/icons/video'
  import FileAudio from 'lucide-svelte/icons/file-audio'
  import ImageIcon from 'lucide-svelte/icons/image'
  import type { MediaMetadata } from '@/types/storage'
  import { importMediaLibraryService } from '@/features/media-library/services/media-library-service-loader'
  import { getMediaType, formatDuration } from '@/features/media-library/utils/validation'

  interface MediaPickerItemProps {
    media: MediaMetadata
    onSelect: () => void
  }

  const typeIcons: Record<string, typeof Video> = {
    video: Video,
    audio: FileAudio,
    image: ImageIcon,
    unknown: Video, // Fallback
  }

  let { media, onSelect }: MediaPickerItemProps = $props()

  let thumbnailUrl = $state<string | null>(null)
  const mediaType = $derived(getMediaType(media.mimeType))
  const IconComponent = $derived(typeIcons[mediaType] || Video)

  $effect(() => {
    const mediaId = media.id
    const thumbnailId = media.thumbnailId
    let mounted = true

    const loadThumbnail = async () => {
      const { mediaLibraryService } = await importMediaLibraryService()
      const url = await mediaLibraryService.getThumbnailBlobUrl(mediaId, thumbnailId)
      if (mounted) {
        thumbnailUrl = url
      }
    }

    void loadThumbnail()

    return () => {
      mounted = false
    }
  })
</script>

<button
  onclick={onSelect}
  class="flex w-full items-start gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-secondary/50"
>
  <!-- Thumbnail -->
  <div class="relative w-12 h-12 rounded overflow-hidden bg-secondary flex-shrink-0">
    {#if thumbnailUrl}
      <img src={thumbnailUrl} alt={media.fileName} class="w-full h-full object-cover" />
    {:else}
      <div class="w-full h-full flex items-center justify-center">
        <IconComponent class="w-5 h-5 text-muted-foreground" />
      </div>
    {/if}
  </div>

  <!-- Info -->
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium leading-snug break-words">{media.fileName}</p>
    <p class="text-xs text-muted-foreground">
      {mediaType === 'audio' || mediaType === 'video'
        ? formatDuration(media.duration)
        : `${media.width}x${media.height}`}
    </p>
  </div>

  <!-- Type icon -->
  <IconComponent class="w-4 h-4 text-muted-foreground flex-shrink-0" />
</button>

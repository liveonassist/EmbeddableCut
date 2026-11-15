/**
 * Adapter exports for media-library dependencies.
 * Renderer modules should import media resolution helpers from here.
 */

import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
import { isVideoMimeType } from '@/shared/utils/media-mime'

export { resolveMediaUrl, resolveProxyUrl } from '@/features/media-library/utils/media-resolver'

export function getMediaAudioCodecById(mediaId: string | undefined): string | undefined {
  if (!mediaId) return undefined

  const media = useMediaLibraryStore.getState().mediaById[mediaId]
  if (!media) return undefined

  if (isVideoMimeType(media.mimeType)) {
    return media.audioCodec
  }
  if (media.mimeType.startsWith('audio/')) {
    return media.codec
  }
  return undefined
}

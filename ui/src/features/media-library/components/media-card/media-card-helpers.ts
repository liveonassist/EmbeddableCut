// SPDX-License-Identifier: MIT

import { i18n } from '@/i18n'
import type { MediaMetadata } from '@/types/storage'
import { FileAccessError } from '@/features/media-library/services/file-access'
import { importMediaLibraryService } from '@/features/media-library/services/media-library-service-loader'
import { getMediaType } from '@/features/media-library/utils/validation'
import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
import type { InterpolationFactor } from '@/infrastructure/interpolation'
import type { UpscaleVariant } from '@/infrastructure/upscale'

export interface MediaCardProps {
  media: MediaMetadata
  selected?: boolean
  isBroken?: boolean
  onSelect?: (event: MouseEvent) => void
  onDoubleClick?: () => void
  onDelete?: (mediaIds: string[]) => void
  onRelink?: () => void
}

export const DEFAULT_CAPTION_SELECTION_DURATION_SEC = 3

export function getSkimIndicatorStyle(progress: number): string {
  if (progress >= 0.999) {
    return 'right: 0px;'
  }

  return `left: ${progress * 100}%;`
}

export function canExtractEmbeddedSubtitlesFromMedia(media: MediaMetadata): boolean {
  const fileName = media.fileName.toLowerCase()
  const isSupportedContainer =
    media.mimeType === 'video/x-matroska' ||
    media.mimeType === 'video/matroska' ||
    media.mimeType === 'video/webm' ||
    fileName.endsWith('.mkv') ||
    fileName.endsWith('.webm')

  return (
    isSupportedContainer &&
    (getMediaType(media.mimeType) === 'video' ||
      fileName.endsWith('.mkv') ||
      fileName.endsWith('.webm'))
  )
}

export async function requestSubtitleSourcePermission(media: MediaMetadata): Promise<boolean> {
  if (media.storageType !== 'handle' || !media.fileHandle) {
    return true
  }

  try {
    return (await media.fileHandle.requestPermission({ mode: 'read' })) === 'granted'
  } catch {
    return false
  }
}

export async function getSubtitleSourceBlob(media: MediaMetadata): Promise<Blob> {
  if (media.storageType === 'handle' && media.fileHandle) {
    return media.fileHandle.getFile()
  }

  const { mediaLibraryService } = await importMediaLibraryService()
  const blob = await mediaLibraryService.getMediaFile(media.id)
  if (!blob) {
    throw new FileAccessError(`Media file "${media.fileName}" is unavailable.`, 'file_missing')
  }
  return blob
}

// Internal Error messages stay technical; user-facing strings use i18n below.

export function markSubtitleSourceUnreadable(
  media: MediaMetadata,
  errorType: 'permission_denied' | 'file_missing',
) {
  const store = useMediaLibraryStore.getState()
  store.markMediaBroken(media.id, {
    mediaId: media.id,
    fileName: media.fileName,
    errorType,
  })
  store.openMissingMediaDialog()
}

function getErrorName(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name)
    : null
}

export function getSubtitleExtractionErrorMessage(error: unknown, media: MediaMetadata): string {
  if (error instanceof FileAccessError) {
    if (error.type === 'permission_denied') {
      markSubtitleSourceUnreadable(media, 'permission_denied')
      return i18n.t('media.card.subtitlesNeedPermission', { name: media.fileName })
    }
    if (error.type === 'file_missing') {
      markSubtitleSourceUnreadable(media, 'file_missing')
      return i18n.t('media.card.subtitlesFileMissing', { name: media.fileName })
    }
    return i18n.t('media.card.subtitlesCannotRead', { name: media.fileName })
  }

  const errorName = getErrorName(error)
  if (errorName) {
    if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
      markSubtitleSourceUnreadable(media, 'permission_denied')
      return i18n.t('media.card.subtitlesNeedPermission', { name: media.fileName })
    }
    if (errorName === 'NotFoundError') {
      markSubtitleSourceUnreadable(media, 'file_missing')
      return i18n.t('media.card.subtitlesFileMissing', { name: media.fileName })
    }
    if (errorName === 'NotReadableError') {
      return i18n.t('media.card.subtitlesCannotRead', { name: media.fileName })
    }
  }

  return error instanceof Error ? error.message : i18n.t('media.card.subtitlesExtractFailed')
}

export interface MediaCardActionMenuProps {
  /** The media, for what hosts add to its menu. */
  media?: MediaMetadata
  isBroken: boolean
  onRelink?: () => void
  canGenerateProxy: boolean
  hasProxy: boolean
  proxyStatus?: 'generating' | 'ready' | 'error'
  canInterpolate: boolean
  isInterpolating: boolean
  onInterpolate: (factor: InterpolationFactor) => void
  onCancelInterpolation: () => void
  canUpscale: boolean
  isUpscaling: boolean
  onUpscale: (variant: UpscaleVariant) => void
  onCancelUpscale: () => void
  isTranscribable: boolean
  isTranscribing: boolean
  hasTranscript: boolean
  canExtractEmbeddedSubtitles: boolean
  isExtractingEmbeddedSubtitles: boolean
  isTaggable: boolean
  isTagging: boolean
  onGenerateProxy: (event: MouseEvent) => void | Promise<void>
  onDeleteProxy: (event: MouseEvent) => Promise<void>
  onGenerateTranscript: (event: MouseEvent) => void | Promise<void>
  onDeleteTranscript: (event: MouseEvent) => Promise<void>
  onExtractEmbeddedSubtitles: (event: MouseEvent) => void | Promise<void>
  onAnalyzeWithAI: (event: MouseEvent) => void
  onDelete: (event: MouseEvent) => void
}

function resolveProxyGroupVisibility(props: MediaCardActionMenuProps) {
  const canShowGenerateProxy =
    props.canGenerateProxy && !props.hasProxy && props.proxyStatus !== 'generating'
  return {
    canShowGenerateProxy,
    showProxyGroup: !props.isBroken && (canShowGenerateProxy || props.hasProxy),
  }
}

function resolveTranscriptGroupVisibility(props: MediaCardActionMenuProps) {
  const canShowGenerateTranscript =
    props.isTranscribable && !props.isBroken && !props.isTranscribing
  const canShowDeleteTranscript =
    props.isTranscribable && !props.isBroken && props.hasTranscript && !props.isTranscribing
  return {
    canShowGenerateTranscript,
    canShowDeleteTranscript,
    showTranscriptGroup: canShowGenerateTranscript || canShowDeleteTranscript,
  }
}

/**
 * Which context-menu groups this media item gets. Kept out of the component so the render
 * body stays a flat list of `if (show) push(...)` rather than a thicket of boolean chains.
 */
export function resolveMenuVisibility(props: MediaCardActionMenuProps) {
  return {
    ...resolveProxyGroupVisibility(props),
    ...resolveTranscriptGroupVisibility(props),
    showBrokenGroup: props.isBroken && Boolean(props.onRelink),
    showInterpolationGroup: props.canInterpolate && !props.isBroken,
    showUpscaleGroup: props.canUpscale && !props.isBroken,
    showEmbeddedSubtitleGroup: props.canExtractEmbeddedSubtitles && !props.isBroken,
    showAiGroup: props.isTaggable && !props.isBroken && !props.isTagging,
  }
}

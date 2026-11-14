/**
 * UI half of `media-library-contract`: the components and hooks that stay with the app.
 */

export { MediaLibrary } from '@/features/media-library/components/media-library'
export const importEmbeddedSubtitleTrackPickerHost = () =>
  import('@/features/media-library/components/embedded-subtitle-track-picker-host')
export const importSubtitleScanProgressDialog = () =>
  import('@/features/media-library/components/subtitle-scan-progress-dialog')

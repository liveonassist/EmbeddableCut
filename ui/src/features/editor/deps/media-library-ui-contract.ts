// SPDX-License-Identifier: MIT

/**
 * UI half of `media-library-contract`: the components and hooks that stay with the app.
 */

export { default as MediaLibrary } from '@/features/media-library/components/media-library.svelte'
export const importEmbeddedSubtitleTrackPickerHost = () =>
  import('@/features/media-library/components/embedded-subtitle-track-picker-host.svelte')
export const importSubtitleScanProgressDialog = () =>
  import('@/features/media-library/components/subtitle-scan-progress-dialog.svelte')

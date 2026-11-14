// SPDX-License-Identifier: MIT

import { useMediaLibraryStore } from '@/runtime/composition-runtime/deps/stores'
import { createLogger } from '@/shared/logging/logger'

export const videoLog = createLogger('NativePreviewVideo')
export const contentLog = createLogger('VideoContent')

// Media IDs discovered to be undecodable by a <video> element (e.g. ProRes). Once a
// clip fails and falls back to live turbores decode, we remember it for the session so
// later mounts skip the doomed <video> entirely — avoiding a remount → error → retry →
// re-resolve flicker loop.
export const liveDecodeMediaIds = new Set<string>()

// Whether a media item must skip the <video> element and decode live (ProRes and other
// browser-undecodable codecs). Consulted both when initializing state and when the active
// item changes on a pooled VideoContent lane, so a fresh item recomputes its decode path
// instead of inheriting the previous clip's fallback state.
export function shouldUseLiveDecodeForMedia(mediaId: string | undefined): boolean {
  if (mediaId === undefined) return false
  if (liveDecodeMediaIds.has(mediaId)) return true
  // Detect browser-undecodable codecs (ProRes) up front from the import-time codec probe, so
  // we skip mounting the <video> element that would error, invalidate the blob URL, and flash
  // "Media not loaded" while it re-resolves and falls back. Older media without the flag
  // (undefined) keep the error-driven fallback path.
  const media = useMediaLibraryStore.getState().mediaById[mediaId]
  if (media?.videoCodecSupported === false) {
    liveDecodeMediaIds.add(mediaId)
    return true
  }
  return false
}

videoLog.setLevel(2) // WARN — suppress noisy per-frame debug logs
export const POOL_RELEASE_STICKY_MS = 400

// Feature detection for requestVideoFrameCallback (avoids per-frame reactive sync)
export const supportsRVFC =
  typeof HTMLVideoElement !== 'undefined' &&
  'requestVideoFrameCallback' in HTMLVideoElement.prototype

export function isRecoverableVideoLoadError(message: string): boolean {
  return /format error|unknown|empty src|not allowed to load local resource|ERR_UPLOAD_FILE_CHANGED|ERR_FILE_NOT_FOUND|PIPELINE_ERROR_DISCONNECTED|decode error|network/i.test(
    message,
  )
}

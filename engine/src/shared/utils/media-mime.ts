// SPDX-License-Identifier: MIT

/**
 * HLS playlists are media in their own right here: a playlist with video is
 * edited as video (`application/vnd.apple.mpegurl`), one with only audio as
 * audio (`audio/mpegurl`). FreeCut tells kinds apart by a `video/` prefix,
 * which a playlist's MIME type doesn't have.
 */

const HLS_VIDEO_MIME_TYPES = new Set(['application/vnd.apple.mpegurl', 'application/x-mpegurl'])
const HLS_AUDIO_MIME_TYPES = new Set(['audio/mpegurl', 'audio/x-mpegurl'])

/** The MIME type an HLS playlist with video is stored with. */
export const HLS_MIME_TYPE = 'application/vnd.apple.mpegurl'

function baseMimeType(mimeType: string): string {
  return (mimeType.split(';')[0] ?? mimeType).trim().toLowerCase()
}

export function isHlsMimeType(mimeType: string): boolean {
  const base = baseMimeType(mimeType)
  return HLS_VIDEO_MIME_TYPES.has(base) || HLS_AUDIO_MIME_TYPES.has(base)
}

/** Whether media of this type is edited as video: any `video/` type, or an HLS playlist. */
export function isVideoMimeType(mimeType: string): boolean {
  const base = baseMimeType(mimeType)
  return base.startsWith('video/') || HLS_VIDEO_MIME_TYPES.has(base)
}

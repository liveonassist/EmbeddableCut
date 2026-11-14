// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

interface UseGifFramesOptions {
  /** Media ID from the timeline item */
  mediaId: string
  /** Blob URL for the GIF file */
  blobUrl: string | null
  /** Whether the clip is currently visible in viewport */
  isVisible: boolean
  /** Whether to enable GIF frames (allows conditional disabling) */
  enabled?: boolean
  /** Image format — determines extraction method ('gif' = gifuct-js, 'webp' = ImageDecoder) */
  format?: 'gif' | 'webp'
}

/** Every field is a reactive getter. */
interface UseGifFramesResult {
  readonly frames: ImageBitmap[] | null
  readonly durations: number[] | null
  readonly totalDuration: number | null
  readonly isLoading: boolean
  readonly isComplete: boolean
  readonly progress: number
  readonly error: string | null
  getFrameAtTime: (timeMs: number) => ImageBitmap | null
}

/** Pre-extracted GIF frames for a clip. This stand-in never loads any. */
export function useGifFrames(_options: () => UseGifFramesOptions): UseGifFramesResult {
  return {
    frames: null,
    durations: null,
    totalDuration: null,
    isLoading: false,
    isComplete: false,
    progress: 0,
    error: null,
    getFrameAtTime: () => null,
  }
}

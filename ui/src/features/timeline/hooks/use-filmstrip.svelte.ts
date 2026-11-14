// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

import type { FilmstripFrame } from '@/features/timeline/services/filmstrip-cache'

export type { FilmstripFrame }

interface UseFilmstripOptions {
  mediaId: string
  blobUrl: string | null
  duration: number
  isVisible: boolean
  enabled?: boolean
  priorityWindow?: { startTime: number; endTime: number } | null
  targetFrameCount?: number
  targetFrameIndices?: number[]
}

interface UseFilmstripResult {
  readonly frames: FilmstripFrame[] | null
  readonly isLoading: boolean
  readonly isComplete: boolean
  readonly progress: number
  readonly error: string | null
}

export function useFilmstrip(_options: () => UseFilmstripOptions): UseFilmstripResult {
  return { frames: null, isLoading: false, isComplete: false, progress: 0, error: null }
}

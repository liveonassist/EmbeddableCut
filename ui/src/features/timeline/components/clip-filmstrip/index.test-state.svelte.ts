// SPDX-License-Identifier: MIT

/**
 * Reactive stand-ins for the hooks ClipFilmstrip calls once at initialisation.
 * React's tests swap a mock's return value and re-render; here the test writes
 * the state these mocks read, and the component updates like it would for the
 * real hooks.
 */

export type FilmstripResult = {
  frames: Array<{ index: number; timestamp: number; url: string }> | null
  isLoading: boolean
  isComplete: boolean
  progress: number
  error: string | null
}

export type FilmstripOptions = {
  mediaId?: string
  blobUrl?: string | null
  enabled?: boolean
  targetFrameCount?: number
  targetFrameIndices?: number[]
  priorityWindow?: { startTime: number; endTime: number } | null
}

const EMPTY_FILMSTRIP: FilmstripResult = {
  frames: null,
  isLoading: false,
  isComplete: false,
  progress: 0,
  error: null,
}

let filmstripResult = $state.raw<FilmstripResult>(EMPTY_FILMSTRIP)
let filmstripOptions: (() => FilmstripOptions) | null = null

export function setFilmstripResult(result: FilmstripResult): void {
  filmstripResult = result
}

/** The options the component currently passes to `useFilmstrip`. */
export function latestFilmstripOptions(): FilmstripOptions | undefined {
  return filmstripOptions?.()
}

export function useFilmstripMock(options: () => FilmstripOptions) {
  filmstripOptions = options
  return {
    get frames() {
      return filmstripResult.frames
    },
    get isLoading() {
      return filmstripResult.isLoading
    },
    get isComplete() {
      return filmstripResult.isComplete
    },
    get progress() {
      return filmstripResult.progress
    },
    get error() {
      return filmstripResult.error
    },
  }
}

type MediaBlobUrlState = {
  blobUrl: string | null
  setBlobUrl: (url: string | null) => void
  hasStartedLoadingRef: { current: boolean }
  blobUrlVersion: number
}

let mediaBlobUrl = $state.raw<MediaBlobUrlState>({
  blobUrl: 'blob:original',
  setBlobUrl: () => {},
  hasStartedLoadingRef: { current: true },
  blobUrlVersion: 0,
})

export function setMediaBlobUrl(state: MediaBlobUrlState): void {
  mediaBlobUrl = state
}

export function useMediaBlobUrlMock() {
  return {
    get blobUrl() {
      return mediaBlobUrl.blobUrl
    },
    setBlobUrl: (url: string | null) => mediaBlobUrl.setBlobUrl(url),
    get hasStartedLoadingRef() {
      return mediaBlobUrl.hasStartedLoadingRef
    },
    get blobUrlVersion() {
      return mediaBlobUrl.blobUrlVersion
    },
  }
}

export function resetClipFilmstripMocks(): void {
  filmstripResult = EMPTY_FILMSTRIP
  filmstripOptions = null
}

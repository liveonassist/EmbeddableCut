// SPDX-License-Identifier: MIT

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, waitFor } from '@testing-library/svelte'

const editorStoreState = vi.hoisted(() => ({
  sourcePreviewMediaId: 'media-1' as string | null,
}))

const sourcePlayerStoreState = vi.hoisted(() => ({
  hoveredPanel: null as string | null,
  playerMethods: null as unknown,
  currentMediaId: null as string | null,
  currentSourceFrame: 0,
  previewSourceFrame: null as number | null,
  inPoint: null as number | null,
  outPoint: null as number | null,
  pendingSeekFrame: null as number | null,
  setHoveredPanel: vi.fn(),
  setPlayerMethods: vi.fn(),
  setCurrentMediaId: vi.fn(),
  releaseCurrentMediaId: vi.fn(),
  setCurrentSourceFrame: vi.fn(),
  setPreviewSourceFrame: vi.fn(),
  setInPoint: vi.fn(),
  setOutPoint: vi.fn(),
  clearInOutPoints: vi.fn(),
  setPendingSeekFrame: vi.fn(),
}))

const mediaStoreState = vi.hoisted(() => {
  const media1 = {
    id: 'media-1',
    fileName: 'clip.mp4',
    mimeType: 'video/mp4',
    duration: 5,
    width: 1920,
    height: 1080,
    fps: 30,
    audioCodec: 'aac',
  }
  return {
    mediaItems: [media1],
    mediaById: { 'media-1': media1 } as Record<string, typeof media1>,
  }
})

const itemsStoreState = vi.hoisted(() => ({
  tracks: [],
}))

const playerMethodsState = vi.hoisted(() => ({
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
  frameBack: vi.fn(),
  frameForward: vi.fn(),
}))

const clockState = vi.hoisted(() => ({
  currentFrame: 0,
  isPlaying: false,
  playbackRate: 1,
}))

vi.mock('@/features/preview/deps/player-context', async () => {
  const Passthrough = (await import('./passthrough.harness.svelte')).default
  return {
    PlayerEmitterProvider: Passthrough,
    ClockBridgeProvider: Passthrough,
    VideoConfigProvider: Passthrough,
    useClock: () => ({
      currentFrame: clockState.currentFrame,
      isPlaying: clockState.isPlaying,
      onFrameChange: () => () => {},
    }),
    useClockIsPlaying: () => ({
      get current() {
        return clockState.isPlaying
      },
    }),
    useClockPlaybackRate: () => ({
      get current() {
        return clockState.playbackRate
      },
    }),
    usePlayer: () => playerMethodsState,
  }
})

vi.mock('./source-composition', async () => ({
  SourceComposition: (await import('./source-monitor.composition.harness.svelte')).default,
}))

vi.mock('@/components/ui/tooltip', async () => {
  const Passthrough = (await import('./passthrough.harness.svelte')).default
  return { Tooltip: Passthrough, TooltipTrigger: Passthrough, TooltipContent: Passthrough }
})

vi.mock('@/components/ui/dropdown-menu', async () => {
  const Passthrough = (await import('./passthrough.harness.svelte')).default
  const Empty = (await import('./empty.harness.svelte')).default
  return {
    DropdownMenu: Passthrough,
    DropdownMenuTrigger: Passthrough,
    DropdownMenuContent: Passthrough,
    DropdownMenuItem: Passthrough,
    DropdownMenuLabel: Passthrough,
    DropdownMenuSeparator: Empty,
  }
})

vi.mock('@/features/preview/utils/media-resolver', () => ({
  resolveMediaUrl: vi.fn().mockResolvedValue('blob:media-1'),
}))

vi.mock('@/features/preview/deps/media-library', () => {
  const useMediaLibraryStore = Object.assign(
    Object.assign(
      (selector: (state: typeof mediaStoreState) => unknown) => selector(mediaStoreState),
      { getState: () => mediaStoreState, subscribe: () => () => {} },
    ),
    { getState: () => mediaStoreState },
  )

  return {
    useMediaLibraryStore,
    getMediaType: (mimeType: string) => {
      if (mimeType.startsWith('video/')) return 'video'
      if (mimeType.startsWith('audio/')) return 'audio'
      if (mimeType.startsWith('image/')) return 'image'
      return 'unknown'
    },
  }
})

vi.mock('@/features/preview/deps/timeline-store', () => {
  const useItemsStore = Object.assign(
    Object.assign(
      (selector: (state: typeof itemsStoreState) => unknown) => selector(itemsStoreState),
      { getState: () => itemsStoreState, subscribe: () => () => {} },
    ),
    { getState: () => itemsStoreState },
  )

  return { useItemsStore }
})

vi.mock('@/features/preview/deps/settings', () => {
  const settingsState = { editorDensity: 'compact' as const }
  const useSettingsStore = Object.assign(
    Object.assign((selector: (state: typeof settingsState) => unknown) => selector(settingsState), {
      getState: () => settingsState,
      subscribe: () => () => {},
    }),
    { getState: () => settingsState },
  )

  return { useSettingsStore }
})

vi.mock('@/shared/state/editor', () => {
  const useEditorStore = Object.assign(
    Object.assign(
      (selector: (state: typeof editorStoreState) => unknown) => selector(editorStoreState),
      { getState: () => editorStoreState, subscribe: () => () => {} },
    ),
    { getState: () => editorStoreState },
  )

  return { useEditorStore }
})

vi.mock('@/shared/state/source-player', () => {
  const useSourcePlayerStore = Object.assign(
    Object.assign(
      (selector: (state: typeof sourcePlayerStoreState) => unknown) =>
        selector(sourcePlayerStoreState),
      { getState: () => sourcePlayerStoreState, subscribe: () => () => {} },
    ),
    { getState: () => sourcePlayerStoreState },
  )

  return { useSourcePlayerStore }
})

vi.mock('@/shared/state/selection', () => {
  const selectionState = { activeTrackId: null as string | null }
  const useSelectionStore = Object.assign(
    Object.assign(
      (selector: (state: typeof selectionState) => unknown) => selector(selectionState),
      { getState: () => selectionState, subscribe: () => () => {} },
    ),
    { getState: () => selectionState },
  )

  return { useSelectionStore }
})

vi.mock('@/features/preview/deps/timeline-source-edit', () => ({
  getTrackKind: (track: { kind?: string | null }) => track.kind ?? null,
  performInsertEdit: vi.fn(),
  performOverwriteEdit: vi.fn(),
  resolveSourceEditTrackTargets: vi.fn(() => null),
}))

import { SourceMonitor } from './source-monitor'

describe('SourceMonitor current media ownership', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      window.clearTimeout(handle)
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    editorStoreState.sourcePreviewMediaId = 'media-1'
    clockState.currentFrame = 0
    clockState.isPlaying = false
  })

  // React's version mounted twice under Strict Mode; Svelte mounts once, so this
  // checks the initial mount claims the media without releasing it.
  it('does not release the current media during the initial mount', async () => {
    render(SourceMonitor, { props: { mediaId: 'media-1' } })

    await waitFor(() => {
      expect(sourcePlayerStoreState.setCurrentMediaId).toHaveBeenCalledWith('media-1')
    })

    expect(sourcePlayerStoreState.releaseCurrentMediaId).not.toHaveBeenCalled()
  })

  it('releases the current media once the source monitor closes', async () => {
    const rendered = render(SourceMonitor, { props: { mediaId: 'media-1' } })

    await waitFor(() => {
      expect(sourcePlayerStoreState.setCurrentMediaId).toHaveBeenCalledWith('media-1')
    })

    editorStoreState.sourcePreviewMediaId = null
    rendered.unmount()

    expect(sourcePlayerStoreState.releaseCurrentMediaId).toHaveBeenCalledWith('media-1')
  })

  it('batches seek bar drags and commits the final frame on mouseup', async () => {
    const rendered = render(SourceMonitor, { props: { mediaId: 'media-1' } })

    await waitFor(() => {
      expect(sourcePlayerStoreState.setCurrentMediaId).toHaveBeenCalledWith('media-1')
    })

    const seekBar = rendered.getByTestId('source-monitor-seek-bar')
    vi.spyOn(seekBar, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 10,
      width: 100,
      height: 10,
      toJSON: () => ({}),
    })

    await fireEvent.mouseDown(seekBar, { clientX: 25 })
    await fireEvent.mouseMove(document, { clientX: 75 })

    expect(playerMethodsState.seek).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(sourcePlayerStoreState.setCurrentSourceFrame).toHaveBeenLastCalledWith(112)
    })

    await fireEvent.mouseUp(document)

    expect(playerMethodsState.seek).toHaveBeenCalledTimes(1)
    expect(playerMethodsState.seek).toHaveBeenCalledWith(112)
  })

  it('pauses playback when seek-bar scrubbing starts', async () => {
    clockState.isPlaying = true
    const rendered = render(SourceMonitor, { props: { mediaId: 'media-1' } })

    await waitFor(() => {
      expect(sourcePlayerStoreState.setCurrentMediaId).toHaveBeenCalledWith('media-1')
    })

    const seekBar = rendered.getByTestId('source-monitor-seek-bar')
    vi.spyOn(seekBar, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 10,
      width: 100,
      height: 10,
      toJSON: () => ({}),
    })

    await fireEvent.mouseDown(seekBar, { clientX: 25 })

    expect(playerMethodsState.pause).toHaveBeenCalledTimes(1)
  })
})

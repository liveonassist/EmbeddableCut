// SPDX-License-Identifier: MIT

import { render, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const filmstripCacheMocks = vi.hoisted(() => ({
  getFromCacheSync: vi.fn(() => null),
  subscribe: vi.fn(() => vi.fn()),
  needsPriorityRefinement: vi.fn(() => false),
  hasPendingExtraction: vi.fn(() => false),
  getFilmstrip: vi.fn(() => new Promise<never>(() => {})),
  loadFromDisk: vi.fn(() => Promise.resolve(null)),
  abort: vi.fn(),
}))

vi.mock('@/features/timeline/services/filmstrip-cache', () => ({
  filmstripCache: filmstripCacheMocks,
}))

vi.mock('@/features/timeline/hooks/preview-work-budget', () => ({
  getPreviewStartupDelayMs: vi.fn(() => 0),
  PREVIEW_IMMEDIATE_IDLE_TIMEOUT_MS: 200,
  schedulePreviewWork: vi.fn((task: () => void) => {
    task()
    return () => {}
  }),
}))

import FilmstripProbe from './use-filmstrip.harness.svelte'
import { schedulePreviewWork } from '@/features/timeline/hooks/preview-work-budget'

describe('useFilmstrip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    filmstripCacheMocks.getFromCacheSync.mockReturnValue(null)
    filmstripCacheMocks.subscribe.mockReturnValue(vi.fn())
    filmstripCacheMocks.needsPriorityRefinement.mockReturnValue(false)
    filmstripCacheMocks.hasPendingExtraction.mockReturnValue(false)
    filmstripCacheMocks.getFilmstrip.mockReturnValue(new Promise<never>(() => {}))
    filmstripCacheMocks.loadFromDisk.mockReturnValue(Promise.resolve(null))
  })

  it('aborts extraction when the clip leaves the active workset', async () => {
    const view = render(FilmstripProbe, { mediaId: 'media-1', isVisible: true })

    await waitFor(() => {
      expect(filmstripCacheMocks.getFilmstrip).toHaveBeenCalledWith(
        'media-1',
        'blob:test',
        10,
        expect.any(Function),
        undefined,
        {
          targetFrameCount: undefined,
          targetFrameIndices: undefined,
        },
      )
    })

    await view.rerender({ mediaId: 'media-1', isVisible: false })

    expect(filmstripCacheMocks.abort).toHaveBeenCalledWith('media-1')
  })

  it('aborts extraction on unmount or media switch', async () => {
    const view = render(FilmstripProbe, { mediaId: 'media-1', isVisible: true })

    await waitFor(() => {
      expect(filmstripCacheMocks.getFilmstrip).toHaveBeenCalled()
    })

    view.unmount()

    expect(filmstripCacheMocks.abort).toHaveBeenCalledWith('media-1')
  })

  it('starts visible filmstrip work without waiting on the audio startup hold', async () => {
    render(FilmstripProbe, { mediaId: 'media-1', isVisible: true })

    await waitFor(() => {
      expect(schedulePreviewWork).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          delayMs: 0,
          ignoreAudioStartupHold: true,
        }),
      )
    })
  })
})

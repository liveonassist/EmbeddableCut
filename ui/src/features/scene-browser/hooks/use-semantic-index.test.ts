// SPDX-License-Identifier: MIT

import { render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createStore } from 'zustand/vanilla'

const ensureEmbeddingsLoadedMock = vi.fn()
const indexMediaCaptionsMock = vi.fn()
const indexMediaImageCaptionsMock = vi.fn()
const isMediaMissingEmbeddingsMock = vi.fn()
const isMediaMissingImageEmbeddingsMock = vi.fn()

type MediaItem = {
  id: string
  aiCaptions?: Array<{ timeSec: number; text: string }>
}

const useMediaLibraryStore = createStore<{
  mediaItems: MediaItem[]
  taggingMediaIds: Set<string>
}>(() => ({
  mediaItems: [],
  taggingMediaIds: new Set<string>(),
}))

const useSettingsStore = createStore<{
  captionSearchMode: 'keyword' | 'semantic'
}>(() => ({
  captionSearchMode: 'keyword',
}))

vi.mock('@/features/scene-browser/deps/media-library', () => ({
  useMediaLibraryStore,
}))

vi.mock('@/features/scene-browser/deps/settings', () => ({
  useSettingsStore,
}))

vi.mock('@/features/scene-browser/utils/embeddings-cache', () => ({
  ensureEmbeddingsLoaded: ensureEmbeddingsLoadedMock,
  indexMediaCaptions: indexMediaCaptionsMock,
  indexMediaImageCaptions: indexMediaImageCaptionsMock,
  isMediaMissingEmbeddings: isMediaMissingEmbeddingsMock,
  isMediaMissingImageEmbeddings: isMediaMissingImageEmbeddingsMock,
}))

const { default: SemanticIndexProbe } = await import('./use-semantic-index.harness.svelte')

describe('useSemanticIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ captionSearchMode: 'semantic' })
    useMediaLibraryStore.setState({
      mediaItems: [
        {
          id: 'media-1',
          aiCaptions: [{ timeSec: 0, text: 'A scene' }],
        },
      ],
      taggingMediaIds: new Set<string>(),
    })
  })

  it('clears stale progress when a rerun becomes a no-op after store updates', async () => {
    let textIndexed = false

    ensureEmbeddingsLoadedMock.mockResolvedValue(undefined)
    isMediaMissingEmbeddingsMock.mockImplementation(() => !textIndexed)
    isMediaMissingImageEmbeddingsMock.mockReturnValue(false)
    indexMediaImageCaptionsMock.mockResolvedValue(undefined)
    indexMediaCaptionsMock.mockImplementation(async (mediaId: string) => {
      await Promise.resolve()
      textIndexed = true
      useMediaLibraryStore.setState((state) => ({
        mediaItems: state.mediaItems.map((item) =>
          item.id === mediaId ? { ...item, aiCaptions: [...(item.aiCaptions ?? [])] } : item,
        ),
      }))
      await Promise.resolve()
    })

    render(SemanticIndexProbe)

    await waitFor(() => {
      expect(screen.getByTestId('semantic-index-probe')).toHaveAttribute('data-total', '1')
    })

    await waitFor(() => {
      expect(indexMediaCaptionsMock).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('semantic-index-probe')).toHaveAttribute('data-indexing', '0')
      expect(screen.getByTestId('semantic-index-probe')).toHaveAttribute('data-total', '0')
      expect(screen.getByTestId('semantic-index-probe')).toHaveAttribute('data-loading', 'false')
    })
  })
})

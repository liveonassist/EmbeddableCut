// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
import { GridMediaGrid } from './media-grid'

describe('MediaGrid empty state', () => {
  beforeEach(() => {
    useMediaLibraryStore.setState({ mediaItems: [], isLoading: false })
  })

  it('offers adding media by URL, not a file picker, when local import is off', async () => {
    const importMedia = vi.fn(async () => {})
    useMediaLibraryStore.setState({ importMedia } as never)
    const onAddFromUrl = vi.fn()

    render(GridMediaGrid, { localImport: false, onAddFromUrl })

    expect(screen.queryByText('MP4')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: /Add Media From URL/ }))

    expect(onAddFromUrl).toHaveBeenCalledTimes(1)
    expect(importMedia).not.toHaveBeenCalled()
  })

  it('renders nothing to click when local import is off and URL media is unavailable', () => {
    render(GridMediaGrid, { localImport: false })

    expect(screen.queryByRole('button')).toBeNull()
  })
})

// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
import MediaLibraryHarness from './media-library.harness.svelte'

const both = { local: true, url: true }

async function openUrlDialog() {
  await fireEvent.click(screen.getByRole('button', { name: 'URL' }))
  return screen.findByRole('dialog')
}

async function submitUrl(url: string) {
  const input = screen.getByPlaceholderText('https://example.com/video.mp4')
  await fireEvent.input(input, { target: { value: url } })
  await fireEvent.submit(input.closest('form')!)
}

describe('MediaLibrary URL media', () => {
  beforeEach(() => {
    useMediaLibraryStore.setState({ currentProjectId: 'project-1', isLoading: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds a URL in place through the SDK and closes the dialog', async () => {
    const addUrl = vi.fn().mockResolvedValue({ id: 'asset-1' })
    const download = vi.spyOn(useMediaLibraryStore.getState(), 'importMediaFromUrl')
    render(MediaLibraryHarness, { mediaSources: both, addUrl })

    await openUrlDialog()
    expect(screen.getByRole('button', { name: /Stream/ })).toHaveAttribute('aria-pressed', 'true')
    await submitUrl('  https://cdn.example.com/clip.mp4 ')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(addUrl).toHaveBeenCalledWith({ url: 'https://cdn.example.com/clip.mp4' })
    expect(download).not.toHaveBeenCalled()
  })

  it("keeps the dialog open with the SDK's error when the URL is refused", async () => {
    const addUrl = vi.fn().mockRejectedValue(new Error('The server does not allow CORS'))
    render(MediaLibraryHarness, { mediaSources: both, addUrl })

    await openUrlDialog()
    await submitUrl('https://cdn.example.com/clip.mp4')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't add media from URL")
    expect(alert).toHaveTextContent('The server does not allow CORS')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it("still downloads into the workspace in FreeCut's mode", async () => {
    const addUrl = vi.fn()
    const download = vi
      .spyOn(useMediaLibraryStore.getState(), 'importMediaFromUrl')
      .mockResolvedValue([])
    render(MediaLibraryHarness, { mediaSources: both, addUrl })

    await openUrlDialog()
    await fireEvent.click(screen.getByRole('button', { name: /Download/ }))
    await submitUrl('https://cdn.example.com/clip.mp4')

    await waitFor(() => expect(download).toHaveBeenCalledWith('https://cdn.example.com/clip.mp4'))
    expect(addUrl).not.toHaveBeenCalled()
  })

  it('hides local-file import when the host turned local media off', async () => {
    render(MediaLibraryHarness, { mediaSources: { local: false, url: true }, addUrl: vi.fn() })

    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import options' })).not.toBeInTheDocument()

    await openUrlDialog()
    expect(screen.queryByRole('group', { name: 'How to add it' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add Media From URL' })).toBeInTheDocument()
  })

  it('offers only the workspace download when the host turned URL media off', async () => {
    render(MediaLibraryHarness, { mediaSources: { local: true, url: false }, addUrl: vi.fn() })

    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
    await openUrlDialog()
    expect(screen.queryByRole('group', { name: 'How to add it' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Import From URL' })).toBeInTheDocument()
  })
})

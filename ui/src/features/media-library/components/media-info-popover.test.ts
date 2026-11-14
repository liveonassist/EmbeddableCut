// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { MediaMetadata, MediaTranscript } from '@/types/storage'

const mediaTranscriptionServiceMocks = vi.hoisted(() => ({
  getTranscript: vi.fn(),
}))

vi.mock('@/features/media-library/services/media-transcription-service', () => ({
  mediaTranscriptionService: mediaTranscriptionServiceMocks,
}))

vi.mock('@/features/media-library/transcription/registry', () => ({
  getMediaTranscriptionModelLabel: (model: string) => (model === 'whisper-tiny' ? 'Tiny' : model),
}))

vi.mock('@/infrastructure/storage', () => ({
  hasMediaSource: vi.fn(async () => false),
  validateMediaHandle: vi.fn(async () => ({ kind: 'ok' })),
}))

import MediaInfoPopover from './media-info-popover.svelte'

function makeMedia(overrides: Partial<MediaMetadata> = {}): MediaMetadata {
  return {
    id: 'media-1',
    storageType: 'handle',
    fileName: 'clip.mp4',
    fileSize: 1024,
    mimeType: 'video/mp4',
    duration: 5,
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    bitrate: 5000,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('MediaInfoPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and displays transcript details when opened', async () => {
    const transcript: MediaTranscript = {
      id: 'media-1',
      mediaId: 'media-1',
      model: 'whisper-tiny',
      quantization: 'q8',
      text: 'Hello world from transcript',
      segments: [{ text: 'Hello world', start: 1.25, end: 2.5 }],
      createdAt: 1,
      updatedAt: 1,
    }
    mediaTranscriptionServiceMocks.getTranscript.mockResolvedValue(transcript)
    const onSeekToCaption = vi.fn()

    render(MediaInfoPopover, { media: makeMedia(), onSeekToCaption })

    await fireEvent.click(screen.getByTitle('Media info'))

    await waitFor(() => {
      expect(mediaTranscriptionServiceMocks.getTranscript).toHaveBeenCalledWith('media-1')
    })

    expect(await screen.findByText('Transcript (1)')).toBeInTheDocument()
    expect(screen.getByText('Tiny')).toBeInTheDocument()
    expect(screen.getByText('Hello world from transcript')).toBeInTheDocument()
    expect(screen.getByText('30.00 fps')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '0:01' }))
    expect(onSeekToCaption).toHaveBeenCalledWith(1.25)
  })
})

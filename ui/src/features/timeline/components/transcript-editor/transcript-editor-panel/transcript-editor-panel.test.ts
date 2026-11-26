// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { VideoItem } from '@/types/timeline'
import type { MediaTranscript } from '@/types/storage'
import { useSelectionStore } from '@/shared/state/selection'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { useTranscriptIgnoreStore } from '@/features/timeline/stores/transcript-ignore-store'

const transcript: MediaTranscript = {
  id: 'media-1',
  mediaId: 'media-1',
  model: 'whisper-tiny',
  quantization: 'q8',
  text: 'Hello world again',
  segments: [
    {
      text: 'Hello world again',
      start: 0,
      end: 1.5,
      words: [
        { text: 'Hello', start: 0, end: 0.4 },
        { text: 'world', start: 0.5, end: 0.9 },
        { text: 'again', start: 1, end: 1.4 },
      ],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
} as unknown as MediaTranscript

vi.mock('@/features/timeline/deps/media-transcription-service', () => ({
  cancelMediaTranscriptionJob: vi.fn(),
  runMediaTranscriptionJob: vi.fn(),
  mediaTranscriptionService: {
    getTranscript: vi.fn(async () => transcript),
    syncExistingTranscriptCaptions: vi.fn(),
    onTranscriptChanged: vi.fn(() => () => {}),
  },
}))

const { TranscriptEditorPanel } = await import('./index')

function makeVideoItem(overrides: Partial<VideoItem> = {}): VideoItem {
  return {
    id: 'clip-1',
    type: 'video',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 60,
    label: 'clip.mp4',
    src: 'blob:test',
    mediaId: 'media-1',
    sourceStart: 0,
    sourceEnd: 60,
    sourceDuration: 60,
    sourceFps: 30,
    ...overrides,
  }
}

describe('TranscriptEditorPanel', () => {
  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture ??= () => {}
    useTimelineSettingsStore.setState({ fps: 30 })
    useItemsStore.getState().setItems([makeVideoItem()])
    useSelectionStore.setState({ selectedItemIds: ['clip-1'] })
    useTranscriptIgnoreStore.getState().clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the selected clip transcript as words without extra spacing', async () => {
    const { container } = render(TranscriptEditorPanel, { active: true })

    await vi.waitFor(() => expect(container.querySelector('[data-token-index="0"]')).not.toBeNull())

    const paragraph = container.querySelector('[data-token-index="0"]')!.parentElement!
    expect(paragraph.textContent).toBe('Hello world again')
    expect(screen.getByText('Hello').tagName).toBe('SPAN')
  })

  it('marks the selected words for deletion with Backspace', async () => {
    const { container } = render(TranscriptEditorPanel, { active: true })

    await vi.waitFor(() => expect(container.querySelector('[data-token-index="1"]')).not.toBeNull())

    const word = container.querySelector<HTMLElement>('[data-token-index="1"]')!
    await fireEvent.pointerDown(word, { pointerId: 1 })
    flushSync()
    expect(word.className).toContain('bg-primary')

    const region = screen.getByRole('region')
    await fireEvent.keyDown(region, { key: 'Backspace' })
    flushSync()

    expect(Object.keys(useTranscriptIgnoreStore.getState().ranges)).toEqual(['media-1'])
    expect(word.className).toContain('line-through')
  })
  it('keeps the word selection through an edit to another clip', async () => {
    const { container } = render(TranscriptEditorPanel, { active: true })
    await vi.waitFor(() => expect(container.querySelector('[data-token-index="1"]')).not.toBeNull())
    const word = container.querySelector<HTMLElement>('[data-token-index="1"]')!
    await fireEvent.pointerDown(word, { pointerId: 1 })
    flushSync()

    useItemsStore
      .getState()
      .setItems([makeVideoItem(), makeVideoItem({ id: 'clip-2', mediaId: 'media-2', from: 60 })])
    flushSync()

    expect(word.className).toContain('bg-primary')
  })
})

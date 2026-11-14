// SPDX-License-Identifier: MIT

import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
import { useNewTrackZonePreviewStore } from '@/features/timeline/stores/new-track-zone-preview-store'
import { createDefaultClassicTracks } from '@/features/timeline/utils/classic-tracks'
import { clearAllTimelineDropPreviewOwners } from '@/features/timeline/utils/drop-preview-owner'
import type { MediaMetadata } from '@/types/storage'
import Harness from './timeline-media-drop-zone.harness.svelte'

const { getMediaDragDataMock } = vi.hoisted(() => ({ getMediaDragDataMock: vi.fn() }))

vi.mock('@/features/timeline/deps/media-library-resolver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/timeline/deps/media-library-resolver')>()),
  getMediaDragData: getMediaDragDataMock,
}))

function dragEvent(type: string, init: { clientX?: number; clientY?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: [], items: [], dropEffect: 'none', getData: () => '' },
  })
  return event
}

describe('TimelineMediaDropZone', () => {
  let rafCallbacks: FrameRequestCallback[]

  beforeEach(() => {
    rafCallbacks = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const tracks = createDefaultClassicTracks(64)
    useItemsStore.getState().setTracks(tracks)
    useItemsStore.getState().setItems([])
    useMediaLibraryStore.setState({
      mediaById: { 'media-1': { id: 'media-1', fileName: 'clip.mp4' } as MediaMetadata },
    })
    getMediaDragDataMock.mockReturnValue({
      type: 'media-item',
      mediaId: 'media-1',
      mediaType: 'video',
      fileName: 'clip.mp4',
      duration: 2,
    })
  })

  afterEach(() => {
    cleanup()
    clearAllTimelineDropPreviewOwners()
    useNewTrackZonePreviewStore.getState().clearGhostPreviews()
    vi.restoreAllMocks()
  })

  function renderZone(height = 40) {
    const anchorTrackId = useItemsStore.getState().tracks.find((t) => t.kind === 'video')!.id
    return render(Harness, { props: { height, zone: 'video', anchorTrackId } })
  }

  it('renders nothing when the zone has no height', () => {
    const view = renderZone(0)

    expect(view.container.querySelector('[data-timeline-drop-target]')).toBeNull()
  })

  it('coalesces dragover into one frame and draws the planned ghost in the zone', () => {
    const view = renderZone()
    const zone = view.container.querySelector('[data-timeline-drop-target]') as HTMLElement

    expect(zone.style.height).toBe('var(--timeline-video-zone-height, 40px)')

    const first = dragEvent('dragover', { clientX: 10 })
    zone.dispatchEvent(first)
    zone.dispatchEvent(dragEvent('dragover', { clientX: 20 }))

    expect(first.defaultPrevented).toBe(true)
    expect(rafCallbacks).toHaveLength(1)
    expect(useNewTrackZonePreviewStore.getState().ghostPreviewsByZone.video).toBeUndefined()

    rafCallbacks[0]!(performance.now())

    const previews = useNewTrackZonePreviewStore.getState().ghostPreviewsByZone.video
    expect(previews).toHaveLength(1)
    expect(previews?.[0]).toMatchObject({ label: 'clip.mp4', type: 'video', targetZone: 'video' })
    expect(screen.getByText('clip.mp4').parentElement?.style.height).toBe('100%')
  })

  it('clears the ghost when the drag leaves the zone', () => {
    const view = renderZone()
    const zone = view.container.querySelector('[data-timeline-drop-target]') as HTMLElement
    zone.getBoundingClientRect = () => new DOMRect(0, 0, 100, 40)

    zone.dispatchEvent(dragEvent('dragover', { clientX: 10, clientY: 10 }))
    rafCallbacks[0]!(performance.now())
    expect(screen.getByText('clip.mp4')).toBeInTheDocument()

    zone.dispatchEvent(dragEvent('dragleave', { clientX: 10, clientY: 10 }))
    expect(screen.queryByText('clip.mp4')).toBeInTheDocument()

    zone.dispatchEvent(dragEvent('dragleave', { clientX: 500, clientY: 10 }))
    expect(useNewTrackZonePreviewStore.getState().ghostPreviewsByZone.video).toBeUndefined()
    expect(screen.queryByText('clip.mp4')).toBeNull()
  })
})

// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { VideoItem } from '@/types/timeline'
import { useEditorStore } from '@/shared/state/editor'
import { useItemsStore } from './items-store'
import { useKeyframesStore } from './keyframes-store'
import { useTimelineCommandStore } from './timeline-command-store'
import { useTimelineSettingsStore } from './timeline-settings-store'
import { useTransitionsStore } from './transitions-store'
import { onEditRefused, setEditGuards } from './edit-guards'
import { removeItems, rippleDeleteItems } from './actions/item-actions'
import { splitItem } from './actions/edit/split-actions'

function makeVideoItem(overrides: Partial<VideoItem> = {}): VideoItem {
  return {
    id: 'stream',
    type: 'video',
    trackId: 'video-track',
    from: 0,
    durationInFrames: 300,
    label: 'stream.mp4',
    src: 'blob:stream',
    mediaId: 'stream-media',
    originId: 'origin-stream',
    sourceStart: 0,
    sourceEnd: 300,
    sourceDuration: 300,
    sourceFps: 30,
    ...overrides,
  }
}

const stream = makeVideoItem()
const overlay = makeVideoItem({
  id: 'overlay',
  trackId: 'overlay-track',
  mediaId: 'overlay-media',
  originId: 'origin-overlay',
})

describe('edit guards', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory()
    useTimelineSettingsStore.setState({ fps: 30, isDirty: false })
    useEditorStore.setState({ linkedSelectionEnabled: false })
    useItemsStore.getState().setItems([stream, overlay])
    useItemsStore.getState().setTracks([])
    useTransitionsStore.getState().setTransitions([])
    useKeyframesStore.getState().setKeyframes([])
    // Any piece of the stream's media is protected, as a host keying on media would.
    setEditGuards({ remove: (items) => !items.some((item) => item.mediaId === 'stream-media') })
  })

  afterEach(() => setEditGuards(null))

  it('rolls back an edit that removes a protected item, leaving no undo step', () => {
    const refused = vi.fn()
    const unsubscribe = onEditRefused(refused)

    removeItems(['stream', 'overlay'])
    rippleDeleteItems(['stream'])

    unsubscribe()
    expect(useItemsStore.getState().items.map((item) => item.id)).toEqual(['stream', 'overlay'])
    expect(useTimelineCommandStore.getState().canUndo).toBe(false)
    expect(refused).toHaveBeenCalledTimes(2)
    expect(refused.mock.calls[0]![0]).toMatchObject({
      type: 'REMOVE_ITEMS',
      items: [
        expect.objectContaining({ id: 'stream' }),
        expect.objectContaining({ id: 'overlay' }),
      ],
    })
  })

  it('judges a split clip by its pieces, and allows removing anything else', () => {
    // A split keeps the left half's id and adds the right: nothing is removed.
    splitItem('stream', 150)
    const rightHalf = useItemsStore.getState().items.find((item) => item.from === 150)!
    removeItems([rightHalf.id])
    expect(useItemsStore.getState().items).toHaveLength(3)

    removeItems(['overlay'])
    expect(useItemsStore.getState().items.map((item) => item.mediaId)).toEqual([
      'stream-media',
      'stream-media',
    ])
    expect(useTimelineCommandStore.getState().getLastCommandType()).toBe('REMOVE_ITEMS')
  })
})

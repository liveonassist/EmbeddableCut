// SPDX-License-Identifier: MIT
// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vite-plus/test'
import type { SubtitleSegmentItem, TimelineTrack, VideoItem } from '@/types/timeline'
import { useItemsStore } from '../items-store'
import { useTransitionsStore } from '../transitions-store'
import { useKeyframesStore } from '../keyframes-store'
import { useTimelineCommandStore } from '../timeline-command-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'
import { useEditorStore } from '@/shared/state/editor'
import { useSelectionStore } from '@/shared/state/selection'
import { addItems, removeItems, updateItem } from './item-actions'
import { trimItemStart } from './edit/trim-actions'
import { asOneUndoStep } from './undo-fold'

function track(id: string, order: number): TimelineTrack {
  return {
    id,
    name: id,
    kind: 'video',
    height: 80,
    locked: false,
    syncLock: true,
    visible: true,
    muted: false,
    solo: false,
    volume: 0,
    order,
    items: [],
  }
}

const clip: VideoItem = {
  id: 'clip',
  type: 'video',
  trackId: 'v1',
  from: 0,
  durationInFrames: 300,
  label: 'clip.mp4',
  src: 'blob:clip',
  mediaId: 'media-1',
  sourceStart: 0,
  sourceEnd: 300,
  sourceFps: 30,
}

// Starts a second into the clip, as speech usually does.
const captions: SubtitleSegmentItem = {
  id: 'captions',
  type: 'subtitle',
  trackId: 'captions-track',
  from: 30,
  durationInFrames: 120,
  label: 'Captions',
  mediaId: 'media-1',
  source: { type: 'transcript', mediaId: 'media-1', clipId: 'clip' },
  cues: [
    { id: 'a', startSeconds: 0, endSeconds: 1.5, text: 'Hello there' },
    { id: 'b', startSeconds: 2, endSeconds: 4, text: 'General Kenobi' },
  ],
  color: '#ffffff',
}

describe('transcript captions attached to their clip', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory()
    useTimelineSettingsStore.setState({ fps: 30, isDirty: false })
    useEditorStore.setState({ linkedSelectionEnabled: true })
    useTransitionsStore.getState().setTransitions([])
    useKeyframesStore.getState().setKeyframes([])
    useSelectionStore.getState().clearSelection()
    useItemsStore.getState().setTracks([track('captions-track', 0), track('v1', 1)])
    useItemsStore.getState().setItems([clip, captions])
  })

  it('re-anchors the cues when a start trim cuts into the captions', () => {
    // Trim the clip to start at 2s: the first cue loses its first second.
    trimItemStart('clip', 60)

    const trimmed = useItemsStore.getState().itemById.captions as SubtitleSegmentItem
    expect(trimmed.from).toBe(60)
    expect(trimmed.durationInFrames).toBe(90)
    expect(trimmed.cues).toEqual([
      { id: 'a', startSeconds: 0, endSeconds: 0.5, text: 'Hello there' },
      { id: 'b', startSeconds: 1, endSeconds: 3, text: 'General Kenobi' },
    ])
  })

  it('deletes with the clip', () => {
    removeItems(['clip'])
    expect(useItemsStore.getState().itemById.captions).toBeUndefined()
  })
})

describe('asOneUndoStep', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory()
    useItemsStore.getState().setTracks([track('captions-track', 0), track('v1', 1)])
    useItemsStore.getState().setItems([clip])
  })

  it('undoes every action inside it at once', () => {
    asOneUndoStep('ADD_CAPTIONS', () => {
      addItems([captions])
      updateItem('clip', { label: 'renamed' })
    })

    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(1)
    useTimelineCommandStore.getState().undo()
    expect(useItemsStore.getState().itemById.captions).toBeUndefined()
    expect(useItemsStore.getState().itemById.clip?.label).toBe('clip.mp4')
  })
})

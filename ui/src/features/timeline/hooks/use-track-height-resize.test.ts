// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { useEditorStore } from '@/shared/state/editor'
import { DEFAULT_TRACK_HEIGHT } from '@/features/timeline/constants'
import Harness from './use-track-height-resize.harness.svelte'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTimelineCommandStore } from '@/features/timeline/stores/timeline-command-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import {
  clearAllTrackHeightOverrides,
  setTrackHeightOverride,
} from '@/features/timeline/utils/track-heights'

function createTrack(id: string, kind: 'video' | 'audio', height: number) {
  return {
    id,
    name: id.toUpperCase(),
    kind,
    order: 0,
    height,
    locked: false,
    visible: true,
    muted: false,
    solo: false,
    items: [],
  }
}

function trackHeights(): number[] {
  return useItemsStore.getState().tracks.map((track) => track.height)
}

describe('useTrackHeightResize', () => {
  beforeEach(() => {
    clearAllTrackHeightOverrides()
    useEditorStore.getState().setTrackSizePreset('medium')
    useItemsStore.getState().setItems([])
    // Heights on these tracks are ignored — they are resolved from the preset.
    useItemsStore
      .getState()
      .setTracks([
        createTrack('v1', 'video', 72),
        createTrack('v2', 'video', 96),
        createTrack('a1', 'audio', 120),
      ])
    useTimelineCommandStore.getState().clearHistory()
    useTimelineSettingsStore.getState().markClean()
  })

  it('resolves track heights from the preset, ignoring the stored height', () => {
    expect(trackHeights()).toEqual([
      DEFAULT_TRACK_HEIGHT,
      DEFAULT_TRACK_HEIGHT,
      DEFAULT_TRACK_HEIGHT,
    ])
  })

  it('alt-drag resizes every track header together', async () => {
    render(Harness)

    // Video tracks grow upward, so dragging down by 10px shrinks them by 10px.
    await fireEvent.mouseDown(screen.getByRole('button', { name: 'Resize V1' }), {
      altKey: true,
      clientY: 100,
    })
    await fireEvent.mouseMove(document, { clientY: 110 })
    await fireEvent.mouseUp(document, { clientY: 110 })

    const expectedHeight = DEFAULT_TRACK_HEIGHT - 10
    expect(trackHeights()).toEqual([expectedHeight, expectedHeight, expectedHeight])
  })

  it('resizing is a local view change: no undo entry, project stays clean', async () => {
    render(Harness)

    await fireEvent.mouseDown(screen.getByRole('button', { name: 'Resize V1' }), { clientY: 100 })
    await fireEvent.mouseMove(document, { clientY: 110 })
    await fireEvent.mouseUp(document, { clientY: 110 })

    expect(trackHeights()[0]).toBe(DEFAULT_TRACK_HEIGHT - 10)
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(0)
    expect(useTimelineSettingsStore.getState().isDirty).toBe(false)
  })

  it('alt-double-click drops every override so tracks follow the preset again', async () => {
    setTrackHeightOverride('v1', 60)
    setTrackHeightOverride('v2', 130)
    setTrackHeightOverride('a1', 55)
    useItemsStore.getState().setTracks(useItemsStore.getState().tracks)
    expect(trackHeights()).toEqual([60, 130, 55])

    render(Harness)
    await fireEvent.doubleClick(screen.getByRole('button', { name: 'Reset V1' }), { altKey: true })

    expect(trackHeights()).toEqual([
      DEFAULT_TRACK_HEIGHT,
      DEFAULT_TRACK_HEIGHT,
      DEFAULT_TRACK_HEIGHT,
    ])
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(0)
  })

  it('double-click drops only the clicked track override', async () => {
    setTrackHeightOverride('v1', 60)
    setTrackHeightOverride('v2', 130)
    useItemsStore.getState().setTracks(useItemsStore.getState().tracks)

    render(Harness)
    await fireEvent.doubleClick(screen.getByRole('button', { name: 'Reset V1' }))

    expect(trackHeights()).toEqual([DEFAULT_TRACK_HEIGHT, 130, DEFAULT_TRACK_HEIGHT])
  })
})

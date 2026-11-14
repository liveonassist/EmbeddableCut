// SPDX-License-Identifier: MIT
// oxlint-disable react-hooks/rules-of-hooks -- the hook keeps no component state, so tests call it directly

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { makeTimelineTrack, makeTimelineVideoItem } from '@/features/timeline/test-helpers'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import { useZoomStore } from '@/features/timeline/stores/zoom-store'
import { useSnapCalculator } from './use-snap-calculator.svelte'

const TIMELINE_DURATION = 60

function setupStores() {
  useTimelineSettingsStore.setState({ fps: 30, snapEnabled: true })
  useZoomStore.setState({ level: 0.3, pixelsPerSecond: 30 })
  useItemsStore
    .getState()
    .setTracks([makeTimelineTrack({ id: 'track-v1', name: 'V1', kind: 'video', order: 0 })])
  useItemsStore
    .getState()
    .setItems([
      makeTimelineVideoItem({ id: 'dragged', from: 0, durationInFrames: 10 }),
      makeTimelineVideoItem({ id: 'target', from: 20, durationInFrames: 10 }),
    ])
  useTransitionsStore.getState().setTransitions([])
}

const createSnap = () =>
  useSnapCalculator(
    () => TIMELINE_DURATION,
    () => 'dragged',
  )

describe('useSnapCalculator', () => {
  beforeEach(setupStores)
  afterEach(() => vi.restoreAllMocks())

  it('does not read the timeline or subscribe to stores when created', () => {
    const getItemsState = vi.spyOn(useItemsStore, 'getState')
    const getTransitionsState = vi.spyOn(useTransitionsStore, 'getState')
    const getZoomState = vi.spyOn(useZoomStore, 'getState')
    const subscribeToItems = vi.spyOn(useItemsStore, 'subscribe')
    const subscribeToSettings = vi.spyOn(useTimelineSettingsStore, 'subscribe')

    const snap = createSnap()

    expect(getItemsState).not.toHaveBeenCalled()
    expect(getTransitionsState).not.toHaveBeenCalled()
    expect(getZoomState).not.toHaveBeenCalled()
    expect(subscribeToItems).not.toHaveBeenCalled()
    expect(subscribeToSettings).not.toHaveBeenCalled()

    useTimelineSettingsStore.getState().setSnapEnabled(false)
    expect(snap.isSnapEnabled()).toBe(false)

    const targets = snap.getMagneticSnapTargets()
    expect(getItemsState).toHaveBeenCalledTimes(1)
    expect(getTransitionsState).toHaveBeenCalledTimes(1)
    expect(getZoomState).not.toHaveBeenCalled()
    expect(targets).toHaveLength(2)
  })

  it('uses the default exclusion but can include originals for Alt-drag', () => {
    const snap = createSnap()

    expect(snap.getMagneticSnapTargets()).toEqual([
      { frame: 20, type: 'item-start', itemId: 'target' },
      { frame: 30, type: 'item-end', itemId: 'target' },
    ])

    expect(snap.getMagneticSnapTargets(null)).toEqual([
      { frame: 0, type: 'item-start', itemId: 'dragged' },
      { frame: 10, type: 'item-end', itemId: 'dragged' },
      { frame: 20, type: 'item-start', itemId: 'target' },
      { frame: 30, type: 'item-end', itemId: 'target' },
    ])
  })

  it('accepts the active gesture cohort as an exclusion override', () => {
    expect(createSnap().getMagneticSnapTargets(['dragged', 'target'])).toEqual([])
  })
})

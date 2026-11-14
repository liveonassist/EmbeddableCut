// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { HOTKEYS } from '@/config/hotkeys'
import { usePlaybackStore } from '@/shared/state/playback'
import { useMarkersStore } from '@/features/timeline/stores/markers-store'
import { setTimelineState } from '@/features/timeline/test-helpers'
import { renderHook } from '../../test/render-hook.svelte'
import { useInOutShortcuts } from './use-in-out-shortcuts.svelte'
import type { TimelineTrack, VideoItem } from '@/types/timeline'

const { useHotkeysMock } = vi.hoisted(() => ({
  useHotkeysMock: vi.fn(),
}))

vi.mock('$lib/hotkeys.svelte', () => ({
  useHotkeys: useHotkeysMock,
}))

type HotkeyEvent = {
  preventDefault: () => void
}

type HotkeyCallback = (event: HotkeyEvent) => void

const TRACK: TimelineTrack = {
  id: 'track-1',
  name: 'V1',
  kind: 'video',
  order: 0,
  height: 80,
  locked: false,
  visible: true,
  muted: false,
  solo: false,
  items: [],
}

const ITEM: VideoItem = {
  id: 'clip-1',
  type: 'video',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 240,
  label: 'Clip 1',
  src: 'clip.mp4',
}

const cleanups: Array<() => void> = []

function renderShortcuts() {
  cleanups.push(renderHook(() => useInOutShortcuts()).unmount)
}

function getHotkeyRegistration(binding: string) {
  const registration = useHotkeysMock.mock.calls.find(([keys]) => keys() === binding)
  expect(registration).toBeDefined()
  return registration as [() => string, HotkeyCallback]
}

function createHotkeyEvent(): HotkeyEvent {
  return {
    preventDefault: vi.fn(),
  }
}

describe('useInOutShortcuts', () => {
  afterEach(() => {
    for (const unmount of cleanups.splice(0)) unmount()
  })

  beforeEach(() => {
    useHotkeysMock.mockClear()
    setTimelineState({
      tracks: [TRACK],
      items: [ITEM],
      markers: [],
      inPoint: null,
      outPoint: null,
      fps: 24,
    })
    usePlaybackStore.setState({
      currentFrame: 48,
      previewFrame: null,
      previewItemId: null,
    })
  })

  it('marks in and out at the main playhead', () => {
    renderShortcuts()

    getHotkeyRegistration(HOTKEYS.MARK_IN)[1](createHotkeyEvent())
    expect(useMarkersStore.getState().inPoint).toBe(48)

    usePlaybackStore.setState({ currentFrame: 96 })
    getHotkeyRegistration(HOTKEYS.MARK_OUT)[1](createHotkeyEvent())
    expect(useMarkersStore.getState().outPoint).toBe(96)
  })

  it('marks in and out at the preview playhead with Shift variants', () => {
    renderShortcuts()
    usePlaybackStore.setState({ currentFrame: 48, previewFrame: 120 })

    getHotkeyRegistration('shift+i')[1](createHotkeyEvent())
    expect(useMarkersStore.getState().inPoint).toBe(120)

    usePlaybackStore.setState({ previewFrame: 180 })
    getHotkeyRegistration('shift+o')[1](createHotkeyEvent())
    expect(useMarkersStore.getState().outPoint).toBe(180)
  })

  it('clears in/out points with the configured clear shortcut', () => {
    renderShortcuts()
    setTimelineState({ inPoint: 24, outPoint: 120 })

    getHotkeyRegistration(HOTKEYS.CLEAR_IN_OUT)[1](createHotkeyEvent())

    expect(useMarkersStore.getState().inPoint).toBeNull()
    expect(useMarkersStore.getState().outPoint).toBeNull()
  })
})

// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import AudioMixerView from './audio-mixer-view.svelte'
import type { AudioMixerLevel, AudioMixerViewProps } from './audio-mixer-view/types'

vi.mock('@/config/editor-layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/editor-layout')>()
  return {
    ...actual,
    EDITOR_LAYOUT_CSS_VALUES: {
      ...actual.EDITOR_LAYOUT_CSS_VALUES,
      timelineMixerWidth: 280,
      timelineTracksHeaderHeight: 44,
    },
  }
})

const ZERO_ESTIMATE: AudioMixerLevel = {
  left: 0,
  right: 0,
  unresolvedSourceCount: 0,
  resolvedSourceCount: 0,
}

function baseProps(overrides: Partial<AudioMixerViewProps> = {}): AudioMixerViewProps {
  return {
    tracks: [
      {
        id: 'track-1',
        name: 'A1',
        kind: 'audio',
        muted: false,
        solo: false,
        volume: 0,
        itemIds: ['item-1'],
      },
    ],
    perTrackLevels: new Map(),
    masterEstimate: ZERO_ESTIMATE,
    isPlaying: true,
    onTrackVolumeChange: () => undefined,
    onTrackMuteToggle: () => undefined,
    onTrackSoloToggle: () => undefined,
    masterVolumeDb: 0,
    masterMuted: false,
    onMasterVolumeChange: () => undefined,
    onMasterMuteToggle: () => undefined,
    ...overrides,
  }
}

function levels(left: number, right: number): Map<string, AudioMixerLevel> {
  return new Map([['track-1', { left, right, unresolvedSourceCount: 0, resolvedSourceCount: 1 }]])
}

function getTrackFader(container: HTMLElement, trackId = 'track-1'): HTMLDivElement {
  const faderRoot = container.querySelector(
    `[data-track-id="${trackId}"][data-fader-root="true"]`,
  ) as HTMLDivElement | null
  expect(faderRoot).not.toBeNull()
  return faderRoot!
}

function stubFaderGeometry(faderRoot: HTMLDivElement): void {
  Object.defineProperty(faderRoot, 'getBoundingClientRect', {
    value: () => ({
      x: 0,
      y: 20,
      top: 20,
      bottom: 220,
      left: 0,
      right: 20,
      width: 20,
      height: 200,
      toJSON: () => ({}),
    }),
  })
  Object.defineProperty(faderRoot, 'setPointerCapture', { value: vi.fn(), configurable: true })
  Object.defineProperty(faderRoot, 'releasePointerCapture', {
    value: vi.fn(),
    configurable: true,
  })
}

function getReadyTrackFader(container: HTMLElement, trackId = 'track-1'): HTMLDivElement {
  const faderRoot = getTrackFader(container, trackId)
  stubFaderGeometry(faderRoot)
  return faderRoot
}

async function beginFaderDrag(faderRoot: HTMLDivElement, clientY = 53.5): Promise<void> {
  await fireEvent.pointerDown(faderRoot, { pointerId: 1, clientY })
}

async function renderDraggedTrackFader(handleTrackVolumeChange = vi.fn()) {
  const view = render(AudioMixerView, baseProps({ onTrackVolumeChange: handleTrackVolumeChange }))
  const faderRoot = getReadyTrackFader(view.container)

  await beginFaderDrag(faderRoot)
  await fireEvent.pointerMove(faderRoot, { pointerId: 1, clientY: 43.5 })

  return { ...view, faderRoot, handleTrackVolumeChange }
}

const channel = (container: HTMLElement, side: 'left' | 'right') =>
  container.querySelector(
    `[data-track-id="track-1"][data-track-channel="${side}"]`,
  ) as HTMLDivElement | null

describe('AudioMixerView', () => {
  it('shows scanning fallback bars while waveform data is unresolved', () => {
    const scanning = { left: 0, right: 0, unresolvedSourceCount: 1, resolvedSourceCount: 0 }
    const { container } = render(
      AudioMixerView,
      baseProps({
        tracks: [
          {
            id: 'track-1',
            name: 'A1',
            kind: 'audio',
            muted: false,
            solo: false,
            volume: 0,
            itemIds: [],
          },
        ],
        perTrackLevels: new Map([['track-1', scanning]]),
        masterEstimate: scanning,
      }),
    )

    const trackLeft = channel(container, 'left')
    const busLeft = container.querySelector('[data-bus-channel="left"]')

    expect(trackLeft).not.toBeNull()
    expect(trackLeft).toHaveStyle({ height: '18%' })
    expect(busLeft).not.toBeNull()
    expect(busLeft).toHaveStyle({ height: '18%' })
  })

  it('does not jump the volume to silence when dragging from the thumb', async () => {
    const { faderRoot, handleTrackVolumeChange } = await renderDraggedTrackFader()
    expect(handleTrackVolumeChange).not.toHaveBeenCalled()

    // Release: synchronous in-place mutation commit (no composition re-render)
    await fireEvent.pointerUp(faderRoot, { pointerId: 1, clientY: 43.5 })
    expect(handleTrackVolumeChange).toHaveBeenCalledTimes(1)
    expect(handleTrackVolumeChange.mock.calls[0]?.[1]).toBeGreaterThan(-10)
  })

  it('keeps empty channel meters flat while dragging the fader', async () => {
    const props = baseProps({
      tracks: [
        {
          id: 'track-1',
          name: 'A2',
          kind: 'audio',
          muted: false,
          solo: false,
          volume: 0,
          itemIds: [],
        },
      ],
    })
    const { container, rerender } = render(AudioMixerView, props)

    const faderRoot = getReadyTrackFader(container)
    expect(channel(container, 'left')).toHaveStyle({ height: '0%' })

    await beginFaderDrag(faderRoot)
    await fireEvent.pointerMove(faderRoot, { pointerId: 1, clientY: 20 })

    await rerender({ ...props, perTrackLevels: new Map() })

    expect(channel(container, 'left')).toHaveStyle({ height: '0%' })
    expect(channel(container, 'right')).toHaveStyle({ height: '0%' })
  })

  it('keeps zero-level meter entries flat while dragging during playback', async () => {
    const zero = new Map([['track-1', ZERO_ESTIMATE]])
    const props = baseProps({ perTrackLevels: zero })
    const { container, rerender } = render(AudioMixerView, props)

    const faderRoot = getReadyTrackFader(container)

    await beginFaderDrag(faderRoot)
    await fireEvent.pointerMove(faderRoot, { pointerId: 1, clientY: 20 })

    await rerender({ ...props, perTrackLevels: new Map(zero) })

    expect(channel(container, 'left')).toHaveStyle({ height: '0%' })
    expect(channel(container, 'right')).toHaveStyle({ height: '0%' })
  })

  it('updates channel meters when estimation pipeline delivers new levels', async () => {
    const props = baseProps({ perTrackLevels: levels(0.1, 0.08) })
    const { container, rerender } = render(AudioMixerView, props)

    const leftBar = channel(container, 'left')
    expect(leftBar).not.toBeNull()
    const initialHeight = parseFloat(leftBar!.style.height)

    // Simulate the estimation pipeline delivering boosted levels (e.g. after
    // a fader drag triggers setLiveTrackVolumeOverride → pipeline recalc).
    await rerender({ ...props, perTrackLevels: levels(0.5, 0.4) })

    expect(parseFloat(leftBar!.style.height)).toBeGreaterThan(initialHeight)
  })

  it('does not double-count meter levels when pipeline updates mid-drag', async () => {
    // Regression: the old offset-based preview added a dB offset on top of
    // base levels that already included the live fader override from the
    // estimation pipeline, causing meters to overshoot.
    const props = baseProps({ perTrackLevels: levels(0.1, 0.1) })
    const { container, rerender } = render(AudioMixerView, props)

    const faderRoot = getReadyTrackFader(container)
    const leftBar = channel(container, 'left')
    expect(leftBar).not.toBeNull()

    // Start a drag to enter the mid-drag path
    await beginFaderDrag(faderRoot)
    await fireEvent.pointerMove(faderRoot, { pointerId: 1, clientY: 40 })

    // Simulate the estimation pipeline delivering boosted levels mid-drag
    // (as getTrackGainCorrection would bake the fader override into the level).
    const boostedLevel = 0.1 * Math.pow(10, 6 / 20) // ~0.2
    await rerender({ ...props, perTrackLevels: levels(boostedLevel, boostedLevel) })

    const heightAfterPipeline = parseFloat(leftBar!.style.height)

    // Re-render again with the same levels — height must not change.
    await rerender({ ...props, perTrackLevels: levels(boostedLevel, boostedLevel) })

    expect(parseFloat(leftBar!.style.height)).toBeCloseTo(heightAfterPipeline, 5)

    // End drag
    await fireEvent.pointerUp(faderRoot, { pointerId: 1, clientY: 40 })
  })

  it('keeps dragging active while meter props rerender during the gesture', async () => {
    const handleTrackVolumeChange = vi.fn()
    const props = baseProps({
      perTrackLevels: levels(0.1, 0.08),
      onTrackVolumeChange: handleTrackVolumeChange,
    })
    const { container, rerender } = render(AudioMixerView, props)
    const faderRoot = getReadyTrackFader(container)

    await beginFaderDrag(faderRoot)
    await rerender({ ...props, perTrackLevels: levels(0.12, 0.1) })
    await fireEvent.pointerMove(faderRoot, { pointerId: 1, clientY: 20 })

    expect(handleTrackVolumeChange).not.toHaveBeenCalled()

    await fireEvent.pointerUp(faderRoot, { pointerId: 1, clientY: 20 })
    expect(handleTrackVolumeChange).toHaveBeenCalledTimes(1)
  })

  it('commits the dragged value when the pointer is cancelled', async () => {
    const { faderRoot, handleTrackVolumeChange } = await renderDraggedTrackFader()
    await fireEvent.pointerCancel(faderRoot, { pointerId: 1, clientY: 43.5 })

    expect(handleTrackVolumeChange).toHaveBeenCalledTimes(1)
    expect(handleTrackVolumeChange.mock.calls[0]?.[1]).toBeGreaterThan(-10)
  })

  it('commits the dragged value when the mixer unmounts mid-drag', async () => {
    const { unmount, handleTrackVolumeChange } = await renderDraggedTrackFader()
    unmount()

    expect(handleTrackVolumeChange).toHaveBeenCalledTimes(1)
    expect(handleTrackVolumeChange.mock.calls[0]?.[1]).toBeGreaterThan(-10)
  })

  it('routes EQ button clicks for tracks and bus strips', async () => {
    const handleTrackEqToggle = vi.fn()
    const handleBusEqToggle = vi.fn()

    const { container } = render(
      AudioMixerView,
      baseProps({
        isPlaying: false,
        onTrackEqToggle: handleTrackEqToggle,
        onBusEqToggle: handleBusEqToggle,
        activeEqTrackId: null,
        busEqActive: false,
      }),
    )

    const trackEqButton = container.querySelector(
      '[aria-label="EQ A1"]',
    ) as HTMLButtonElement | null
    const busEqButton = container.querySelector(
      '[aria-label="EQ Bus 1"]',
    ) as HTMLButtonElement | null

    expect(trackEqButton).not.toBeNull()
    expect(busEqButton).not.toBeNull()

    await fireEvent.click(trackEqButton!)
    await fireEvent.click(busEqButton!)

    expect(handleTrackEqToggle).toHaveBeenCalledWith('track-1')
    expect(handleBusEqToggle).toHaveBeenCalledTimes(1)
  })

  it('lights EQ buttons from enabled state instead of floating-panel selection state', async () => {
    const track = {
      id: 'track-1',
      name: 'A1',
      kind: 'audio' as const,
      muted: false,
      solo: false,
      volume: 0,
      itemIds: ['item-1'],
    }
    const props = baseProps({
      tracks: [{ ...track, eqEnabled: false }],
      isPlaying: false,
      onTrackEqToggle: () => undefined,
      onBusEqToggle: () => undefined,
      activeEqTrackId: 'track-1',
      busEqActive: true,
      busEqEnabled: false,
    })
    const { container, rerender } = render(AudioMixerView, props)

    const trackEqButton = container.querySelector(
      '[aria-label="EQ A1"]',
    ) as HTMLButtonElement | null
    const busEqButton = container.querySelector(
      '[aria-label="EQ Bus 1"]',
    ) as HTMLButtonElement | null

    expect(trackEqButton).not.toBeNull()
    expect(busEqButton).not.toBeNull()
    expect(trackEqButton).toHaveAttribute('aria-pressed', 'false')
    expect(busEqButton).toHaveAttribute('aria-pressed', 'false')

    await rerender({
      ...props,
      tracks: [{ ...track, eqEnabled: true }],
      activeEqTrackId: null,
      busEqActive: false,
      busEqEnabled: true,
    })

    expect(trackEqButton).toHaveAttribute('aria-pressed', 'true')
    expect(busEqButton).toHaveAttribute('aria-pressed', 'true')
  })
})

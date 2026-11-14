// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { TimelineTrack } from '@/types/timeline'

import { useItemsStore } from '@/features/timeline/stores/items-store'
import TrackHeader from './track-header.svelte'

vi.mock('../hooks/use-track-drag.svelte', () => ({
  useTrackDrag: () => ({
    handleDragStart: () => undefined,
  }),
}))

function makeTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-1',
    name: 'V1',
    kind: 'video',
    height: 72,
    locked: false,
    visible: true,
    muted: false,
    solo: false,
    volume: 0,
    order: 0,
    items: [],
    ...overrides,
  }
}

function headerProps(track: TimelineTrack, onToggleDisabled = vi.fn()) {
  return {
    track,
    isActive: false,
    isSelected: false,
    canDeleteTrack: true,
    canDeleteEmptyTracks: true,
    onToggleLock: () => undefined,
    onToggleSyncLock: () => undefined,
    onToggleDisabled,
    onToggleSolo: () => undefined,
    onSelect: () => undefined,
    onCloseGaps: () => undefined,
    onAddVideoTrack: () => undefined,
    onAddAudioTrack: () => undefined,
    onDeleteTrack: () => undefined,
    onDeleteEmptyTracks: () => undefined,
  }
}

function renderTrackHeader(track: TimelineTrack, onToggleDisabled = vi.fn()) {
  const renderResult = render(TrackHeader, headerProps(track, onToggleDisabled))

  return { ...renderResult, onToggleDisabled }
}

describe('TrackHeader', () => {
  beforeEach(() => {
    useItemsStore.getState().setItems([])
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a unified disable control for video tracks', async () => {
    const { onToggleDisabled } = renderTrackHeader(
      makeTrack({ kind: 'video', visible: true, muted: false }),
    )

    expect(screen.getByRole('button', { name: 'Disable track' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide track' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mute track' })).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Disable track' }))

    expect(onToggleDisabled).toHaveBeenCalledTimes(1)
  })

  it('derives the disable state from audio mute status', () => {
    const { container } = renderTrackHeader(
      makeTrack({ id: 'track-2', name: 'A1', kind: 'audio', muted: true }),
    )

    expect(screen.getByRole('button', { name: 'Enable track' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show track' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unmute track' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-track-id="track-2"]')).toHaveAttribute(
      'data-track-disabled',
      'true',
    )
  })

  it('calls onToggleDisabled when clicking Enable track on a muted audio track', async () => {
    const onToggleDisabled = vi.fn()
    renderTrackHeader(
      makeTrack({ id: 'track-3', name: 'A2', kind: 'audio', muted: true }),
      onToggleDisabled,
    )

    await fireEvent.click(screen.getByRole('button', { name: 'Enable track' }))

    expect(onToggleDisabled).toHaveBeenCalledTimes(1)
  })

  it('renders sync lock enabled by default and toggles the label when disabled', async () => {
    const { rerender } = render(TrackHeader, headerProps(makeTrack()))

    expect(screen.getByRole('button', { name: 'Disable sync lock' })).toBeInTheDocument()

    await rerender({ track: makeTrack({ syncLock: false }) })

    expect(screen.getByRole('button', { name: 'Enable sync lock' })).toBeInTheDocument()
  })
})

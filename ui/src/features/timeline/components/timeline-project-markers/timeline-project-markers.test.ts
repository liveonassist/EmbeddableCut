// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useMarkersStore } from '@/features/timeline/stores/markers-store'
import { useTimelineCommandStore } from '@/features/timeline/stores/timeline-command-store'
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
import { useZoomStore } from '@/features/timeline/stores/zoom-store'
import TimelineProjectMarkers from './timeline-project-markers.svelte'

vi.mock('../../contexts/timeline-zoom-context.svelte', () => ({
  useTimelineCommittedZoomContext: () => ({ frameToPixels: (frame: number) => frame }),
}))

describe('TimelineProjectMarkers', () => {
  beforeEach(() => {
    useTimelineSettingsStore.setState({ fps: 30 })
    useZoomStore.setState({ pixelsPerSecond: 30 })
    useMarkersStore.setState({ markers: [{ id: 'm1', frame: 10, color: '#fff' }] })
    useTimelineCommandStore.getState().clearHistory()
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  it('moves a dragged marker as it goes, in one undo step', () => {
    const ruler = document.body.appendChild(document.createElement('div'))
    ruler.className = 'timeline-ruler'
    const { container } = render(TimelineProjectMarkers, { target: ruler })

    fireEvent.mouseDown(container.querySelector('[data-tooltip]')!)
    for (const clientX of [20, 30, 40]) fireEvent.mouseMove(document, { clientX })
    expect(useMarkersStore.getState().markers[0]?.frame).toBe(40)
    fireEvent.mouseUp(document)

    expect(useMarkersStore.getState().markers[0]?.frame).toBe(40)
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(1)
    useTimelineCommandStore.getState().undo()
    expect(useMarkersStore.getState().markers[0]?.frame).toBe(10)
  })
})

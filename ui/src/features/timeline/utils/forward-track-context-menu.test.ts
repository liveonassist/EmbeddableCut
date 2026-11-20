// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it } from 'vite-plus/test'
import { forwardContextMenuToNearestTrack } from './forward-track-context-menu'

/** A track row in its frame, with a lazily mounted menu trigger beside it, as the timeline renders them. */
function frame(trackId: string, top: number, bottom: number) {
  const element = document.createElement('div')
  const row = document.createElement('div')
  row.dataset.trackId = trackId
  row.getBoundingClientRect = () => ({ top, bottom }) as DOMRect
  const menuTrigger = document.createElement('span')
  element.append(row, menuTrigger)
  return { element, row, menuTrigger }
}

function setUp() {
  const section = document.createElement('div')
  const zoneAbove = document.createElement('div')
  const zoneBelow = document.createElement('div')
  const frames = [frame('v2', 100, 160), frame('v1', 160, 220)]
  section.append(zoneAbove, ...frames.map((f) => f.element), zoneBelow)
  section.addEventListener('contextmenu', (event) =>
    forwardContextMenuToNearestTrack(
      event as unknown as Parameters<typeof forwardContextMenuToNearestTrack>[0],
    ),
  )
  document.body.append(section)

  const received: Array<{ trackId: string; clientX: number }> = []
  for (const { row } of frames) {
    row.addEventListener('contextmenu', (event) => {
      received.push({ trackId: row.dataset.trackId!, clientX: event.clientX })
      event.preventDefault()
    })
  }
  return { zoneAbove, zoneBelow, frames, received }
}

function rightClick(target: Element, clientY: number) {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 340,
    clientY,
  })
  target.dispatchEvent(event)
  return event
}

describe('forwardContextMenuToNearestTrack', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('opens the nearest track’s menu from the empty space above or below the tracks', () => {
    const { zoneAbove, zoneBelow, received } = setUp()

    expect(rightClick(zoneAbove, 40).defaultPrevented).toBe(true)
    expect(rightClick(zoneBelow, 400).defaultPrevented).toBe(true)
    expect(received).toEqual([
      { trackId: 'v2', clientX: 340 },
      { trackId: 'v1', clientX: 340 },
    ])
  })

  it('leaves right-clicks inside a row’s frame to the row', () => {
    const { frames, received } = setUp()

    rightClick(frames[1]!.row, 180)
    // A menu beside the track replays the right-click on its trigger to open;
    // forwarding that back to the track would remount the menu forever.
    const replay = rightClick(frames[1]!.menuTrigger, 180)

    expect(received).toEqual([{ trackId: 'v1', clientX: 340 }])
    expect(replay.defaultPrevented).toBe(false)
  })
})

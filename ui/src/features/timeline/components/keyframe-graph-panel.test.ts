// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test'
import type { VideoItem } from '@/types/timeline'
import { useSelectionStore } from '@/shared/state/selection'
import { setTimelineState } from '@/features/timeline/test-helpers'
import KeyframeGraphPanel from './keyframe-graph-panel.svelte'

vi.mock('$lib/i18n.svelte', () => ({ t: (key: string) => key }))

// DopesheetEditor itself belongs to the keyframes port; the stub renders the
// surfaces for the mode the panel asks for.
vi.mock('@/features/timeline/deps/keyframe-editors-ui', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/timeline/deps/keyframe-editors-ui')>()
  const stub = await import('./keyframe-graph-panel-dopesheet-stub.harness.svelte')
  return { ...actual, DopesheetEditor: stub.default }
})

const MODE_STORAGE_KEY = 'timeline:keyframeEditorMode'

const VIDEO_ITEM: VideoItem = {
  id: 'clip-video-1',
  type: 'video',
  trackId: 'track-v1',
  from: 0,
  durationInFrames: 90,
  label: 'clip.mp4',
  src: 'blob:video',
  mediaId: 'media-1',
}

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  })
})

afterAll(() => {
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
  }
})

function renderPanel({ isOpen = true, splitView = false } = {}) {
  return render(KeyframeGraphPanel, { isOpen, onClose: () => {}, splitView })
}

describe('KeyframeGraphPanel surfaces', () => {
  beforeEach(() => {
    localStorage.removeItem(MODE_STORAGE_KEY)
    setTimelineState({ items: [VIDEO_ITEM], fps: 30 })
    useSelectionStore.getState().selectItems([VIDEO_ITEM.id])
  })

  afterEach(() => {
    cleanup()
  })

  it('renders no docked editor while closed', () => {
    const view = renderPanel({ isOpen: false })

    expect(view.container.children).toHaveLength(0)
  })

  it('renders the sheet surface for the selected clip in dopesheet mode', () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'dopesheet')
    renderPanel()

    expect(screen.getByTestId('dopesheet-editor-root')).toBeInTheDocument()
    expect(screen.getByTestId('dopesheet-playhead-clip')).toBeInTheDocument()
    expect(screen.queryByTestId('dopesheet-graph-pane')).not.toBeInTheDocument()
  })

  it('swaps the sheet for the value graph when the graph tab is picked', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'dopesheet')
    renderPanel()

    await fireEvent.click(
      screen.getByRole('tab', { name: 'timeline.keyframeEditor.legend.graphMode' }),
    )

    expect(screen.getByTestId('dopesheet-graph-pane')).toBeInTheDocument()
    expect(screen.queryByTestId('dopesheet-playhead-clip')).not.toBeInTheDocument()
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('graph')
  })

  it('stacks the sheet and the graph in split mode', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'dopesheet')
    renderPanel({ splitView: true })

    await fireEvent.click(screen.getByRole('tab', { name: 'timeline.keyframeEditor.split' }))

    expect(screen.getByTestId('dopesheet-playhead-clip')).toBeInTheDocument()
    expect(screen.getByTestId('dopesheet-graph-pane')).toBeInTheDocument()
    expect(screen.getByTestId('dopesheet-editor-root')).toHaveAttribute(
      'data-visualization-mode',
      'split',
    )
  })
})

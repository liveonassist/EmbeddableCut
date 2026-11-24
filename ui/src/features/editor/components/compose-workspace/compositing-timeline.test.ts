// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte'
import { toast } from 'svelte-sonner'
import type { MediaMetadata } from '@/types/storage'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import { useClipboardStore } from '@/shared/state/clipboard'
import { useEditorStore } from '@/shared/state/editor'
import {
  makeTimelineTrack,
  resetTimelineCompositionTestState,
  setDefaultRootTimelineTracks,
} from '@/features/editor/deps/timeline-test-helpers-contract'
import {
  KEYFRAME_DIAMOND_RENDERED_WIDTH_PX,
  KEYFRAME_EDGE_INSET,
  openComposition,
  trimItemEnd,
  useCompositionNavigationStore,
  useCompositionsStore,
  useItemsStore,
  useKeyframesStore,
  useKeyframeSelectionStore,
  useTimelineCommandStore,
} from '@/features/editor/deps/timeline-motion'
import { setInPoint, setOutPoint, useMarkersStore } from '@/features/editor/deps/timeline-store'
import { useMediaLibraryStore } from '@/features/editor/deps/media-library-contract'
import { useGizmoStore } from '@/features/editor/deps/preview'
import type {
  AudioItem,
  ControllerItem,
  ShapeItem,
  TimelineItem,
  VideoItem,
} from '@/types/timeline'
import { useComposeUiStore } from './compose-ui-store'
import { CompositingTimeline } from './compositing-timeline'

/*
 * Ported from FreeCut's compositing-timeline.test.tsx, with the embedded
 * dope-sheet and compact navigator from the keyframes feature rendering for real.
 */

vi.mock('@/features/editor/deps/media-library-contract', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/editor/deps/media-library-contract')>()
  return { ...actual, resolveMediaUrl: vi.fn().mockResolvedValue('blob:motion-media') }
})

function rect(width: number, height: number, top = 0): DOMRect {
  return {
    x: 0,
    y: top,
    left: 0,
    top,
    right: width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function makeDataTransfer(payload: unknown) {
  return {
    getData: (type: string) => (type === 'application/json' ? JSON.stringify(payload) : ''),
    types: ['application/json'],
    dropEffect: 'copy',
  }
}

function mockAnimationFrames() {
  const callbacks: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  return {
    callbacks,
    run: (timestamp = performance.now()) => {
      callbacks.shift()?.(timestamp)
      flushSync()
    },
    /** Runs every queued frame, including ones the callbacks queue. */
    runAll: (timestamp = performance.now()) => {
      for (let guard = 0; callbacks.length > 0 && guard < 50; guard += 1) {
        for (const callback of callbacks.splice(0)) callback(timestamp)
        flushSync()
      }
    },
  }
}

/** The viewport controller settles a wheel gesture on a 100ms timeout. */
function mockSettleTimers() {
  const callbacks: Array<() => void> = []
  const spy = vi.spyOn(window, 'setTimeout').mockImplementation(((
    callback: unknown,
    delay?: number,
  ) => {
    if (delay === 100 && typeof callback === 'function') callbacks.push(callback as () => void)
    return callbacks.length as unknown as ReturnType<typeof window.setTimeout>
  }) as typeof window.setTimeout)
  return {
    callbacks,
    run: () => {
      callbacks.shift()?.()
      flushSync()
    },
    /** A newer gesture re-arms the settle: only the latest timer matters. */
    runLast: () => {
      callbacks.splice(0).at(-1)?.()
      flushSync()
    },
    restore: () => spy.mockRestore(),
  }
}

const track = makeTimelineTrack({ id: 'layer-track', name: 'Rectangle', kind: 'video', order: 0 })
const shape: ShapeItem = {
  id: 'shape-1',
  type: 'shape',
  trackId: track.id,
  from: 0,
  durationInFrames: 120,
  label: 'Hero rectangle',
  shapeType: 'rectangle',
  fillColor: '#22d3ee',
  strokeWidth: 0,
  transform: { x: 100, y: 80, width: 400, height: 220, rotation: 0, opacity: 1 },
}

function secondLayer(order = 1, label = 'Circle'): { track: typeof track; shape: ShapeItem } {
  const layerTrack = makeTimelineTrack({
    id: `layer-track-${order + 1}`,
    name: label,
    kind: 'video',
    order,
  })
  return {
    track: layerTrack,
    shape: { ...shape, id: `shape-${order + 1}`, trackId: layerTrack.id, label },
  }
}

function nullObjectLayer(id = 'null-1', label = 'Null Object') {
  const nullTrack = makeTimelineTrack({ id: `${id}-track`, name: label, kind: 'video', order: 1 })
  const item: ControllerItem = {
    id,
    type: 'controller',
    controllerKind: 'null',
    trackId: nullTrack.id,
    from: 0,
    durationInFrames: 120,
    label,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
  }
  return { track: nullTrack, item }
}

async function openContextMenu(target: HTMLElement) {
  await fireEvent.contextMenu(target, { clientX: 10, clientY: 10 })
}

async function chooseOption(trigger: HTMLElement, name: string | RegExp) {
  await fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
  await fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
  await fireEvent.click(trigger)
  const option = await screen.findByRole('option', { name })
  await fireEvent.pointerUp(option, { button: 0, pointerType: 'mouse' })
  await fireEvent.click(option)
}

async function addItem(name: string) {
  await fireEvent.pointerDown(screen.getByRole('button', { name: 'Add Item' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  await fireEvent.click(await screen.findByRole('menuitem', { name }))
}

async function openTransformOptions() {
  await fireEvent.pointerDown(screen.getByRole('button', { name: 'Transform options' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}

function scaleKeyframeValue() {
  return useKeyframesStore
    .getState()
    .keyframesByItemId[shape.id]?.vectorProperties?.find((lane) => lane.property === 'scale')
    ?.keyframes[0]?.value
}

describe('CompositingTimeline', { timeout: 45_000 }, () => {
  beforeEach(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {}
    }
    // jsdom has no pointer capture; bits-ui's Select trigger calls it on pointerdown.
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false
      Element.prototype.releasePointerCapture = () => {}
      Element.prototype.setPointerCapture = () => {}
    }
    resetTimelineCompositionTestState()
    useCompositionNavigationStore.getState().resetToRoot()
    setDefaultRootTimelineTracks()
    useItemsStore.getState().setItems([])
    useCompositionsStore.getState().addComposition({
      id: 'comp-1',
      name: 'Motion title',
      editorKind: 'composite-2d',
      tracks: [track],
      items: [shape],
      transitions: [],
      keyframes: [],
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 120,
    })
    useCompositionNavigationStore.getState().switchToSequence('comp-1')
    useMediaLibraryStore.setState({ mediaItems: [], mediaById: {} })
    useComposeUiStore.setState({
      expandedLayerIdsByComposition: {},
      lastOpenedCompositionId: null,
      motionReturnTabCaptured: false,
      motionReturnTabId: null,
    })
    useEditorStore.getState().setWorkspace('motion')
    useClipboardStore.setState({ itemsClipboard: null, transitionClipboard: null })
    useKeyframeSelectionStore.getState().clearSelection()
    useGizmoStore.getState().cancelInteraction()
    useGizmoStore.getState().clearPreview()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useGizmoStore.getState().cancelInteraction()
    useGizmoStore.getState().clearPreview()
    resetTimelineCompositionTestState()
  })

  it('shows a linked audiovisual pair as one Motion layer', () => {
    const videoTrack = makeTimelineTrack({
      id: 'motion-video-track',
      name: 'Interview',
      kind: 'video',
      order: 0,
    })
    const audioTrack = makeTimelineTrack({
      id: 'motion-audio-track',
      name: 'Interview audio',
      kind: 'audio',
      order: 1,
    })
    const video: VideoItem = {
      id: 'motion-video',
      type: 'video',
      trackId: videoTrack.id,
      from: 0,
      durationInFrames: 120,
      label: 'Interview.mp4',
      src: 'blob:interview-video',
      mediaId: 'interview-media',
      linkedGroupId: 'motion-av-1',
    }
    const audio: AudioItem = {
      id: 'motion-audio',
      type: 'audio',
      trackId: audioTrack.id,
      from: 0,
      durationInFrames: 120,
      label: 'Interview.mp4',
      src: 'blob:interview-audio',
      mediaId: 'interview-media',
      linkedGroupId: 'motion-av-1',
    }
    useItemsStore.getState().setTracks([videoTrack, audioTrack])
    useItemsStore.getState().setItems([video, audio])

    render(CompositingTimeline)

    expect(screen.getByTestId(`motion-layer-row-${video.id}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`motion-layer-row-${audio.id}`)).not.toBeInTheDocument()

    useEditorStore.setState({ linkedSelectionEnabled: false })
    trimItemEnd(video.id, -10, { forceLinked: true })
    flushSync()
    expect(useItemsStore.getState().itemById[video.id]?.durationInFrames).toBe(110)
    expect(useItemsStore.getState().itemById[audio.id]?.durationInFrames).toBe(110)
  })

  it('expands and collapses every layer with Shift-click', async () => {
    const second = secondLayer()
    useItemsStore.getState().setTracks([track, second.track])
    useItemsStore.getState().setItems([shape, second.shape])
    render(CompositingTimeline)

    const expandButtons = screen.getAllByRole('button', { name: 'Expand layer properties' })
    await fireEvent.click(expandButtons[0]!, { shiftKey: true })

    expect(useComposeUiStore.getState().expandedLayerIdsByComposition['comp-1']).toEqual([
      shape.id,
      second.shape.id,
    ])
    expect(screen.getAllByRole('button', { name: 'Collapse layer properties' })).toHaveLength(2)

    await fireEvent.click(
      screen.getAllByRole('button', { name: 'Collapse layer properties' })[0]!,
      {
        shiftKey: true,
      },
    )

    expect(useComposeUiStore.getState().expandedLayerIdsByComposition['comp-1']).toEqual([])
  })

  it('uses a light border and readable text for the selected segment', () => {
    useSelectionStore.getState().selectItems([shape.id])
    render(CompositingTimeline)

    expect(screen.getByTestId(`motion-layer-span-${shape.id}`)).toHaveClass(
      'border-foreground/80',
      'text-foreground',
    )
  })

  it('contains and hides the motion badge until a segment has 44px of usable width', () => {
    useItemsStore.getState().setItems([
      {
        ...shape,
        durationInFrames: 1,
        motionModifiers: [
          {
            id: 'tiny-drift',
            type: 'float-drift',
            enabled: true,
            amplitude: 1,
            frequency: 0.6,
            phaseFrames: 0,
            seed: 1,
          },
        ],
      },
    ])

    render(CompositingTimeline)

    expect(screen.getByTestId(`motion-layer-span-${shape.id}`)).toHaveClass(
      '@container',
      'overflow-hidden',
    )
    expect(screen.getByTestId(`motion-procedural-badge-${shape.id}`)).toHaveClass(
      'hidden',
      '@min-[44px]:block',
      'right-2',
    )
  })

  it('uses one shared flag-and-line playhead and supports continuous ruler scrubbing', async () => {
    render(CompositingTimeline)
    const playhead = screen.getByTestId('motion-playhead')
    expect(screen.getAllByTestId('motion-playhead')).toHaveLength(1)
    expect(playhead.parentElement).toHaveStyle({ left: '630px', right: '9px' })
    expect(playhead.parentElement).toHaveClass('overflow-visible', 'inset-y-0')
    expect(playhead.parentElement?.parentElement).toHaveClass('absolute', 'inset-0')
    expect(playhead.parentElement?.parentElement?.parentElement).toHaveClass(
      'relative',
      'min-h-0',
      'flex-1',
    )
    expect(screen.getByTestId(`motion-layer-span-${shape.id}`).parentElement).toHaveClass(
      'overflow-hidden',
    )

    const ruler = screen.getByText('0.0s').parentElement!.parentElement!
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue(rect(300, 28))
    await fireEvent.pointerDown(ruler, { pointerId: 1, button: 0, clientX: 0 })
    await fireEvent.pointerMove(ruler, { pointerId: 1, buttons: 1, clientX: 150 })
    await fireEvent.pointerUp(ruler, { pointerId: 1, clientX: 150 })

    expect(usePlaybackStore.getState().currentFrame).toBe(60)
  })

  it('batches ruler scrub movement to the latest pointer position per animation frame', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const ruler = screen.getByText('0.0s').parentElement!.parentElement!
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue(rect(300, 28))
    frames.callbacks.length = 0

    await fireEvent.pointerDown(ruler, { pointerId: 2, button: 0, clientX: 0 })
    await fireEvent.pointerMove(ruler, { pointerId: 2, buttons: 1, clientX: 75 })
    await fireEvent.pointerMove(ruler, { pointerId: 2, buttons: 1, clientX: 150 })

    expect(frames.callbacks).toHaveLength(1)
    expect(usePlaybackStore.getState().currentFrame).toBe(0)
    frames.run()
    expect(usePlaybackStore.getState().currentFrame).toBe(0)
    expect(usePlaybackStore.getState().previewFrame).toBe(60)

    await fireEvent.pointerUp(ruler, { pointerId: 2, clientX: 150 })
    expect(usePlaybackStore.getState().currentFrame).toBe(60)
    expect(usePlaybackStore.getState().previewFrame).toBeNull()
  })

  it('places Zoom To Fit beside the FPS readout, after Trim Comp to Active Region', () => {
    render(CompositingTimeline)
    const fitButton = screen.getByRole('button', { name: 'Zoom To Fit' })
    const fpsReadout = screen.getByText('120f · 30fps')
    const trimButton = screen.getByRole('button', { name: 'Trim Comp to Active Region' })

    expect(fpsReadout.nextElementSibling).toBe(trimButton)
    expect(trimButton.nextElementSibling).toBe(fitButton)
    expect(fitButton).toHaveAttribute('data-tooltip', 'Zoom To Fit')
  })

  it('keeps compact in and out trim controls accessible without visible I/O glyphs', () => {
    render(CompositingTimeline)

    const inFrameInput = screen.getByRole('spinbutton', { name: 'In frame' })
    const outFrameInput = screen.getByRole('spinbutton', { name: 'Out frame' })
    const inFrameLabel = inFrameInput.closest('label')
    const outFrameLabel = outFrameInput.closest('label')

    expect(inFrameLabel).toHaveAttribute('title', 'In frame')
    expect(outFrameLabel).toHaveAttribute('title', 'Out frame')
    expect(within(inFrameLabel!).getByText('I')).toHaveClass('sr-only')
    expect(within(outFrameLabel!).getByText('O')).toHaveClass('sr-only')

    inFrameInput.focus()
    expect(inFrameInput).toHaveFocus()
    outFrameInput.focus()
    expect(outFrameInput).toHaveFocus()
  })

  it('commits a typed in frame as one layer edit, clamped to the layer', async () => {
    useItemsStore.getState().setItems([{ ...shape, from: 10, durationInFrames: 60 }])
    render(CompositingTimeline)

    const inFrameInput = screen.getByRole('spinbutton', { name: 'In frame' }) as HTMLInputElement
    inFrameInput.value = '500'
    await fireEvent.blur(inFrameInput)

    expect(useItemsStore.getState().itemById[shape.id]).toMatchObject({
      from: 69,
      durationInFrames: 1,
    })
    expect(screen.getByRole('spinbutton', { name: 'In frame' })).toHaveValue(69)
  })

  it('rebalances layer columns without shrinking parent or frame controls below usable sizes', () => {
    render(CompositingTimeline)

    const nameCell = screen.getByTestId(`motion-layer-name-cell-${shape.id}`)
    const parentCell = screen.getByTestId(`motion-parent-cell-${shape.id}`)
    const timingCell = screen.getByTestId(`motion-timing-cell-${shape.id}`)

    expect(nameCell.parentElement).toHaveStyle({ width: '620px' })
    expect(nameCell).toHaveClass('min-w-0', 'flex-1')
    expect(screen.getByTestId('motion-parent-header')).toHaveStyle({ width: '148px' })
    expect(parentCell).toHaveStyle({ width: '148px' })
    expect(screen.getByTestId('motion-timing-header')).toHaveStyle({ width: '128px' })
    expect(timingCell).toHaveStyle({ width: '128px' })
    expect(within(timingCell).getByRole('spinbutton', { name: 'In frame' })).toHaveClass('w-14')
    expect(within(timingCell).getByRole('spinbutton', { name: 'Out frame' })).toHaveClass('w-14')
    expect(
      within(parentCell).getByRole('combobox', { name: `Parent for ${shape.label}` }),
    ).toHaveClass('min-w-0', 'flex-1')
  })

  it('uses middle-mouse drag to move the layer list vertically without changing selection', async () => {
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    useSelectionStore.getState().clearSelection()
    scrollArea.scrollTop = 100

    const span = screen.getByTestId(`motion-layer-span-${shape.id}`)
    await fireEvent.pointerDown(span, {
      button: 1,
      buttons: 4,
      pointerId: 7,
      clientX: 800,
      clientY: 200,
    })
    await fireEvent.pointerMove(window, { buttons: 4, pointerId: 7, clientX: 700, clientY: 300 })

    expect(useSelectionStore.getState().selectedItemIds).toEqual([])
    expect(useKeyframeSelectionStore.getState().selectedKeyframes).toEqual([])
    expect(scrollArea.scrollTop).toBe(200)
    expect(screen.getByText('0.0s')).toBeInTheDocument()
    expect(screen.getByText('4.0s')).toBeInTheDocument()

    await fireEvent.pointerUp(window, { button: 1, pointerId: 7, clientX: 700, clientY: 300 })
    expect(document.body.style.cursor).toBe('')
  })

  it('exposes layer actions in the context menu and renames inline', async () => {
    render(CompositingTimeline)
    const layerName = screen.getByRole('button', { name: /1hero rectangle/i })
    await openContextMenu(layerName)
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await fireEvent.dblClick(layerName)

    const nameInput = screen.getByRole('textbox', { name: 'Layer name' })
    await fireEvent.input(nameInput, { target: { value: 'Renamed rectangle' } })
    await fireEvent.keyDown(nameInput, { key: 'Enter' })
    expect(useItemsStore.getState().itemById[shape.id]?.label).toBe('Renamed rectangle')
  })

  it('deletes a layer and its track from the row context menu', async () => {
    render(CompositingTimeline)
    await openContextMenu(screen.getByRole('button', { name: /1hero rectangle/i }))
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const itemsState = useItemsStore.getState()
    expect(itemsState.itemById[shape.id]).toBeUndefined()
    expect(itemsState.items.some((item) => item.id === shape.id)).toBe(false)
    expect(itemsState.tracks.some((candidate) => candidate.id === track.id)).toBe(false)
  })

  it('selects the right-clicked layer when it is outside the current selection', async () => {
    const second = secondLayer()
    useItemsStore.getState().setTracks([track, second.track])
    useItemsStore.getState().setItems([shape, second.shape])
    useSelectionStore.getState().selectItems([shape.id])

    render(CompositingTimeline)
    await openContextMenu(screen.getByRole('button', { name: /2circle/i }))

    expect(useSelectionStore.getState().selectedItemIds).toEqual([second.shape.id])
  })

  it('copies a layer to the clipboard from the row context menu', async () => {
    render(CompositingTimeline)
    await openContextMenu(screen.getByRole('button', { name: /1hero rectangle/i }))
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy' }))

    expect(useClipboardStore.getState().itemsClipboard?.originalIds).toEqual([shape.id])
  })

  it('duplicates a layer from the row context menu', async () => {
    render(CompositingTimeline)
    await openContextMenu(screen.getByRole('button', { name: /1hero rectangle/i }))
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    const itemsState = useItemsStore.getState()
    expect(itemsState.tracks.some((candidate) => candidate.name === 'Hero rectangle copy')).toBe(
      true,
    )
    expect(itemsState.items).toHaveLength(2)
  })

  it('preserves a multi-selection when grouping from a selected layer context menu', async () => {
    const second = secondLayer()
    useItemsStore.getState().setTracks([track, second.track])
    useItemsStore.getState().setItems([shape, second.shape])
    useSelectionStore.getState().selectItems([shape.id, second.shape.id])
    render(CompositingTimeline)

    await openContextMenu(screen.getByRole('button', { name: /2circle/i }))

    expect(useSelectionStore.getState().selectedItemIds).toEqual([shape.id, second.shape.id])
    await fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Create Layer Group from selected layers' }),
    )

    expect(useItemsStore.getState().tracks.filter((candidate) => candidate.isGroup)).toHaveLength(1)
  })

  it('creates a dedicated backing track when adding a generated layer', async () => {
    render(CompositingTimeline)
    await addItem('Text')

    const state = useItemsStore.getState()
    const textLayer = state.items.find((item) => item.type === 'text')
    expect(textLayer).toBeDefined()
    expect(state.tracks.find((candidate) => candidate.id === textLayer?.trackId)?.name).toBe(
      textLayer?.label,
    )
  })

  it('discovers Solid Color and Gradient in Add Item and creates canonical full-frame Shapes', async () => {
    render(CompositingTimeline)

    await addItem('Solid Color')
    await addItem('Gradient')

    const state = useItemsStore.getState()
    expect(state.items.find((item) => item.label === 'Solid Color')).toMatchObject({
      type: 'shape',
      shapeType: 'rectangle',
      fillType: 'solid',
      transform: { width: 1920, height: 1080 },
    })
    expect(state.items.find((item) => item.label === 'Gradient')).toMatchObject({
      type: 'shape',
      shapeType: 'rectangle',
      fillType: 'linear',
      gradientStartColor: '#3b82f6',
      gradientEndColor: '#8b5cf6',
      gradientAngle: 0,
      transform: { width: 1920, height: 1080 },
    })
  })

  it('adds a non-rendering Null Object layer for transform parenting', async () => {
    render(CompositingTimeline)
    await addItem('Null Object')
    await addItem('Text')

    const state = useItemsStore.getState()
    const nullObject = state.items.find((item) => item.type === 'controller')
    const textLayer = state.items.find((item) => item.type === 'text')
    expect(nullObject).toMatchObject({
      type: 'controller',
      controllerKind: 'null',
      label: 'Null Object',
    })
    expect(state.tracks.find((candidate) => candidate.id === nullObject?.trackId)?.name).toBe(
      'Null Object',
    )
    const nullObjectName = screen.getByRole('button', { name: /Null Object \(does not render\)/ })
    expect(nullObjectName).toHaveAttribute('title', 'Null Object (does not render)')
    const reservedIconSlot = screen.getByTestId(`motion-null-object-icon-slot-${nullObject?.id}`)
    expect(reservedIconSlot).toHaveClass('h-[18px]', 'w-[18px]', 'shrink-0')
    expect(reservedIconSlot).toHaveAttribute('aria-hidden', 'true')
    expect(reservedIconSlot).toBeEmptyDOMElement()
    const nullObjectTypeIcon = screen.getByTestId(`motion-layer-type-icon-${nullObject?.id}`)
    expect(nullObjectName).toContainElement(nullObjectTypeIcon)
    expect(nullObjectName).toHaveClass('px-0')
    expect(nullObjectTypeIcon.previousElementSibling).toHaveClass(
      'mr-0.5',
      'w-3',
      'text-right',
      'tabular-nums',
    )
    expect(nullObjectTypeIcon).toHaveClass('mr-1', 'h-3', 'w-3', 'text-muted-foreground')
    expect(nullObjectTypeIcon).toHaveAttribute('aria-hidden', 'true')
    expect(nullObjectTypeIcon).toHaveAttribute('data-motion-layer-type-icon', 'controller')
    expect(screen.getByTestId(`motion-layer-type-icon-${shape.id}`)).toHaveAttribute(
      'data-motion-layer-type-icon',
      'shape',
    )
    expect(screen.getByTestId(`motion-layer-type-icon-${textLayer?.id}`)).toHaveAttribute(
      'data-motion-layer-type-icon',
      'text',
    )
    expect(screen.getAllByRole('button', { name: 'Hide layer' })).toHaveLength(2)
  })

  it('labels composition and item creation actions in the Motion header', () => {
    render(CompositingTimeline)

    expect(screen.getByRole('button', { name: 'New composition' })).toHaveTextContent('New Comp')
    const addItemButton = screen.getByRole('button', { name: 'Add Item' })
    const layerGroupButton = screen.getByRole('button', {
      name: 'Create Layer Group from selected layers',
    })
    expect(addItemButton.nextElementSibling).toBe(layerGroupButton)
    expect(layerGroupButton).toHaveAttribute(
      'title',
      'Organize layers and move them together. Use Parent for transform inheritance.',
    )
  })

  it('parents and unparents a layer from the Parent dropdown', async () => {
    const parent = nullObjectLayer()
    useItemsStore.getState().setTracks([track, parent.track])
    useItemsStore.getState().setItems([shape, parent.item])

    render(CompositingTimeline)
    const parentSelect = within(screen.getByTestId(`motion-parent-cell-${shape.id}`)).getByRole(
      'combobox',
      {
        name: 'Parent for Hero rectangle',
      },
    )

    await chooseOption(parentSelect, /Null: Null Object/)
    expect(useItemsStore.getState().itemById[shape.id]?.transformParent?.parentItemId).toBe(
      parent.item.id,
    )
    await waitFor(() => expect(parentSelect).toHaveTextContent('Null: Null Object'))

    await chooseOption(parentSelect, 'None')
    expect(
      useItemsStore.getState().itemById[shape.id]?.transformParent?.parentItemId,
    ).toBeUndefined()
    await waitFor(() => expect(parentSelect).toHaveTextContent('None'))
  })

  it('parents by dragging the Parent pick whip and detaches with Ctrl-click', async () => {
    const parent = nullObjectLayer()
    useItemsStore.getState().setTracks([track, parent.track])
    useItemsStore.getState().setItems([shape, parent.item])
    render(CompositingTimeline)

    const parentRow = screen.getByTestId(`motion-layer-row-${parent.item.id}`)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => parentRow),
    })
    const pickWhip = screen.getByRole('button', { name: 'Parent pick whip for Hero rectangle' })

    await fireEvent.pointerDown(pickWhip, { button: 0, pointerId: 41, clientX: 0, clientY: 0 })
    expect(screen.getByTestId('transform-parent-pick-whip')).toBeInTheDocument()
    await fireEvent.pointerMove(window, { pointerId: 41, clientX: 32, clientY: 24 })
    await waitFor(() =>
      expect(parentRow).toHaveAttribute('data-transform-parent-link-hover', 'true'),
    )
    await fireEvent.pointerUp(window, { pointerId: 41, clientX: 32, clientY: 24 })

    expect(useItemsStore.getState().itemById[shape.id]?.transformParent?.parentItemId).toBe(
      parent.item.id,
    )
    expect(screen.queryByTestId('transform-parent-pick-whip')).toBeNull()
    expect(parentRow).not.toHaveAttribute('data-transform-parent-link-hover')

    await fireEvent.pointerDown(pickWhip, {
      button: 0,
      pointerId: 42,
      clientX: 0,
      clientY: 0,
      ctrlKey: true,
    })
    expect(
      useItemsStore.getState().itemById[shape.id]?.transformParent?.parentItemId,
    ).toBeUndefined()
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('explains when a Parent pick whip target would create a circular dependency', async () => {
    const toastError = vi.spyOn(toast, 'error')
    const child = nullObjectLayer('cycle-child', 'Cycle child')
    child.item.transformParent = {
      parentItemId: shape.id,
      parentReference: { x: 100, y: 80, width: 400, height: 220, rotation: 0 },
      childLocalReference: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
      childWorldReference: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    }
    useItemsStore.getState().setTracks([track, child.track])
    useItemsStore.getState().setItems([shape, child.item])
    render(CompositingTimeline)

    const rejectedRow = screen.getByTestId(`motion-layer-row-${child.item.id}`)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => rejectedRow),
    })
    await fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Parent pick whip for Hero rectangle' }),
      {
        button: 0,
        pointerId: 43,
        clientX: 0,
        clientY: 0,
      },
    )
    await fireEvent.pointerMove(window, { pointerId: 43, clientX: 32, clientY: 24 })

    await waitFor(() => {
      expect(screen.getByTestId('transform-parent-pick-whip-feedback')).toHaveTextContent(
        'This parent link would create a circular dependency.',
      )
      expect(rejectedRow).toHaveAttribute('data-transform-parent-link-rejected', 'true')
    })
    expect(screen.getByTestId('transform-parent-pick-whip').querySelector('path')).toHaveAttribute(
      'stroke',
      'rgb(248 113 113)',
    )

    await fireEvent.pointerUp(window, { pointerId: 43, clientX: 32, clientY: 24 })

    expect(useItemsStore.getState().itemById[shape.id]?.transformParent).toBeUndefined()
    expect(screen.queryByTestId('transform-parent-pick-whip')).toBeNull()
    expect(rejectedRow).not.toHaveAttribute('data-transform-parent-link-rejected')
    Reflect.deleteProperty(document, 'elementFromPoint')

    toastError.mockClear()
    const parentSelect = screen.getByRole('combobox', { name: 'Parent for Hero rectangle' })
    await chooseOption(parentSelect, /Cycle child/)

    expect(toastError).toHaveBeenCalledWith('This parent link would create a circular dependency.')
    expect(useItemsStore.getState().itemById[shape.id]?.transformParent).toBeUndefined()
    await waitFor(() => expect(parentSelect).toHaveTextContent('None'))
  })

  it('explains when parenting would duplicate an existing transform link', async () => {
    const source = nullObjectLayer('linked-source', 'Linked source')
    useItemsStore.getState().setTracks([track, source.track])
    useItemsStore.getState().setItems([shape, source.item])
    useKeyframesStore.setState({
      keyframesByItemId: {
        [shape.id]: {
          itemId: shape.id,
          properties: [],
          propertyLinks: [
            {
              type: 'link',
              targetProperty: 'position',
              sourceItemId: source.item.id,
              sourceProperty: 'position',
              enabled: true,
              timeOffsetFrames: 0,
            },
          ],
        },
      },
    })
    render(CompositingTimeline)

    const rejectedRow = screen.getByTestId(`motion-layer-row-${source.item.id}`)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => rejectedRow),
    })
    await fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Parent pick whip for Hero rectangle' }),
      {
        button: 0,
        pointerId: 44,
        clientX: 0,
        clientY: 0,
      },
    )
    await fireEvent.pointerMove(window, { pointerId: 44, clientX: 32, clientY: 24 })

    await waitFor(() => {
      expect(screen.getByTestId('transform-parent-pick-whip-feedback')).toHaveTextContent(
        'Linked source already drives this layer’s transform. Parenting it would apply the transform twice.',
      )
      expect(rejectedRow).toHaveAttribute('data-transform-parent-link-rejected', 'true')
    })

    await fireEvent.pointerCancel(window, { pointerId: 44 })
    expect(rejectedRow).not.toHaveAttribute('data-transform-parent-link-rejected')
    Reflect.deleteProperty(document, 'elementFromPoint')

    const toastError = vi.spyOn(toast, 'error')
    const parentSelect = screen.getByRole('combobox', { name: 'Parent for Hero rectangle' })
    await chooseOption(parentSelect, /Linked source/)

    expect(toastError).toHaveBeenCalledWith(
      'Linked source already drives this layer’s transform. Parenting it would apply the transform twice.',
    )
    expect(useItemsStore.getState().itemById[shape.id]?.transformParent).toBeUndefined()
    await waitFor(() => expect(parentSelect).toHaveTextContent('None'))
  })

  it('uses Ctrl to toggle layers and Shift to add a visible layer range', async () => {
    const second = secondLayer(1, 'Circle')
    const third = secondLayer(2, 'Triangle')
    useItemsStore.getState().setTracks([track, second.track, third.track])
    useItemsStore.getState().setItems([shape, second.shape, third.shape])
    render(CompositingTimeline)

    const first = screen.getByRole('button', { name: /1hero rectangle/i })
    const thirdName = screen.getByRole('button', { name: /3triangle/i })

    await fireEvent.click(first)
    await fireEvent.click(thirdName, { ctrlKey: true })
    expect(useSelectionStore.getState().selectedItemIds).toEqual([shape.id, third.shape.id])

    await fireEvent.click(thirdName, { ctrlKey: true })
    expect(useSelectionStore.getState().selectedItemIds).toEqual([shape.id])

    await fireEvent.click(first)
    await fireEvent.click(thirdName, { shiftKey: true })
    expect(useSelectionStore.getState().selectedItemIds).toEqual([
      shape.id,
      second.shape.id,
      third.shape.id,
    ])
  })

  it('drags a layer span in time and commits one undoable move', async () => {
    render(CompositingTimeline)
    usePlaybackStore.setState({ currentFrame: 40, previewFrame: null })
    const span = screen.getByTestId(`motion-layer-span-${shape.id}`)
    vi.spyOn(span.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(300, 34))

    await fireEvent.pointerDown(span, { pointerId: 1, button: 0, clientX: 0 })
    await fireEvent.pointerMove(span, { pointerId: 1, buttons: 1, clientX: 30 })
    await fireEvent.pointerUp(span, { pointerId: 1, clientX: 30 })

    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(12)
    expect(usePlaybackStore.getState().currentFrame).toBe(40)
    expect(usePlaybackStore.getState().previewFrame).toBeNull()
    useTimelineCommandStore.getState().undo()
    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(0)
  })

  it('discards a span move when the pointer interaction is cancelled', async () => {
    render(CompositingTimeline)
    const span = screen.getByTestId(`motion-layer-span-${shape.id}`)
    vi.spyOn(span.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(300, 34))

    await fireEvent.pointerDown(span, { pointerId: 2, button: 0, clientX: 0 })
    await fireEvent.pointerMove(span, { pointerId: 2, buttons: 1, clientX: 30 })
    await fireEvent.pointerCancel(span, { pointerId: 2, clientX: 30 })

    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(0)
  })

  it('previews start and end trims on compositor visuals and cancels without committing', async () => {
    const opacityKeyframeId = useKeyframesStore.getState()._addKeyframe(shape.id, 'opacity', 10, 1)
    useComposeUiStore.setState({ expandedLayerIdsByComposition: { 'comp-1': [shape.id] } })
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const span = screen.getByTestId(`motion-layer-span-${shape.id}`)
    const lane = span.parentElement!
    const startHandle = screen.getByTestId(`motion-trim-start-${shape.id}`)
    const endHandle = screen.getByTestId(`motion-trim-end-${shape.id}`)
    const keyframeVisual = screen
      .getByTestId(`row-keyframe-opacity-${opacityKeyframeId}`)
      .closest<HTMLElement>('[data-motion-span-drag-visual]')!
    const initialWidth = span.style.width
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(rect(300, 34))
    vi.spyOn(span, 'getBoundingClientRect').mockReturnValue(rect(120, 20))
    frames.callbacks.length = 0

    await fireEvent.pointerDown(startHandle, { pointerId: 11, button: 0, clientX: 25 })
    await fireEvent.pointerMove(startHandle, { pointerId: 11, buttons: 1, clientX: 40 })
    frames.run()
    expect(span.style.translate).toBe('')
    expect(span.style.transform).not.toBe('')
    expect(span.style.width).not.toBe(initialWidth)
    expect(keyframeVisual.style.translate).toBe('')
    expect(keyframeVisual.style.transform).not.toBe('')
    await fireEvent.pointerCancel(startHandle, { pointerId: 11, clientX: 40 })
    expect(span.style.translate).toBe('')
    expect(span.style.transform).toBe('')
    expect(span.style.width).toBe(initialWidth)
    expect(keyframeVisual.style.translate).toBe('')
    expect(keyframeVisual.style.transform).toBe('')
    expect(useItemsStore.getState().itemById[shape.id]).toMatchObject({
      from: 0,
      durationInFrames: 120,
    })

    await fireEvent.pointerDown(endHandle, { pointerId: 12, button: 0, clientX: 200 })
    await fireEvent.pointerMove(endHandle, { pointerId: 12, buttons: 1, clientX: 170 })
    frames.run()
    expect(span.style.translate).toBe('')
    expect(span.style.transform).toBe('')
    expect(span.style.width).not.toBe(initialWidth)
    expect(keyframeVisual.style.translate).toBe('')
    expect(keyframeVisual.style.transform).toBe('')
    await fireEvent.pointerCancel(endHandle, { pointerId: 12, clientX: 170 })
    expect(span.style.width).toBe(initialWidth)
    expect(useItemsStore.getState().itemById[shape.id]).toMatchObject({
      from: 0,
      durationInFrames: 120,
    })
  })

  it('trims a layer span from either edge and keeps each drag undoable', async () => {
    useItemsStore.getState().setItems([{ ...shape, from: 10, durationInFrames: 60 }])
    render(CompositingTimeline)
    const startHandle = screen.getByTestId(`motion-trim-start-${shape.id}`)
    const endHandle = screen.getByTestId(`motion-trim-end-${shape.id}`)
    const lane = screen.getByTestId(`motion-layer-span-${shape.id}`).parentElement!
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(rect(300, 34))

    await fireEvent.pointerDown(endHandle, { pointerId: 4, button: 0, clientX: 200 })
    await fireEvent.pointerMove(endHandle, { pointerId: 4, clientX: 170 })
    await fireEvent.pointerUp(endHandle, { pointerId: 4, clientX: 170 })

    expect(useItemsStore.getState().itemById[shape.id]).toMatchObject({
      from: 10,
      durationInFrames: 48,
    })

    await fireEvent.pointerDown(startHandle, { pointerId: 5, button: 0, clientX: 25 })
    await fireEvent.pointerMove(startHandle, { pointerId: 5, clientX: 40 })
    await fireEvent.pointerUp(startHandle, { pointerId: 5, clientX: 40 })

    expect(useItemsStore.getState().itemById[shape.id]).toMatchObject({
      from: 16,
      durationInFrames: 42,
    })
    useTimelineCommandStore.getState().undo()
    expect(useItemsStore.getState().itemById[shape.id]).toMatchObject({
      from: 10,
      durationInFrames: 48,
    })
  })

  it('reorders layers from the three-dot handle in one undo step', async () => {
    const second = secondLayer()
    useItemsStore.getState().setTracks([track, second.track])
    useItemsStore.getState().setItems([shape, { ...second.shape, shapeType: 'ellipse' }])

    const { container } = render(CompositingTimeline)
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-motion-row-track-id]'))
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(800, 34, index * 34))
    })

    let previewFrame: FrameRequestCallback | undefined
    const animationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        previewFrame = callback
        return 1
      })
    const handle = screen.getByTestId(`motion-reorder-handle-${second.track.id}`)
    await fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientY: 51 })
    await fireEvent.pointerMove(handle, { pointerId: 2, clientY: 5 })
    await fireEvent.pointerMove(handle, { pointerId: 2, clientY: 0 })

    expect(animationFrameSpy).toHaveBeenCalledTimes(1)
    previewFrame?.(16)
    expect(handle.closest<HTMLElement>('[data-motion-row-track-id]')?.style.transform).toBe(
      'translate3d(0, -51px, 0)',
    )

    await fireEvent.pointerUp(handle, { pointerId: 2, clientY: 0 })
    animationFrameSpy.mockRestore()

    const order = () =>
      [...useItemsStore.getState().tracks]
        .sort((left, right) => left.order - right.order)
        .map((candidate) => candidate.id)
    expect(order()).toEqual([second.track.id, track.id])
    useTimelineCommandStore.getState().undo()
    expect(order()).toEqual([track.id, second.track.id])
  })

  it('reorders a group as one top-level row without moving its children out', async () => {
    const groupTrack = makeTimelineTrack({
      id: 'group-track',
      name: 'Group 1',
      kind: 'video',
      order: 0,
      isGroup: true,
    })
    const childTrack = makeTimelineTrack({
      ...track,
      id: 'child-track',
      order: 0,
      parentTrackId: groupTrack.id,
    })
    const topTrack = makeTimelineTrack({
      id: 'top-track',
      name: 'Top layer',
      kind: 'video',
      order: 1,
    })
    useItemsStore.getState().setTracks([groupTrack, childTrack, topTrack])
    useItemsStore.getState().setItems([
      { ...shape, trackId: childTrack.id },
      { ...shape, id: 'shape-top', trackId: topTrack.id, label: 'Top layer' },
    ])

    const { container } = render(CompositingTimeline)
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-motion-row-track-id]'))
    rows.forEach((row, index) => {
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect(800, 34, index * 34))
    })

    const handle = screen.getByTestId(`motion-reorder-handle-${topTrack.id}`)
    await fireEvent.pointerDown(handle, { pointerId: 3, button: 0, clientY: 85 })
    await fireEvent.pointerMove(handle, { pointerId: 3, clientY: 0 })
    await fireEvent.pointerUp(handle, { pointerId: 3, clientY: 0 })

    const reordered = useItemsStore.getState().tracks
    expect(reordered.find((candidate) => candidate.id === topTrack.id)?.order).toBe(0)
    expect(reordered.find((candidate) => candidate.id === groupTrack.id)?.order).toBe(1)
    expect(reordered.find((candidate) => candidate.id === childTrack.id)?.parentTrackId).toBe(
      groupTrack.id,
    )
  })

  it('groups selected layers into a collapsible parent track and can ungroup them', async () => {
    const second = secondLayer()
    useItemsStore.getState().setTracks([track, second.track])
    useItemsStore.getState().setItems([shape, { ...second.shape, shapeType: 'ellipse' }])
    useSelectionStore.getState().selectItems([shape.id, second.shape.id])

    render(CompositingTimeline)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create Layer Group from selected layers' }),
    )

    const groupedState = useItemsStore.getState()
    const groupTrack = groupedState.tracks.find((candidate) => candidate.isGroup)
    expect(groupTrack).toBeDefined()
    expect(
      groupedState.tracks
        .filter((candidate) => candidate.id === track.id || candidate.id === second.track.id)
        .every((candidate) => candidate.parentTrackId === groupTrack?.id),
    ).toBe(true)
    const groupRow = screen.getByTestId(`motion-group-${groupTrack!.id}`)

    await openContextMenu(groupRow)
    expect(await screen.findByRole('menuitem', { name: 'Ungroup Layers' })).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Delete Layer Group and Contents' }),
    ).toBeInTheDocument()
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await fireEvent.click(within(groupRow).getByRole('button', { name: 'Ungroup Layers' }))
    expect(useItemsStore.getState().tracks.some((candidate) => candidate.isGroup)).toBe(false)
  })

  it('moves all Layer Group contents together but discards a cancelled group move', async () => {
    const layerGroup = makeTimelineTrack({
      id: 'layer-group',
      name: 'Layer Group 1',
      kind: 'video',
      order: 0,
      isGroup: true,
    })
    const secondTrack = makeTimelineTrack({
      id: 'layer-track-2',
      name: 'Circle',
      kind: 'video',
      order: 2,
      parentTrackId: layerGroup.id,
    })
    const firstChildTrack = { ...track, order: 1, parentTrackId: layerGroup.id }
    const secondShape: ShapeItem = {
      ...shape,
      id: 'shape-2',
      trackId: secondTrack.id,
      label: 'Circle',
      from: 20,
    }
    useItemsStore.getState().setTracks([layerGroup, firstChildTrack, secondTrack])
    useItemsStore.getState().setItems([shape, secondShape])
    const opacityKeyframeId = useKeyframesStore.getState()._addKeyframe(shape.id, 'opacity', 10, 1)
    useComposeUiStore.setState({ expandedLayerIdsByComposition: { 'comp-1': [shape.id] } })
    const frames = mockAnimationFrames()

    render(CompositingTimeline)
    const span = screen.getByTestId(`motion-group-span-${layerGroup.id}`)
    expect(span).toHaveClass('h-6')
    const keyframeTestId = `row-keyframe-opacity-${opacityKeyframeId}`
    const keyframeMarker = screen.getByTestId(keyframeTestId)
    const initialKeyframeLeft = keyframeMarker.style.left
    const keyframeVisual = keyframeMarker.closest<HTMLElement>('[data-motion-span-drag-visual]')!
    vi.spyOn(span.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(300, 34))
    frames.callbacks.length = 0

    await fireEvent.pointerDown(span, { pointerId: 4, button: 0, clientX: 0 })
    await fireEvent.pointerMove(span, { pointerId: 4, buttons: 1, clientX: 10 })
    await fireEvent.pointerMove(span, { pointerId: 4, buttons: 1, clientX: 30 })
    expect(frames.callbacks).toHaveLength(1)
    frames.run()
    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(shape.from)
    expect(
      useKeyframesStore.getState().keyframesByItemId[shape.id]?.properties[0]?.keyframes[0]?.frame,
    ).toBe(10)
    expect(screen.getByTestId(keyframeTestId).style.left).toBe(initialKeyframeLeft)
    expect(span.style.translate).toBe('')
    expect(span.style.transform).not.toBe('')
    expect(keyframeVisual.style.translate).toBe('')
    expect(keyframeVisual.style.transform).not.toBe('')
    await fireEvent.pointerUp(span, { pointerId: 4, clientX: 30 })
    expect(keyframeVisual.style.translate).toBe('')
    expect(keyframeVisual.style.transform).toBe('')
    const groupMoveDelta = useItemsStore.getState().itemById[shape.id]?.from ?? 0
    expect(groupMoveDelta).toBeGreaterThan(0)
    expect(useItemsStore.getState().itemById[secondShape.id]?.from).toBe(20 + groupMoveDelta)

    useTimelineCommandStore.getState().undo()
    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(0)
    expect(useItemsStore.getState().itemById[secondShape.id]?.from).toBe(20)

    await fireEvent.pointerDown(span, { pointerId: 5, button: 0, clientX: 0 })
    await fireEvent.pointerMove(span, { pointerId: 5, buttons: 1, clientX: 30 })
    await fireEvent.pointerCancel(span, { pointerId: 5, clientX: 30 })
    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(0)
    expect(useItemsStore.getState().itemById[secondShape.id]?.from).toBe(20)
  })

  it('prevents child timeline and transform edits inherited from a locked Layer Group', async () => {
    const layerGroup = makeTimelineTrack({
      id: 'locked-layer-group',
      name: 'Layer Group 1',
      kind: 'video',
      order: 0,
      isGroup: true,
      locked: true,
    })
    const childTrack = makeTimelineTrack({
      ...track,
      id: 'locked-child-track',
      order: 1,
      parentTrackId: layerGroup.id,
    })
    useItemsStore.getState().setTracks([layerGroup, childTrack])
    useItemsStore.getState().setItems([{ ...shape, trackId: childTrack.id }])

    render(CompositingTimeline)

    const childSpan = screen.getByTestId(`motion-layer-span-${shape.id}`)
    expect(childSpan).toBeDisabled()
    expect(screen.getByTestId(`motion-reorder-handle-${childTrack.id}`)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Locked by Layer Group' })).toBeDisabled()
    expect(screen.getByTestId(`motion-parent-pick-whip-${shape.id}`)).toBeDisabled()
    expect(screen.getByLabelText('In frame')).toBeDisabled()
    expect(screen.getByLabelText('Out frame')).toBeDisabled()

    await fireEvent.pointerDown(childSpan, { pointerId: 7, button: 0, clientX: 0 })
    await fireEvent.pointerMove(childSpan, { pointerId: 7, buttons: 1, clientX: 40 })
    await fireEvent.pointerUp(childSpan, { pointerId: 7, clientX: 40 })
    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(0)
  })

  it('dims the axis past the comp end without a redundant top extent bar', () => {
    // A layer that outlives the 120-frame comp doubles the axis, so the comp
    // occupies the first half of the ruler and the overhang is dimmed.
    useItemsStore.getState().setItems([{ ...shape, durationInFrames: 240 }])

    render(CompositingTimeline)

    expect(screen.queryByTestId('motion-comp-extent-bar')).not.toBeInTheDocument()
    expect(screen.getByTestId('motion-comp-end-ruler-dim')).toHaveStyle({ left: '50%' })
    expect(screen.getByTestId('motion-comp-end-dim')).toHaveStyle({ left: '50%' })
  })

  it('dims the navigator against its inset frame axis near both edges', () => {
    useCompositionsStore.getState().updateComposition('comp-1', { durationInFrames: 240 })
    useItemsStore.getState().setItems([{ ...shape, durationInFrames: 240 }])
    setInPoint(12)
    setOutPoint(228)

    render(CompositingTimeline)

    const frameAxisOverlay = screen.getByTestId('motion-navigator-frame-axis-overlay')
    const overlay = screen.getByTestId('motion-navigator-active-region-overlay')

    expect(frameAxisOverlay).toHaveStyle({
      left: `${KEYFRAME_EDGE_INSET}px`,
      right: `${KEYFRAME_EDGE_INSET}px`,
    })
    expect(overlay).toHaveClass('pointer-events-none')
    expect(screen.getByTestId('motion-navigator-comp-end-dim')).toHaveStyle({ left: '100%' })
    expect(overlay.querySelector<HTMLElement>('[data-to-frame="12"]')).toHaveStyle({ width: '5%' })
    expect(overlay.querySelector<HTMLElement>('[data-from-frame="228"]')).toHaveStyle({
      left: '95%',
    })
  })

  it('keeps a segment trim handle interactive under the active-region dim', async () => {
    useItemsStore.getState().setItems([{ ...shape, durationInFrames: 240 }])

    render(CompositingTimeline)

    const span = screen.getByTestId(`motion-layer-span-${shape.id}`)
    const endHandle = screen.getByTestId(`motion-trim-end-${shape.id}`)
    vi.spyOn(span.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(300, 34))

    expect(screen.getByTestId('motion-comp-end-dim')).toHaveStyle({ left: '50%' })
    expect(screen.getByTestId('motion-active-region-overlay')).toHaveClass('pointer-events-none')

    await fireEvent.pointerDown(endHandle, { pointerId: 21, button: 0, clientX: 300 })
    await fireEvent.pointerMove(endHandle, { pointerId: 21, buttons: 1, clientX: 270 })
    await fireEvent.pointerUp(endHandle, { pointerId: 21, clientX: 270 })

    expect(useItemsStore.getState().itemById[shape.id]).toMatchObject({
      from: 0,
      durationInFrames: 216,
    })
  })

  it('reports the authored composition duration when content overhangs at fractional fps', () => {
    useCompositionsStore
      .getState()
      .updateComposition('comp-1', { durationInFrames: 100, fps: 29.97 })
    useItemsStore.getState().setItems([{ ...shape, durationInFrames: 240 }])

    render(CompositingTimeline)

    expect(screen.getByTestId('motion-composition-duration')).toHaveTextContent('100f · 29.97fps')
    expect(screen.queryByText('240f · 29.97fps')).not.toBeInTheDocument()
  })

  it('leaves the axis undimmed when nothing runs past the comp end', () => {
    render(CompositingTimeline)

    expect(screen.getByTestId('motion-comp-end-ruler-dim')).toHaveStyle({ left: '100%' })
    expect(screen.getByTestId('motion-comp-end-dim')).toHaveStyle({ left: '100%' })
  })

  it('fits the active region when one is marked, else the comp', async () => {
    useItemsStore.getState().setItems([{ ...shape, durationInFrames: 240 }])
    render(CompositingTimeline)

    const navigator = () => screen.getByTestId('motion-time-navigator')
    // Content runs to 240 but the comp ends at 120: the overhang is not fitted.
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom To Fit' }))
    expect(Number(navigator().dataset.startFrame)).toBe(0)
    expect(Number(navigator().dataset.endFrame)).toBe(120)

    setInPoint(30)
    setOutPoint(90)
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom To Fit' }))

    expect(Number(navigator().dataset.startFrame)).toBe(30)
    expect(Number(navigator().dataset.endFrame)).toBe(90)
  })

  it('enables Trim Comp to Active Region only while a region is marked', async () => {
    render(CompositingTimeline)

    const trimButton = () => screen.getByRole('button', { name: 'Trim Comp to Active Region' })
    expect(trimButton()).toBeDisabled()

    setInPoint(30)
    setOutPoint(90)
    flushSync()
    expect(trimButton()).toBeEnabled()

    // Start from a viewport that is zoomed and offset within the original comp.
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom To Fit' }))
    const navigator = screen.getByTestId('motion-time-navigator')
    expect(navigator).toHaveAttribute('data-start-frame', '30')
    expect(navigator).toHaveAttribute('data-end-frame', '90')

    await fireEvent.click(trimButton())

    // The 120-frame comp becomes the 60-frame region, and the shape rebases onto it.
    expect(useCompositionsStore.getState().getComposition('comp-1')?.durationInFrames).toBe(60)
    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(0)
    expect(useMarkersStore.getState().inPoint).toBe(0)
    expect(useMarkersStore.getState().outPoint).toBe(60)
    expect(screen.getByTestId('motion-io-strip')).toHaveAttribute('data-from-frame', '0')
    expect(screen.getByTestId('motion-io-strip')).toHaveAttribute('data-to-frame', '60')
    expect(navigator).toHaveAttribute('data-start-frame', '0')
    expect(navigator).toHaveAttribute('data-end-frame', '60')
    expect(trimButton()).toBeDisabled()
  })

  it('positions the Motion in/out lane against the visible time viewport', () => {
    // Duration is 120 frames and the viewport starts fitted, so 30–90 is the
    // middle half of the ruler.
    setInPoint(30)
    setOutPoint(90)

    render(CompositingTimeline)

    // jsdom drops the strip's whole inline style over its color-mix() shorthand,
    // so the handles carry the geometry here.
    expect(screen.getByTestId('motion-io-strip')).toHaveAttribute('data-from-frame', '30')
    expect(screen.getByTestId('motion-io-strip')).toHaveAttribute('data-to-frame', '90')
    expect(screen.getByTestId('motion-io-in-handle').parentElement).toHaveStyle({ left: '25%' })
    expect(screen.getByTestId('motion-io-out-handle').parentElement).toHaveStyle({ left: '75%' })
  })

  it('drags the Motion in point through the time viewport into the composition range', async () => {
    setInPoint(30)
    setOutPoint(90)

    render(CompositingTimeline)

    const lane = screen.getByTestId('motion-io-lane')
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue(rect(1000, 12))

    // The grip is decorative; the wide invisible hit area next to it takes the drag.
    const hitArea = screen.getByTestId('motion-io-in-handle').nextElementSibling as HTMLElement
    await fireEvent.pointerDown(hitArea, { pointerId: 1, button: 0, clientX: 500 })
    await fireEvent.pointerUp(document, { pointerId: 1, clientX: 500 })

    // Half the lane width across a 0–120 viewport.
    expect(useMarkersStore.getState().inPoint).toBe(60)
    expect(useMarkersStore.getState().outPoint).toBe(90)
  })

  it('shift-clicking a layer lock toggles every layer and layer group', async () => {
    const layerGroup = makeTimelineTrack({
      id: 'shift-lock-group',
      name: 'Layer Group 1',
      kind: 'video',
      order: 0,
      isGroup: true,
    })
    const groupedTrack = makeTimelineTrack({
      ...track,
      id: 'grouped-track',
      order: 1,
      parentTrackId: layerGroup.id,
    })
    const looseTrack = makeTimelineTrack({
      id: 'loose-track',
      name: 'Circle',
      kind: 'video',
      order: 2,
    })
    const secondShape: ShapeItem = {
      ...shape,
      id: 'shape-2',
      trackId: looseTrack.id,
      label: 'Circle',
    }
    useItemsStore.getState().setTracks([layerGroup, groupedTrack, looseTrack])
    useItemsStore.getState().setItems([{ ...shape, trackId: groupedTrack.id }, secondShape])

    render(CompositingTimeline)

    const lockButtons = screen.getAllByRole('button', { name: 'Lock layer' })
    expect(lockButtons).toHaveLength(2)
    await fireEvent.click(lockButtons[0]!, { shiftKey: true })

    expect(useItemsStore.getState().tracks.map((candidate) => candidate.locked)).toEqual([
      true,
      true,
      true,
    ])

    // The group row is the way back out once its children's buttons are disabled.
    await fireEvent.click(screen.getByRole('button', { name: 'Unlock layer group' }), {
      shiftKey: true,
    })

    expect(useItemsStore.getState().tracks.every((candidate) => candidate.locked !== true)).toBe(
      true,
    )
  })

  it('removes the empty former layer group when all of its children are regrouped', async () => {
    const oldGroup = makeTimelineTrack({
      id: 'old-layer-group',
      name: 'Layer Group 1',
      kind: 'video',
      order: 0,
      isGroup: true,
    })
    const secondTrack = makeTimelineTrack({
      id: 'layer-track-2',
      name: 'Circle',
      kind: 'video',
      order: 2,
      parentTrackId: oldGroup.id,
    })
    const firstChildTrack = { ...track, order: 1, parentTrackId: oldGroup.id }
    const secondShape: ShapeItem = {
      ...shape,
      id: 'shape-2',
      trackId: secondTrack.id,
      label: 'Circle',
    }
    useItemsStore.getState().setTracks([oldGroup, firstChildTrack, secondTrack])
    useItemsStore.getState().setItems([shape, secondShape])
    useSelectionStore.getState().selectItems([shape.id, secondShape.id])

    render(CompositingTimeline)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create Layer Group from selected layers' }),
    )

    const layerGroups = useItemsStore.getState().tracks.filter((candidate) => candidate.isGroup)
    expect(layerGroups).toHaveLength(1)
    expect(layerGroups[0]?.id).not.toBe(oldGroup.id)
  })

  it('accepts text and shape templates dragged from the shared media sidebar', async () => {
    render(CompositingTimeline)
    await fireEvent.drop(screen.getByTestId('compositing-timeline'), {
      dataTransfer: makeDataTransfer({
        type: 'timeline-template',
        itemType: 'text',
        label: 'Library title',
      }),
    })

    expect(useItemsStore.getState().items).toContainEqual(
      expect.objectContaining({ type: 'text', label: 'Library title' }),
    )
  })

  it('accepts media assets dragged from the shared media library', async () => {
    const media = {
      id: 'media-image',
      fileName: 'texture.png',
      mimeType: 'image/png',
      duration: 0,
    } as MediaMetadata
    useMediaLibraryStore.setState({ mediaItems: [media], mediaById: { [media.id]: media } })
    render(CompositingTimeline)

    await fireEvent.drop(screen.getByTestId('compositing-timeline'), {
      dataTransfer: makeDataTransfer({
        type: 'media-item',
        mediaId: media.id,
        mediaType: 'image',
        fileName: media.fileName,
        duration: media.duration,
      }),
    })

    await waitFor(() =>
      expect(useItemsStore.getState().items).toContainEqual(
        expect.objectContaining({ type: 'image', mediaId: media.id }),
      ),
    )
  })

  it('nests compositions from the media library and blocks reverse cycles', async () => {
    useCompositionsStore.getState().addComposition({
      id: 'child-comp',
      name: 'Child',
      editorKind: 'composite-2d',
      tracks: [],
      items: [],
      transitions: [],
      keyframes: [],
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 120,
    })
    render(CompositingTimeline)
    await fireEvent.drop(screen.getByTestId('compositing-timeline'), {
      dataTransfer: makeDataTransfer({ type: 'composition', compositionId: 'child-comp' }),
    })
    expect(useItemsStore.getState().items).toContainEqual(
      expect.objectContaining({ type: 'composition', compositionId: 'child-comp' }),
    )

    openComposition('child-comp', 'Child')
    flushSync()
    await fireEvent.drop(screen.getByTestId('compositing-timeline'), {
      dataTransfer: makeDataTransfer({ type: 'composition', compositionId: 'comp-1' }),
    })
    expect(useItemsStore.getState().items).toEqual([])
  })

  it('auto-pans the zoomed Motion viewport while the playhead is held near an edge', async () => {
    const frames = mockAnimationFrames()
    const settle = mockSettleTimers()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)

    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    settle.run()
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')
    frames.callbacks.length = 0
    settle.restore()

    const ruler = document.querySelector<HTMLElement>('[data-motion-ruler-surface]')!
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue(rect(300, 28))

    await fireEvent.pointerDown(ruler, { pointerId: 4, button: 0, clientX: 300 })
    expect(frames.callbacks).toHaveLength(1)
    frames.run(16)
    const firstAutoPanStart = Number(navigator.dataset.startFrame)
    const playhead = screen.getByTestId('motion-playhead')
    expect(firstAutoPanStart).toBeGreaterThan(8)
    expect(playhead).not.toHaveAttribute('hidden')
    expect(playhead).toHaveStyle({ transform: 'translate3d(299px, 0, 0)' })
    expect(frames.callbacks).toHaveLength(1)

    frames.run(32)
    expect(Number(navigator.dataset.startFrame)).toBeGreaterThan(firstAutoPanStart)
    expect(playhead).not.toHaveAttribute('hidden')
    expect(playhead).toHaveStyle({ transform: 'translate3d(299px, 0, 0)' })
    expect(frames.callbacks).toHaveLength(1)

    await fireEvent.pointerUp(ruler, { pointerId: 4, clientX: 300 })
    expect(Number(navigator.dataset.startFrame)).toBeGreaterThan(8)
    expect(usePlaybackStore.getState().previewFrame).toBeNull()
  })

  it('clamps repeated right-edge auto-pan to the authored composition end', async () => {
    // The layer intentionally hangs 120 frames past the 120-frame composition.
    // Manual navigation can inspect that overhang, but drag auto-pan must stop
    // at the authored comp boundary.
    useItemsStore.getState().setItems([{ ...shape, durationInFrames: 240 }])
    setInPoint(30)
    setOutPoint(90)
    const frames = mockAnimationFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)

    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom To Fit' }))
    const navigator = screen.getByTestId('motion-time-navigator')
    expect(navigator).toHaveAttribute('data-start-frame', '30')
    expect(navigator).toHaveAttribute('data-end-frame', '90')

    const ruler = document.querySelector<HTMLElement>('[data-motion-ruler-surface]')!
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue(rect(300, 28))
    frames.callbacks.length = 0

    await fireEvent.pointerDown(ruler, { pointerId: 41, button: 0, clientX: 300 })
    for (let frame = 1; frame <= 40 && frames.callbacks.length > 0; frame += 1) {
      frames.run(frame * 16)
      expect(Number(navigator.dataset.endFrame)).toBeLessThanOrEqual(120)
    }
    expect(navigator).toHaveAttribute('data-start-frame', '60')
    expect(navigator).toHaveAttribute('data-end-frame', '120')
    expect(frames.callbacks).toHaveLength(0)

    // More pointer movement while still held at the edge cannot accumulate an
    // out-of-bounds viewport or leave a stale animation frame running.
    await fireEvent.pointerMove(ruler, { pointerId: 41, buttons: 1, clientX: 300 })
    expect(frames.callbacks).toHaveLength(1)
    frames.run(800)
    expect(navigator).toHaveAttribute('data-start-frame', '60')
    expect(navigator).toHaveAttribute('data-end-frame', '120')
    expect(frames.callbacks).toHaveLength(0)

    await fireEvent.pointerUp(ruler, { pointerId: 41, clientX: 300 })
    expect(navigator).toHaveAttribute('data-start-frame', '60')
    expect(navigator).toHaveAttribute('data-end-frame', '120')
  })

  it('clamps repeated left-edge auto-pan to composition frame zero', async () => {
    useItemsStore.getState().setItems([{ ...shape, durationInFrames: 240 }])
    setInPoint(30)
    setOutPoint(90)
    const frames = mockAnimationFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)

    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom To Fit' }))
    const navigator = screen.getByTestId('motion-time-navigator')
    const ruler = document.querySelector<HTMLElement>('[data-motion-ruler-surface]')!
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue(rect(300, 28))
    frames.callbacks.length = 0

    await fireEvent.pointerDown(ruler, { pointerId: 42, button: 0, clientX: 0 })
    for (let frame = 1; frame <= 40 && frames.callbacks.length > 0; frame += 1) {
      frames.run(frame * 16)
      expect(Number(navigator.dataset.startFrame)).toBeGreaterThanOrEqual(0)
    }
    expect(navigator).toHaveAttribute('data-start-frame', '0')
    expect(navigator).toHaveAttribute('data-end-frame', '60')
    expect(frames.callbacks).toHaveLength(0)

    await fireEvent.pointerMove(ruler, { pointerId: 42, buttons: 1, clientX: 0 })
    frames.run(800)
    expect(navigator).toHaveAttribute('data-start-frame', '0')
    expect(navigator).toHaveAttribute('data-end-frame', '60')
    expect(frames.callbacks).toHaveLength(0)

    await fireEvent.pointerUp(ruler, { pointerId: 42, clientX: 0 })
    expect(navigator).toHaveAttribute('data-start-frame', '0')
    expect(navigator).toHaveAttribute('data-end-frame', '60')
  })

  it('keeps ctrl-wheel zoom while ordinary wheel pans only the time viewport', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    frames.callbacks.length = 0

    expect(screen.getByTestId('motion-time-navigator')).toHaveAttribute('data-start-frame', '0')
    expect(screen.getByTestId('motion-time-navigator')).toHaveAttribute('data-end-frame', '120')
    const firstRulerTick = screen.getByText('0.0s').parentElement!
    const firstRulerTickLeft = firstRulerTick.style.left
    const staticGridTicks = Array.from(
      document.querySelectorAll<HTMLElement>('[data-motion-static-x]'),
    )
    const staticGridTickPositions = staticGridTicks.map((tick) => tick.style.left)
    const dynamicGrids = Array.from(
      document.querySelectorAll<HTMLElement>('[data-motion-grid-frames]'),
    )
    expect(staticGridTicks.length).toBeGreaterThan(0)
    expect(dynamicGrids.length).toBeGreaterThan(0)
    expect(
      dynamicGrids.every(
        (grid) =>
          grid.closest<HTMLElement>('[data-motion-viewport-surface]')?.dataset
            .motionViewportEdgeInset === '9' &&
          Number(
            grid.closest<HTMLElement>('[data-motion-viewport-surface]')?.dataset
              .motionViewportAxisWidth,
          ) > 0,
      ),
    ).toBe(true)
    expect(screen.getByText('4.0s')).toBeInTheDocument()

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    expect(frames.callbacks).toHaveLength(1)
    frames.run()

    expect(screen.getByText('0.3s')).toBeInTheDocument()
    expect(screen.getByText('3.5s')).toBeInTheDocument()
    expect(screen.queryByText('4.0s')).not.toBeInTheDocument()
    expect(screen.getByText('0.3s').parentElement).toBe(firstRulerTick)
    expect(firstRulerTick.style.left).toBe(firstRulerTickLeft)
    expect(staticGridTicks.map((tick) => tick.style.left)).toEqual(staticGridTickPositions)

    const panEvent = createEvent.wheel(scrollArea, { clientX: 750, deltaY: 100, cancelable: true })
    scrollArea.scrollTop = 40
    await fireEvent(scrollArea, panEvent)

    expect(panEvent.defaultPrevented).toBe(true)
    expect(scrollArea.scrollTop).toBe(40)
    expect(frames.callbacks).toHaveLength(1)
    frames.run()
    expect(Number(screen.getByTestId('motion-time-navigator').dataset.startFrame)).toBeGreaterThan(
      8,
    )
    expect(scrollArea).toHaveClass('overflow-y-auto')
  })

  it('consumes ordinary wheel in the layer column without vertical scrolling or duplicate panning', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    const leakedWheel = vi.fn()
    document.addEventListener('wheel', leakedWheel)
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    frames.run()
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')

    scrollArea.scrollTop = 40
    const ordinaryEvent = createEvent.wheel(scrollArea, {
      clientX: 100,
      deltaY: 100,
      cancelable: true,
    })
    await fireEvent(scrollArea, ordinaryEvent)

    expect(ordinaryEvent.defaultPrevented).toBe(true)
    expect(scrollArea.scrollTop).toBe(40)
    expect(frames.callbacks).toHaveLength(0)
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')
    expect(leakedWheel).not.toHaveBeenCalled()

    const verticalEvent = createEvent.wheel(scrollArea, {
      altKey: true,
      clientX: 100,
      deltaY: 25,
      cancelable: true,
    })
    await fireEvent(scrollArea, verticalEvent)

    expect(verticalEvent.defaultPrevented).toBe(true)
    expect(scrollArea.scrollTop).toBe(65)
    expect(frames.callbacks).toHaveLength(0)
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')
    expect(leakedWheel).not.toHaveBeenCalled()
    document.removeEventListener('wheel', leakedWheel)
  })

  it('fits the Motion timeline from the compact control after a wheel zoom', async () => {
    const frames = mockAnimationFrames()
    const settle = mockSettleTimers()
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    frames.run()
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')

    await fireEvent.click(screen.getByRole('button', { name: 'Zoom To Fit' }))
    expect(navigator).toHaveAttribute('data-start-frame', '0')
    expect(navigator).toHaveAttribute('data-end-frame', '120')

    settle.run()
    expect(navigator).toHaveAttribute('data-start-frame', '0')
    expect(navigator).toHaveAttribute('data-end-frame', '120')
  })

  it('flushes the final wheel geometry when settle wins before the queued animation frame', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    const settle = mockSettleTimers()
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })

    expect(frames.callbacks).toHaveLength(1)
    expect(settle.callbacks).toHaveLength(1)
    expect(navigator).toHaveAttribute('data-start-frame', '0')
    settle.run()
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')
  })

  it('keeps the final ruler preview when navigator resize commits', async () => {
    const frames = mockAnimationFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)

    render(CompositingTimeline)
    const navigator = screen.getByTestId('motion-time-navigator')
    const rulerSurface = screen.getByText('0.0s').parentElement!.parentElement!
    const originalTicks = Array.from(rulerSurface.children)
    const originalTickPositions = originalTicks.map((tick) => (tick as HTMLElement).style.left)
    frames.callbacks.length = 0

    await fireEvent.mouseDown(screen.getByTestId('keyframe-navigator-right-handle'), {
      clientX: 1000,
    })
    await fireEvent.mouseMove(window, { clientX: 800 })
    expect(frames.callbacks).toHaveLength(1)
    frames.run()

    const rulerLabels = () =>
      Array.from(
        rulerSurface.querySelectorAll<HTMLElement>('[data-motion-ruler-label-index]'),
        (label) => label.textContent,
      )
    const previewEndFrame = navigator.dataset.endFrame
    const previewLabels = rulerLabels()
    expect(previewEndFrame).not.toBe('120')

    await fireEvent.mouseUp(window)

    expect(navigator).toHaveAttribute('data-end-frame', previewEndFrame)
    expect(rulerLabels()).toEqual(previewLabels)
    expect(Array.from(rulerSurface.children)).toEqual(originalTicks)
    expect(Array.from(rulerSurface.children, (tick) => (tick as HTMLElement).style.left)).toEqual(
      originalTickPositions,
    )
  })

  it('uses the Edit-style vertical wheel delta for ordinary mixed-axis time panning', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    frames.run()
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')

    const wheelEvent = createEvent.wheel(scrollArea, {
      clientX: 750,
      deltaX: -1,
      deltaY: 25,
      cancelable: true,
    })
    await fireEvent(scrollArea, wheelEvent)

    expect(wheelEvent.defaultPrevented).toBe(true)
    expect(frames.callbacks).toHaveLength(1)
    frames.run()
    expect(Number(navigator.dataset.startFrame)).toBeGreaterThan(14)
    expect(Number(navigator.dataset.startFrame)).toBeLessThan(15)
    expect(Number(navigator.dataset.endFrame) - Number(navigator.dataset.startFrame)).toBeCloseTo(
      96,
    )
  })

  it('reserves Alt/Option-wheel for deliberate vertical layer scrolling', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    frames.run()
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')

    scrollArea.scrollTop = 40
    const verticalEvent = createEvent.wheel(scrollArea, {
      altKey: true,
      clientX: 750,
      deltaX: -1,
      deltaY: 25,
      cancelable: true,
    })
    await fireEvent(scrollArea, verticalEvent)

    expect(verticalEvent.defaultPrevented).toBe(true)
    expect(scrollArea.scrollTop).toBe(65)
    expect(frames.callbacks).toHaveLength(0)
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')
  })

  it('keeps Shift-wheel on the time axis instead of claiming vertical scrolling', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    frames.run()
    scrollArea.scrollTop = 40

    const shiftEvent = createEvent.wheel(scrollArea, {
      shiftKey: true,
      clientX: 750,
      deltaY: 25,
      cancelable: true,
    })
    await fireEvent(scrollArea, shiftEvent)

    expect(shiftEvent.defaultPrevented).toBe(true)
    expect(scrollArea.scrollTop).toBe(40)
    expect(frames.callbacks).toHaveLength(1)
    frames.run()
    expect(Number(navigator.dataset.startFrame)).toBeGreaterThan(8)
  })

  it('keeps zoomed mouse-wheel pan preview and navigator settle geometry identical', async () => {
    const frames = mockAnimationFrames()
    const settle = mockSettleTimers()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    const thumb = screen.getByTestId('keyframe-navigator-thumb')
    const segment = screen.getByTestId(`motion-layer-span-${shape.id}`)
    const dynamicGrid = document.querySelector<HTMLElement>('[data-motion-grid-frames]')
    expect(segment.closest<HTMLElement>('[data-motion-viewport-surface]')).not.toBeNull()
    expect(dynamicGrid).not.toBeNull()
    const resolveSegmentPixels = (value: string) =>
      value.endsWith('%') ? (Number.parseFloat(value) / 100) * 1000 : Number.parseFloat(value)
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    frames.run()
    const zoomPreviewStart = navigator.dataset.startFrame
    const zoomPreviewEnd = navigator.dataset.endFrame
    const zoomPreviewThumbLeft = thumb.style.left
    const zoomPreviewSegmentLeft = resolveSegmentPixels(segment.style.left)
    const zoomPreviewSegmentWidth = resolveSegmentPixels(segment.style.width)
    const zoomPreviewGridLeft = dynamicGrid!.style.left
    const zoomPreviewGridShadows = dynamicGrid!.style.boxShadow
    const zoomPreviewGridFrames = dynamicGrid!.dataset.motionGridFrames
    settle.runLast()
    expect(navigator).toHaveAttribute('data-start-frame', zoomPreviewStart)
    expect(navigator).toHaveAttribute('data-end-frame', zoomPreviewEnd)
    expect(thumb.style.left).toBe(zoomPreviewThumbLeft)
    expect(resolveSegmentPixels(segment.style.left)).toBeCloseTo(zoomPreviewSegmentLeft, 5)
    expect(resolveSegmentPixels(segment.style.width)).toBeCloseTo(zoomPreviewSegmentWidth, 5)
    expect(dynamicGrid!.style.left).toBe(zoomPreviewGridLeft)
    expect(dynamicGrid!.style.boxShadow).toBe(zoomPreviewGridShadows)
    expect(dynamicGrid!.dataset.motionGridFrames).toBe(zoomPreviewGridFrames)
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')
    const zoomedThumbLeft = thumb.style.left

    const mousePan = createEvent.wheel(scrollArea, { clientX: 750, deltaY: 7, cancelable: true })
    await fireEvent(scrollArea, mousePan)
    expect(mousePan.defaultPrevented).toBe(true)
    expect(frames.callbacks).toHaveLength(1)
    frames.run()

    const previewStart = navigator.dataset.startFrame
    const previewEnd = navigator.dataset.endFrame
    const previewThumbLeft = thumb.style.left
    const previewSegmentLeft = resolveSegmentPixels(segment.style.left)
    const previewSegmentWidth = resolveSegmentPixels(segment.style.width)
    expect(Number(previewStart)).toBeGreaterThan(8)
    expect(Number(previewStart)).not.toBe(Math.round(Number(previewStart)))
    expect(previewThumbLeft).not.toBe(zoomedThumbLeft)
    expect(previewSegmentLeft).toBeCloseTo((-Number(previewStart) / 96) * 1000, 5)
    expect(previewSegmentWidth).toBeCloseTo((shape.durationInFrames / 96) * 1000, 5)
    expect(segment).toHaveAttribute('data-from-frame', String(shape.from))
    expect(segment).toHaveAttribute('data-to-frame', String(shape.from + shape.durationInFrames))

    settle.runLast()
    expect(navigator).toHaveAttribute('data-start-frame', previewStart)
    expect(navigator).toHaveAttribute('data-end-frame', previewEnd)
    expect(thumb.style.left).toBe(previewThumbLeft)
    expect(resolveSegmentPixels(segment.style.left)).toBeCloseTo(previewSegmentLeft, 5)
    expect(resolveSegmentPixels(segment.style.width)).toBeCloseTo(previewSegmentWidth, 5)
  })

  it('keeps Motion I/O live and identical through zoom and pan settle', async () => {
    useItemsStore.getState().setItems([{ ...shape, durationInFrames: 240 }])
    setInPoint(30)
    setOutPoint(90)
    const frames = mockAnimationFrames()
    const settle = mockSettleTimers()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)

    render(CompositingTimeline)

    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const ioStrip = screen.getByTestId('motion-io-strip')
    const ioIn = screen.getByTestId('motion-io-in-handle').parentElement as HTMLElement
    const ioOut = screen.getByTestId('motion-io-out-handle').parentElement as HTMLElement
    const resolvePixels = (value: string) =>
      value.endsWith('%') ? (Number.parseFloat(value) / 100) * 1000 : Number.parseFloat(value)
    // jsdom drops the strip's inline style (see the I/O lane test above); the
    // handles carry the same live geometry.
    const captureRegionGeometry = () => ({
      inLeft: resolvePixels(ioIn.style.left),
      outLeft: resolvePixels(ioOut.style.left),
    })
    const expectRegionGeometry = (expected: ReturnType<typeof captureRegionGeometry>) => {
      const settled = captureRegionGeometry()
      for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
        expect(settled[key]).toBeCloseTo(expected[key], 5)
      }
    }
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    expect(settle.callbacks.length).toBeGreaterThan(0)
    expect(ioStrip).toHaveAttribute('data-from-frame', '30')
    expect(ioStrip).toHaveAttribute('data-to-frame', '90')
    frames.run()
    // These are imperative animation-frame writes: the 100ms settle has not
    // run, yet the real ruler DOM already moved into the live pixel geometry.
    expect(ioIn.style.left).toMatch(/px$/)
    expect(ioOut.style.left).toMatch(/px$/)
    const zoomPreview = captureRegionGeometry()

    settle.runLast()
    expectRegionGeometry(zoomPreview)

    const panEvent = createEvent.wheel(scrollArea, { clientX: 750, deltaY: 7, cancelable: true })
    await fireEvent(scrollArea, panEvent)
    expect(panEvent.defaultPrevented).toBe(true)
    frames.run()
    const panPreview = captureRegionGeometry()
    expect(panPreview.inLeft).not.toBeCloseTo(zoomPreview.inLeft, 5)

    settle.runLast()
    expectRegionGeometry(panPreview)
  })

  it('caps responsive Motion zoom at one rendered keyframe-diamond width per frame', async () => {
    const frames = mockAnimationFrames()
    let rectRight = 1000
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockImplementation(() => rect(rectRight, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    const zoomIn = () =>
      fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: rectRight - 100, deltaY: -100 })
    const expectDiamondCap = () => {
      const visibleFrames =
        Number(navigator.dataset.endFrame) - Number(navigator.dataset.startFrame)
      const usableWidth = rectRight - 620 - KEYFRAME_EDGE_INSET * 2
      expect(visibleFrames).toBe(Math.ceil(usableWidth / KEYFRAME_DIAMOND_RENDERED_WIDTH_PX))
      expect(usableWidth / visibleFrames).toBeLessThanOrEqual(KEYFRAME_DIAMOND_RENDERED_WIDTH_PX)
    }
    frames.callbacks.length = 0

    for (let index = 0; index < 20; index += 1) await zoomIn()
    expect(frames.callbacks).toHaveLength(1)
    frames.run()
    expectDiamondCap()

    rectRight = 800
    for (let index = 0; index < 10; index += 1) await zoomIn()
    frames.run()
    expectDiamondCap()

    rectRight = 1000
    await zoomIn()
    frames.run()
    expectDiamondCap()
  })

  it('keeps the playhead frame axis through the rendered keyframe diamond center at max zoom', async () => {
    const keyframeId = useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 60, 100)
    usePlaybackStore.getState().setCurrentFrame(60)
    const frames = mockAnimationFrames()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const playhead = screen.getByTestId('motion-playhead')
    const diamondButton = document.querySelector<HTMLElement>(
      `[data-motion-keyframe-id="${keyframeId}"]`,
    )
    expect(diamondButton).not.toBeNull()
    const diamond = diamondButton!.firstElementChild as HTMLElement
    const diamondSurface = diamondButton!.closest<HTMLElement>('[data-motion-viewport-surface]')
    const frameAxisWidth = Number(diamondSurface?.dataset.motionViewportAxisWidth)
    expect(frameAxisWidth).toBeGreaterThan(KEYFRAME_EDGE_INSET * 2)
    Object.defineProperty(playhead.parentElement!, 'clientWidth', {
      configurable: true,
      value: frameAxisWidth - KEYFRAME_EDGE_INSET * 2,
    })
    frames.callbacks.length = 0

    for (let index = 0; index < 20; index += 1) {
      await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 810, deltaY: -100 })
    }
    frames.run()

    const playheadTransformX = Number.parseFloat(
      playhead.style.transform.match(/translate3d\(([-\d.]+)px/)?.[1] ?? 'NaN',
    )
    const diamondCenterX = Number.parseFloat(diamondButton!.style.left)
    expect(diamond.style.width).toBe('8px')
    expect(diamond.style.height).toBe('8px')
    expect(KEYFRAME_DIAMOND_RENDERED_WIDTH_PX).toBeCloseTo(Math.sqrt(128))
    expect(KEYFRAME_EDGE_INSET + playheadTransformX).toBeCloseTo(diamondCenterX, 5)
  })

  it('excludes the native vertical scrollbar from zoom and playhead axis geometry', async () => {
    const frames = mockAnimationFrames()
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.testid === 'motion-layer-scroll-area' ? 1000 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset.testid === 'motion-layer-scroll-area' ? 988 : 0
    })
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const playheadSurface = screen.getByTestId('motion-playhead').parentElement!
    expect(playheadSurface.style.right).toBe(`${KEYFRAME_EDGE_INSET + 12}px`)
    frames.callbacks.length = 0

    const navigator = screen.getByTestId('motion-time-navigator')
    for (let index = 0; index < 20; index += 1) {
      await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 800, deltaY: -100 })
    }
    frames.run()
    const visibleFrames = Number(navigator.dataset.endFrame) - Number(navigator.dataset.startFrame)
    const usableAxisWidth = 988 - 620 - KEYFRAME_EDGE_INSET * 2
    expect(visibleFrames).toBe(Math.ceil(usableAxisWidth / KEYFRAME_DIAMOND_RENDERED_WIDTH_PX))
  })

  it('locks dominant horizontal trackpad input to one stable viewport update per frame', async () => {
    const frames = mockAnimationFrames()
    const settle = mockSettleTimers()
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    frames.callbacks.length = 0

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    expect(frames.callbacks).toHaveLength(1)
    frames.run()
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')

    const horizontalEvents = [1, -12, 14, -16].map((deltaY) =>
      createEvent.wheel(scrollArea, { clientX: 750, deltaX: 10, deltaY, cancelable: true }),
    )
    for (const event of horizontalEvents) await fireEvent(scrollArea, event)

    expect(horizontalEvents.every((event) => event.defaultPrevented)).toBe(true)
    expect(frames.callbacks).toHaveLength(1)
    expect(navigator).toHaveAttribute('data-start-frame', '8')

    frames.run()
    expect(Number(navigator.dataset.startFrame)).toBeGreaterThan(18)
    expect(Number(navigator.dataset.endFrame) - Number(navigator.dataset.startFrame)).toBeCloseTo(
      96,
    )
    const settledStart = navigator.dataset.startFrame
    const settledEnd = navigator.dataset.endFrame
    settle.runLast()
    expect(navigator).toHaveAttribute('data-start-frame', settledStart)
    expect(navigator).toHaveAttribute('data-end-frame', settledEnd)
  })

  it('accumulates rapid mouse-wheel zoom around the cursor without treating horizontal input as zoom', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    frames.callbacks.length = 0

    scrollArea.dispatchEvent(
      createEvent.wheel(scrollArea, {
        ctrlKey: true,
        clientX: 750,
        deltaY: -100,
        cancelable: true,
      }),
    )
    scrollArea.dispatchEvent(
      createEvent.wheel(scrollArea, {
        ctrlKey: true,
        clientX: 750,
        deltaY: -100,
        cancelable: true,
      }),
    )
    flushSync()

    expect(frames.callbacks).toHaveLength(1)
    frames.run()
    expect(navigator).toHaveAttribute('data-start-frame', '15')
    expect(navigator).toHaveAttribute('data-end-frame', '92')

    const horizontalEvent = createEvent.wheel(scrollArea, {
      ctrlKey: true,
      clientX: 750,
      deltaX: 100,
      deltaY: 0,
      cancelable: true,
    })
    await fireEvent(scrollArea, horizontalEvent)

    expect(horizontalEvent.defaultPrevented).toBe(true)
    expect(navigator).toHaveAttribute('data-start-frame', '15')
    expect(navigator).toHaveAttribute('data-end-frame', '92')
  })

  it('handles ctrl-wheel zoom after the app-level browser zoom guard prevents the event', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))
    const navigator = screen.getByTestId('motion-time-navigator')
    const guardedEvent = createEvent.wheel(scrollArea, {
      ctrlKey: true,
      clientX: 750,
      deltaY: -100,
      cancelable: true,
    })
    frames.callbacks.length = 0

    // The app prevents native browser zoom during document capture before the
    // Motion timeline receives this same event.
    guardedEvent.preventDefault()
    await fireEvent(scrollArea, guardedEvent)
    frames.run()

    expect(guardedEvent.defaultPrevented).toBe(true)
    expect(navigator).toHaveAttribute('data-start-frame', '8')
    expect(navigator).toHaveAttribute('data-end-frame', '104')
  })

  it('keeps the Motion layer header and expands classic dope-sheet child rows', async () => {
    render(CompositingTimeline)

    expect(screen.getByTestId('compositing-timeline')).toBeInTheDocument()
    expect(screen.getByText('Parent')).toBeInTheDocument()
    expect(
      within(screen.getByTestId(`motion-parent-cell-${shape.id}`)).getByRole('combobox', {
        name: 'Parent for Hero rectangle',
      }),
    ).toHaveTextContent('None')
    expect(screen.getAllByText('Hero rectangle')).toHaveLength(2)

    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    const embeddedEditor = within(screen.getByTestId(`motion-layer-row-${shape.id}`)).getByTestId(
      'dopesheet-editor-root',
    )
    expect(embeddedEditor).toHaveStyle({ width: '100%' })
    expect(embeddedEditor).toHaveAttribute('data-motion-shared-grid-divisions', '10')
    const embeddedGrid = embeddedEditor.querySelector<HTMLElement>('[data-motion-grid-frames]')
    const embeddedGridFrames = (embeddedGrid?.dataset.motionGridFrames ?? '').split(',').map(Number)
    expect(embeddedGridFrames).toHaveLength(11)
    expect(embeddedGridFrames[0]).toBe(0)
    expect(embeddedGridFrames.at(-1)).toBe(120)
    expect(embeddedGridFrames[1]! - embeddedGridFrames[0]!).toBe(12)
    expect(embeddedGrid?.style.left).toBe('-1px')
    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.getByText('Opacity')).toBeInTheDocument()
    expect(screen.getByLabelText('Position X')).toHaveValue('100.00')
    expect(screen.getByLabelText('Position Y')).toHaveValue('80.00')
    const positionInputs = screen
      .getByLabelText('Position X')
      .closest('[data-testid="compound-property-inputs"]')
    expect(positionInputs).not.toBeNull()
    expect(within(positionInputs as HTMLElement).queryByText('X')).not.toBeInTheDocument()
    expect(within(positionInputs as HTMLElement).queryByText('Y')).not.toBeInTheDocument()
    const scaleInputs = screen
      .getByLabelText('Scale X')
      .closest('[data-testid="compound-property-inputs"]')
    expect(scaleInputs).not.toBeNull()
    expect(within(scaleInputs as HTMLElement).queryByText('X')).not.toBeInTheDocument()
    expect(within(scaleInputs as HTMLElement).queryByText('Y')).not.toBeInTheDocument()
    expect(screen.queryByText('X Position')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transform options' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Separate Position dimensions' }),
    ).not.toBeInTheDocument()
  })

  it('mounts heavy Motion dope-sheet content only for expanded rows near the viewport', async () => {
    const second = secondLayer(1, 'Second rectangle')
    const secondShape: ShapeItem = { ...second.shape, transform: { ...shape.transform, x: 600 } }
    useItemsStore.getState().setTracks([track, second.track])
    useItemsStore.getState().setItems([shape, secondShape])
    useComposeUiStore.getState().setAllLayersExpanded('comp-1', [shape.id, secondShape.id], true)

    const observed: Array<{
      callback: IntersectionObserverCallback
      observer: IntersectionObserver
      target: Element
    }> = []
    class MockIntersectionObserver {
      readonly root = null
      readonly rootMargin = '160px 0px'
      readonly thresholds = [0]
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe = (target: Element) => {
        observed.push({
          callback: this.callback,
          observer: this as unknown as IntersectionObserver,
          target,
        })
      }
      disconnect = vi.fn()
      unobserve = vi.fn()
      takeRecords = () => []
    }
    vi.stubGlobal(
      'IntersectionObserver',
      MockIntersectionObserver as unknown as typeof IntersectionObserver,
    )
    const settle = mockSettleTimers()
    const intersect = (isIntersecting: boolean) => {
      const entry = observed.find((candidate) => candidate.target === firstShell)
      entry?.callback(
        [{ isIntersecting, target: firstShell } as unknown as IntersectionObserverEntry],
        entry.observer,
      )
      flushSync()
    }

    render(CompositingTimeline)

    const firstShell = screen.getByTestId(`motion-dopesheet-shell-${shape.id}`)
    const secondShell = screen.getByTestId(`motion-dopesheet-shell-${secondShape.id}`)
    expect(firstShell).toHaveAttribute('data-motion-dopesheet-near-viewport', 'false')
    expect(secondShell).toHaveAttribute('data-motion-dopesheet-near-viewport', 'false')
    expect(screen.queryByTestId('dopesheet-editor-root')).not.toBeInTheDocument()
    expect(observed.find((entry) => entry.target === firstShell)).toBeDefined()

    intersect(true)

    expect(firstShell).toHaveAttribute('data-motion-dopesheet-near-viewport', 'true')
    expect(within(firstShell).getByTestId('dopesheet-editor-root')).toBeInTheDocument()
    expect(within(secondShell).queryByTestId('dopesheet-editor-root')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('dopesheet-editor-root')).toHaveLength(1)
    const navigator = screen.getByTestId('motion-time-navigator')
    const initialEndFrame = Number(navigator.dataset.endFrame)
    const nearGrid = firstShell.querySelector<HTMLElement>('[data-motion-grid-frames]')
    expect(nearGrid).not.toBeNull()
    const initialGridFrames = nearGrid?.dataset.motionGridFrames
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(rect(1000, 400))

    await fireEvent.wheel(scrollArea, { ctrlKey: true, clientX: 750, deltaY: -100 })
    settle.run()

    expect(Number(navigator.dataset.endFrame)).toBeLessThan(initialEndFrame)
    expect(within(firstShell).getByTestId('dopesheet-editor-root')).toBeInTheDocument()
    expect(within(secondShell).queryByTestId('dopesheet-editor-root')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('dopesheet-editor-root')).toHaveLength(1)
    expect(nearGrid?.dataset.motionGridFrames).not.toBe(initialGridFrames)

    const expandedShellHeight = Number.parseFloat(firstShell.style.height)
    await fireEvent.click(within(firstShell).getByRole('button', { name: 'Collapse Transform' }))
    const collapsedShellHeight = Number.parseFloat(firstShell.style.height)
    expect(collapsedShellHeight).toBeLessThan(expandedShellHeight)
    const collapsedPropertyControl = within(firstShell).getByRole('button', {
      name: 'Expand Transform',
    })
    collapsedPropertyControl.focus()
    intersect(false)
    expect(within(firstShell).getByTestId('dopesheet-editor-root')).toBeInTheDocument()

    const externalControl = screen.getByRole('button', { name: 'New composition' })
    await fireEvent.focusOut(collapsedPropertyControl, { relatedTarget: externalControl })
    expect(firstShell).toHaveAttribute('data-motion-dopesheet-near-viewport', 'false')
    expect(within(firstShell).queryByTestId('dopesheet-editor-root')).not.toBeInTheDocument()
    expect(Number.parseFloat(firstShell.style.height)).toBe(collapsedShellHeight)

    intersect(true)
    expect(within(firstShell).getByTestId('dopesheet-editor-root')).toBeInTheDocument()
    expect(within(firstShell).getByRole('button', { name: 'Expand Transform' })).toBeInTheDocument()
    expect(Number.parseFloat(firstShell.style.height)).toBe(collapsedShellHeight)
  })

  it('toggles Position between coupled and separated dimensions through history', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    await openTransformOptions()
    const separateDimensions = await screen.findByRole('menuitemcheckbox', {
      name: 'Separate Position dimensions',
    })
    expect(separateDimensions).toHaveAttribute('aria-checked', 'false')
    await fireEvent.click(separateDimensions)

    expect(
      useKeyframesStore.getState().keyframesByItemId[shape.id]?.separatedVectorProperties,
    ).toEqual(['position'])
    expect(screen.getByText('X Position')).toBeInTheDocument()
    expect(screen.getByText('Y Position')).toBeInTheDocument()
    await openTransformOptions()
    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Separate Position dimensions' }),
    ).toHaveAttribute('aria-checked', 'true')
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    useTimelineCommandStore.getState().undo()
    flushSync()

    expect(useKeyframesStore.getState().keyframesByItemId[shape.id]).toBeUndefined()
    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.queryByText('X Position')).not.toBeInTheDocument()
  })

  it('combines matching legacy X/Y keys into one Position lane', async () => {
    useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 0, 100)
    useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 30, 200)
    useKeyframesStore.getState()._addKeyframe(shape.id, 'y', 0, 80)
    useKeyframesStore.getState()._addKeyframe(shape.id, 'y', 30, 180)
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    await openTransformOptions()
    const separateDimensions = await screen.findByRole('menuitemcheckbox', {
      name: 'Separate Position dimensions',
    })
    expect(separateDimensions).toHaveAttribute('aria-checked', 'true')
    await fireEvent.click(separateDimensions)

    const itemKeyframes = useKeyframesStore.getState().keyframesByItemId[shape.id]
    expect(itemKeyframes?.properties.some((property) => property.property === 'x')).toBe(false)
    expect(itemKeyframes?.properties.some((property) => property.property === 'y')).toBe(false)
    expect(
      itemKeyframes?.vectorProperties?.find((property) => property.property === 'position')
        ?.keyframes,
    ).toEqual([
      expect.objectContaining({ frame: 0, value: { x: 100, y: 80 } }),
      expect.objectContaining({ frame: 30, value: { x: 200, y: 180 } }),
    ])
    expect(screen.getByLabelText('Position X')).toBeInTheDocument()
    expect(screen.queryByText('X Position')).not.toBeInTheDocument()
  })

  it('shows generated motion on the parent span and its driven child properties', async () => {
    useItemsStore.getState().setItems([
      {
        ...shape,
        from: 15,
        durationInFrames: 60,
        motionModifiers: [
          {
            id: 'drift-1',
            type: 'float-drift',
            enabled: true,
            amplitude: 1,
            frequency: 0.6,
            phaseFrames: 0,
            seed: 1,
          },
        ],
      },
    ])

    render(CompositingTimeline)

    expect(screen.getByTestId(`motion-procedural-badge-${shape.id}`)).toHaveTextContent('ƒx')
    expect(screen.queryByTestId(`motion-procedural-summary-${shape.id}`)).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    expect(screen.getByTestId('procedural-band-x')).toHaveAttribute('data-from-frame', '15')
    expect(screen.getByTestId('procedural-band-x')).toHaveAttribute('data-to-frame', '74')
    expect(screen.queryByTestId('procedural-band-y')).not.toBeInTheDocument()
    expect(screen.getByTestId('procedural-band-rotation')).toBeInTheDocument()
  })

  it('shows procedural text-motion slots on collapsed and expanded text layers', async () => {
    useItemsStore.getState().setItems([
      {
        ...shape,
        type: 'text',
        text: 'New Motion Editor',
        color: '#ffffff',
        from: 18,
        durationInFrames: 69,
        textMotion: {
          in: {
            presetId: 'blur-in',
            durationFrames: 14,
            staggerFrames: 3,
            intensity: 1,
            order: 'forward',
            easing: 'ease-out',
            seed: 0,
            unit: 'word',
          },
          out: {
            presetId: 'sink',
            durationFrames: 14,
            staggerFrames: 4,
            intensity: 1,
            order: 'forward',
            easing: 'ease-in',
            seed: 0,
            unit: 'word',
          },
        },
      } as TimelineItem,
    ])

    render(CompositingTimeline)

    expect(screen.getByTestId(`motion-procedural-badge-${shape.id}`)).toHaveTextContent('ƒx')
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    expect(screen.getByTestId('motion-text-procedural-lanes')).toBeInTheDocument()
    expect(screen.getByTestId('motion-text-procedural-band-in')).toHaveAttribute(
      'data-from-frame',
      '18',
    )
    expect(screen.getByTestId('motion-text-procedural-band-out')).toHaveAttribute(
      'data-to-frame',
      '87',
    )

    const inBand = screen.getByTestId('motion-text-procedural-band-in')
    expect(inBand).toHaveClass('h-4')
    expect(inBand.parentElement?.parentElement).toHaveClass('h-7')
    useSelectionStore.getState().clearSelection()
    useEditorStore.getState().setRightSidebarOpen(false)
    useEditorStore.getState().setClipInspectorTab('video')
    await fireEvent.click(inBand)
    expect(useSelectionStore.getState().selectedItemIds).toEqual([shape.id])
    expect(useEditorStore.getState().rightSidebarOpen).toBe(true)
    expect(useEditorStore.getState().clipInspectorTab).toBe('audio')

    vi.spyOn(inBand.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(300, 24))
    await fireEvent.pointerDown(inBand, { pointerId: 21, button: 0, clientX: 100 })
    await fireEvent.pointerMove(inBand, { pointerId: 21, buttons: 1, clientX: 130 })

    expect(inBand).toHaveAttribute(
      'title',
      expect.stringContaining('drag to change duration · 26f'),
    )
    const duringDrag = useItemsStore.getState().itemById[shape.id]
    expect(duringDrag?.type === 'text' ? duringDrag.textMotion?.in?.durationFrames : null).toBe(14)

    await fireEvent.pointerCancel(inBand, { pointerId: 21, clientX: 130 })

    expect(inBand).toHaveAttribute('title', expect.stringContaining('14f'))
    const afterCancel = useItemsStore.getState().itemById[shape.id]
    expect(afterCancel?.type === 'text' ? afterCancel.textMotion?.in?.durationFrames : null).toBe(
      14,
    )
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(0)

    await fireEvent.pointerDown(inBand, { pointerId: 22, button: 0, clientX: 100 })
    await fireEvent.pointerMove(inBand, { pointerId: 22, buttons: 1, clientX: 130 })
    await fireEvent.pointerUp(inBand, { pointerId: 22, clientX: 130 })

    const updated = useItemsStore.getState().itemById[shape.id]
    expect(updated?.type === 'text' ? updated.textMotion?.in?.durationFrames : null).toBe(26)
  })

  it('keeps expanded property editors render-idle until a scrub settles', async () => {
    useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 0, 100)
    useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 60, 300)
    const frames = mockAnimationFrames()

    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    const input = screen.getByRole('spinbutton', { name: 'X Position value at playhead' })
    const ruler = screen.getByText('0.0s').parentElement!.parentElement!
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue(rect(300, 28))
    frames.callbacks.length = 0

    await fireEvent.pointerDown(ruler, { pointerId: 3, button: 0, clientX: 0 })
    await fireEvent.pointerMove(ruler, { pointerId: 3, buttons: 1, clientX: 150 })
    frames.run()

    expect(usePlaybackStore.getState().previewFrame).toBe(60)
    expect(input).toHaveValue(100)

    await fireEvent.pointerUp(ruler, { pointerId: 3, clientX: 150 })
    expect(input).toHaveValue(300)
  })

  it('adds an undoable property keyframe at the shared playhead', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    await fireEvent.click(
      screen.getByRole('button', { name: /toggle position keyframe at playhead/i }),
    )

    const itemKeyframes = useKeyframesStore.getState().keyframesByItemId[shape.id]
    expect(itemKeyframes?.properties).toEqual([])
    expect(itemKeyframes?.vectorProperties?.[0]?.keyframes).toEqual([
      expect.objectContaining({ frame: 0, value: { x: 100, y: 80 } }),
    ])

    useTimelineCommandStore.getState().undo()
    expect(useKeyframesStore.getState().keyframesByItemId[shape.id]).toBeUndefined()
  })

  it('authors linked Scale axes together and can explicitly unlink them', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    const scaleX = screen.getByLabelText('Scale X')
    await fireEvent.change(scaleX, { target: { value: '125' } })
    await fireEvent.keyDown(scaleX, { key: 'Enter' })

    expect(scaleKeyframeValue()).toEqual({ x: 125, y: 125 })

    await fireEvent.click(screen.getByRole('button', { name: 'Unlink Scale axes' }))
    expect(useItemsStore.getState().itemById[shape.id]?.transform?.aspectRatioLocked).toBe(false)
  })

  it('previews and commits linked Scale Y while scrubbing Scale X', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    const scaleX = screen.getByLabelText('Scale X')
    const scaleY = screen.getByLabelText('Scale Y')
    await fireEvent.pointerDown(scaleX, { button: 0, pointerId: 21, clientX: 100 })
    await fireEvent.pointerMove(scaleX, { pointerId: 21, clientX: 200 })
    frames.runAll()

    expect(scaleX).toHaveValue('101.00')
    expect(scaleY).toHaveValue('101.00')
    expect(useGizmoStore.getState().preview?.[shape.id]?.transform).toMatchObject({
      width: 404,
      height: 222.2,
    })

    await fireEvent.pointerUp(scaleX, { pointerId: 21, clientX: 200 })
    expect(scaleX).toHaveValue('101.00')
    expect(scaleY).toHaveValue('101.00')
    expect(scaleKeyframeValue()).toEqual({ x: 101, y: 101 })
  })

  it('previews and commits linked Scale X while scrubbing Scale Y', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    const scaleX = screen.getByLabelText('Scale X')
    const scaleY = screen.getByLabelText('Scale Y')
    await fireEvent.pointerDown(scaleY, { button: 0, pointerId: 22, clientX: 100 })
    await fireEvent.pointerMove(scaleY, { pointerId: 22, clientX: 200 })
    frames.runAll()

    expect(scaleX).toHaveValue('101.00')
    expect(scaleY).toHaveValue('101.00')

    await fireEvent.pointerUp(scaleY, { pointerId: 22, clientX: 200 })
    expect(scaleX).toHaveValue('101.00')
    expect(scaleY).toHaveValue('101.00')
    expect(scaleKeyframeValue()).toEqual({ x: 101, y: 101 })
  })

  it('keeps the companion Scale axis unchanged while scrubbing unlinked axes', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Unlink Scale axes' }))

    const scaleX = screen.getByLabelText('Scale X')
    const scaleY = screen.getByLabelText('Scale Y')
    await fireEvent.pointerDown(scaleX, { button: 0, pointerId: 23, clientX: 100 })
    await fireEvent.pointerMove(scaleX, { pointerId: 23, clientX: 200 })
    frames.runAll()

    expect(scaleX).toHaveValue('101.00')
    expect(scaleY).toHaveValue('100.00')

    await fireEvent.pointerUp(scaleX, { pointerId: 23, clientX: 200 })
    expect(scaleX).toHaveValue('101.00')
    expect(scaleY).toHaveValue('100.00')
    expect(scaleKeyframeValue()).toEqual({ x: 101, y: 100 })
  })

  it('shows one ruler range and batch-retimes selected keyframes across layers', async () => {
    const second = secondLayer()
    useItemsStore.getState().setTracks([track, second.track])
    useItemsStore.getState().setItems([shape, second.shape])
    const firstId = useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 10, 100)
    const secondId = useKeyframesStore.getState()._addKeyframe(second.shape.id, 'x', 80, 300)
    useKeyframeSelectionStore.getState().selectKeyframes([
      { itemId: shape.id, property: 'x', keyframeId: firstId },
      { itemId: second.shape.id, property: 'x', keyframeId: secondId },
    ])
    const frames = mockAnimationFrames()
    const firstFrame = () =>
      useKeyframesStore.getState().keyframesByItemId[shape.id]?.properties[0]?.keyframes[0]?.frame
    const secondFrame = () =>
      useKeyframesStore.getState().keyframesByItemId[second.shape.id]?.properties[0]?.keyframes[0]
        ?.frame

    render(CompositingTimeline)

    const range = screen.getByTestId('motion-selection-retime-range')
    expect(screen.getByTestId('motion-ruler-viewport')).toHaveClass(
      'overflow-x-clip',
      'overflow-y-visible',
    )
    expect(screen.getByTestId('motion-ruler-viewport')).not.toHaveClass('overflow-hidden')
    expect(range).toHaveAttribute('title', expect.stringContaining('across 2 layers'))
    const startHandle = screen.getByRole('slider', { name: 'Retime selected keyframes start' })
    vi.spyOn(range.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(1000, 28))
    frames.callbacks.length = 0

    const initialRangeLeft = range.style.left
    await fireEvent.pointerDown(startHandle, { pointerId: 9, clientX: 100 })
    await fireEvent.pointerMove(startHandle, { pointerId: 9, clientX: 200 })

    expect(firstFrame()).toBe(10)
    frames.runAll(16)
    expect(firstFrame()).toBe(10)
    expect(range.style.left).not.toBe(initialRangeLeft)

    await fireEvent.pointerUp(startHandle, { pointerId: 9, clientX: 200 })

    expect(firstFrame()).toBe(22)
    expect(secondFrame()).toBe(80)

    useTimelineCommandStore.getState().undo()
    flushSync()
    expect(firstFrame()).toBe(10)
    expect(secondFrame()).toBe(80)

    const restoredRangeLeft = range.style.left
    await fireEvent.pointerDown(startHandle, { pointerId: 10, clientX: 100 })
    await fireEvent.pointerMove(startHandle, { pointerId: 10, clientX: 150 })
    frames.runAll(32)
    expect(range.style.left).not.toBe(restoredRangeLeft)
    await fireEvent.pointerCancel(startHandle, { pointerId: 10, clientX: 150 })
    expect(range.style.left).toBe(restoredRangeLeft)
    expect(firstFrame()).toBe(10)

    await fireEvent.keyDown(screen.getByRole('slider', { name: 'Retime selected keyframes end' }), {
      key: 'ArrowRight',
    })
    expect(secondFrame()).toBe(81)
    useTimelineCommandStore.getState().undo()
    expect(secondFrame()).toBe(80)
  })

  it('previews connector geometry while ruler handles retime selected keyframes', async () => {
    const firstId = useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 10, 100)
    const secondId = useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 80, 300)
    useKeyframeSelectionStore.getState().selectKeyframes([
      { itemId: shape.id, property: 'x', keyframeId: firstId },
      { itemId: shape.id, property: 'x', keyframeId: secondId },
    ])
    const frames = mockAnimationFrames()

    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    const connector = screen.getByTestId('keyframe-connector')
    expect(connector).toHaveAttribute('data-motion-connector-from-keyframe-id', firstId)
    expect(connector).toHaveAttribute('data-motion-connector-to-keyframe-id', secondId)
    const initialLeft = connector.style.left
    const initialWidth = connector.style.width
    const range = screen.getByTestId('motion-selection-retime-range')
    vi.spyOn(range.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(1000, 28))
    const startHandle = screen.getByRole('slider', { name: 'Retime selected keyframes start' })
    frames.callbacks.length = 0

    await fireEvent.pointerDown(startHandle, { pointerId: 11, clientX: 100 })
    await fireEvent.pointerMove(startHandle, { pointerId: 11, clientX: 200 })
    frames.runAll(16)

    expect(connector.style.left).not.toBe(initialLeft)
    expect(connector.style.width).not.toBe(initialWidth)
    expect(
      useKeyframesStore.getState().keyframesByItemId[shape.id]?.properties[0]?.keyframes[0]?.frame,
    ).toBe(10)

    await fireEvent.pointerCancel(startHandle, { pointerId: 11, clientX: 200 })
    expect(connector.style.left).toBe(initialLeft)
    expect(connector.style.width).toBe(initialWidth)
  })

  it('shows Transform as a collapsible sibling property group', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    const editor = within(screen.getByTestId(`motion-layer-row-${shape.id}`)).getByTestId(
      'dopesheet-editor-root',
    )
    const expandedHeight = Number.parseFloat(editor.style.height)
    const transformHeader = screen.getByRole('button', { name: /collapse transform/i })
    expect(screen.getByRole('button', { name: /collapse shape/i })).toBeInTheDocument()

    await fireEvent.click(transformHeader)
    expect(screen.queryByRole('spinbutton', { name: /x position value at playhead/i })).toBeNull()
    expect(screen.getByRole('button', { name: /collapse shape/i })).toBeInTheDocument()
    expect(Number.parseFloat(editor.style.height)).toBeLessThan(expandedHeight)

    await fireEvent.click(screen.getByRole('button', { name: /expand transform/i }))
    expect(Number.parseFloat(editor.style.height)).toBe(expandedHeight)
  })

  it('does not create a Vector2 keyframe when a changed axis is blurred', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    const input = screen.getByLabelText('Position X')
    input.focus()
    await fireEvent.change(input, { target: { value: '140' } })
    input.blur()
    await fireEvent.blur(input)

    expect(useKeyframesStore.getState().keyframesByItemId[shape.id]).toBeUndefined()
    expect(input).toHaveValue('100.00')
  })

  it('previews Motion Position scrubs once per animation frame and commits on release', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    frames.callbacks.length = 0

    const input = screen.getByLabelText('Position X')
    await fireEvent.pointerDown(input, { button: 0, pointerId: 17, clientX: 100 })
    await fireEvent.pointerMove(input, { pointerId: 17, clientX: 150 })
    await fireEvent.pointerMove(input, { pointerId: 17, clientX: 200 })

    expect(useGizmoStore.getState().preview?.[shape.id]).toBeUndefined()
    expect(useKeyframesStore.getState().keyframesByItemId[shape.id]).toBeUndefined()
    expect(frames.callbacks).toHaveLength(1)

    frames.run(16)
    expect(useGizmoStore.getState().preview?.[shape.id]?.transform).toMatchObject({ x: 101, y: 80 })
    expect(useKeyframesStore.getState().keyframesByItemId[shape.id]).toBeUndefined()

    await fireEvent.pointerUp(input, { pointerId: 17, clientX: 200 })
    expect(useGizmoStore.getState().preview?.[shape.id]).toBeUndefined()
    expect(
      useKeyframesStore.getState().keyframesByItemId[shape.id]?.vectorProperties?.[0]?.keyframes[0]
        ?.value,
    ).toEqual({
      x: 101,
      y: 80,
    })
  })

  it('mirrors a canvas gizmo drag into Motion Position before release once per frame', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    const input = screen.getByLabelText('Position X')
    expect(input).toHaveValue('100.00')
    frames.callbacks.length = 0

    const gizmo = useGizmoStore.getState()
    gizmo.setSnappingEnabled(false)
    const interactionId = gizmo.startTranslate(
      shape.id,
      { x: 0, y: 0 },
      { x: 100, y: 80, width: 400, height: 220, rotation: 0, opacity: 1 },
    )
    gizmo.updateInteraction({ x: 20, y: 0 }, false)
    gizmo.updateInteraction({ x: 60, y: 0 }, false)
    flushSync()

    expect(input).toHaveValue('100.00')
    expect(useItemsStore.getState().itemById[shape.id]?.transform?.x).toBe(100)
    expect(frames.callbacks).toHaveLength(1)

    frames.run(16)
    expect(input).toHaveValue('160.00')
    expect(useItemsStore.getState().itemById[shape.id]?.transform?.x).toBe(100)

    useGizmoStore.getState().clearInteraction(interactionId)
    flushSync()
    frames.run(32)
    expect(input).toHaveValue('160.00')
    expect(useGizmoStore.getState().presentationHandoff?.finalTransform.x).toBe(160)

    useGizmoStore.getState().cancelInteraction()
    flushSync()
    frames.run(48)
    expect(input).toHaveValue('100.00')
  })

  it('converts a parented gizmo world preview back to the child Position inputs', async () => {
    const parentTrack = makeTimelineTrack({
      id: 'parent-track',
      name: 'Parent',
      kind: 'video',
      order: 1,
    })
    const parent: ControllerItem = {
      id: 'parent-1',
      type: 'controller',
      controllerKind: 'null',
      trackId: parentTrack.id,
      from: 0,
      durationInFrames: 120,
      label: 'Parent',
      transform: { x: 50, y: 0, width: 100, height: 100, rotation: 0 },
    }
    const child: ShapeItem = {
      ...shape,
      transformParent: {
        parentItemId: parent.id,
        parentReference: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
        childLocalReference: { x: 100, y: 80, width: 400, height: 220, rotation: 0 },
        childWorldReference: { x: 100, y: 80, width: 400, height: 220, rotation: 0 },
      },
    }
    useItemsStore.getState().setTracks([track, parentTrack])
    useItemsStore.getState().setItems([child, parent])
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const childRow = screen.getByTestId(`motion-layer-row-${child.id}`)
    await fireEvent.click(within(childRow).getByRole('button', { name: 'Expand layer properties' }))

    const input = within(childRow).getByLabelText('Position X')
    expect(input).toHaveValue('100.00')
    frames.callbacks.length = 0

    const gizmo = useGizmoStore.getState()
    gizmo.setSnappingEnabled(false)
    gizmo.startTranslate(
      child.id,
      { x: 0, y: 0 },
      { x: 150, y: 80, width: 400, height: 220, rotation: 0, opacity: 1 },
    )
    gizmo.updateInteraction({ x: 20, y: 0 }, false)
    flushSync()
    frames.run(16)

    expect(input).toHaveValue('120.00')

    useGizmoStore.getState().cancelInteraction()
    flushSync()
    frames.runAll(32)
  })

  it('keeps expanded property editors off the playback-frame render path', async () => {
    useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 0, 100)
    useKeyframesStore.getState()._addKeyframe(shape.id, 'x', 60, 300)
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))

    const input = screen.getByRole('spinbutton', { name: 'X Position value at playhead' })
    expect(input).toHaveValue(100)

    usePlaybackStore.getState().play()
    usePlaybackStore.getState().setCurrentFrame(60)
    flushSync()
    expect(input).toHaveValue(100)

    usePlaybackStore.getState().pause()
    flushSync()
    expect(input).toHaveValue(300)
  })

  it('edits a selected keyframe before creating one at the playhead', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    await fireEvent.click(
      screen.getByRole('button', { name: /toggle position keyframe at playhead/i }),
    )

    const positionKeyframes = () =>
      useKeyframesStore.getState().keyframesByItemId[shape.id]!.vectorProperties![0]!.keyframes
    const firstKeyframe = positionKeyframes()[0]!
    useKeyframesStore.getState()._upsertVectorKeyframe(shape.id, 'position', {
      frame: 60,
      value: { x: 300, y: 180 },
      easing: 'linear',
    })
    useKeyframeSelectionStore
      .getState()
      .selectKeyframes([{ itemId: shape.id, property: 'x', keyframeId: firstKeyframe.id }])
    usePlaybackStore.getState().setCurrentFrame(60)
    flushSync()

    let input = screen.getByLabelText('Position X')
    expect(input).toHaveValue('100.00')
    input.focus()
    await fireEvent.change(input, { target: { value: '180' } })
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(positionKeyframes()).toEqual([
      expect.objectContaining({ frame: 0, value: { x: 180, y: 80 } }),
      expect.objectContaining({ frame: 60, value: { x: 300, y: 180 } }),
    ])

    useKeyframeSelectionStore.getState().clearSelection()
    usePlaybackStore.getState().setCurrentFrame(90)
    flushSync()
    input = screen.getByLabelText('Position X')
    input.focus()
    await fireEvent.change(input, { target: { value: '220' } })
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(positionKeyframes()).toEqual([
      expect.objectContaining({ frame: 0, value: { x: 180, y: 80 } }),
      expect.objectContaining({ frame: 60, value: { x: 300, y: 180 } }),
      expect.objectContaining({ frame: 90, value: expect.objectContaining({ x: 220 }) }),
    ])
  })

  it('deletes selected diamonds without deleting the selected layer', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    await fireEvent.click(
      screen.getByRole('button', { name: /toggle position keyframe at playhead/i }),
    )

    const keyframe =
      useKeyframesStore.getState().keyframesByItemId[shape.id]!.vectorProperties![0]!.keyframes[0]!
    useKeyframeSelectionStore
      .getState()
      .selectKeyframes([{ itemId: shape.id, property: 'x', keyframeId: keyframe.id }])

    const marker = await screen.findByTestId(`row-keyframe-x-${keyframe.id}`)
    // pointerenter doesn't bubble: a browser fires it on every ancestor the
    // pointer enters (React emulated that from pointerover).
    for (let element: Element | null = marker; element; element = element.parentElement) {
      await fireEvent.pointerEnter(element)
    }
    expect(useEditorStore.getState().keyframeEditorShortcutScopeActive).toBe(true)
    await fireEvent.keyDown(marker, { key: 'Delete' })

    await waitFor(() => {
      expect(
        useKeyframesStore.getState().keyframesByItemId[shape.id]?.vectorProperties?.[0]
          ?.keyframes ?? [],
      ).toHaveLength(0)
    })
    expect(useItemsStore.getState().itemById[shape.id]).toBeDefined()
  })

  it('switches the whole right timeline pane to the selected property graph', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    expect(screen.getByTestId(`motion-layer-span-${shape.id}`)).toBeInTheDocument()

    expect(screen.getByText('Position').closest('.group')).toHaveClass('pl-9', 'before:left-3')
    expect(screen.getByTestId('motion-layer-scroll-area')).toHaveClass(
      'overflow-x-hidden',
      'overflow-y-auto',
    )
    expect(screen.getAllByTestId('compound-property-inputs')[0]).toHaveClass('w-[192px]')

    const curveButton = screen.getByRole('button', { name: /show position curve/i })
    expect(curveButton).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(curveButton)

    expect(screen.getByTestId('dopesheet-graph-pane')).toBeInTheDocument()
    // top = ruler height: tick labels (28) + the in/out render-range lane (12).
    expect(screen.getByTestId('motion-graph-pane')).toHaveStyle({ left: '621px', top: '40px' })
    expect(screen.getByTestId('motion-graph-pane')).toHaveClass('bottom-0', 'right-0')
    expect(screen.queryByTestId(`motion-layer-span-${shape.id}`)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show position curve/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByText('Motion curves')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /sheet/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /graph/i })).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('motion-graph-pane')).queryByRole('button', {
        name: /collapse transform/i,
      }),
    ).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: /show position curve/i }))
    expect(screen.queryByTestId('dopesheet-graph-pane')).not.toBeInTheDocument()
    expect(screen.queryByTestId('motion-graph-pane')).not.toBeInTheDocument()
    expect(screen.getByTestId(`motion-layer-span-${shape.id}`)).toBeInTheDocument()
  })

  it('filters expanded rows to animated properties and exposes classic segment easing', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    await fireEvent.click(
      screen.getByRole('button', { name: /toggle position keyframe at playhead/i }),
    )
    usePlaybackStore.getState().setCurrentFrame(60)
    flushSync()
    await fireEvent.click(
      await screen.findByRole('button', { name: /toggle position keyframe at playhead/i }),
    )

    const easingTriggers = await screen.findAllByRole('button', { name: 'Easing' })
    expect(easingTriggers.length).toBeGreaterThan(0)
    await fireEvent.click(easingTriggers[0]!)
    expect(await screen.findByText('Cubic Easing')).toBeInTheDocument()
    await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await chooseOption(
      screen.getByRole('combobox', { name: 'Property filter' }),
      'Animated properties',
    )
    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.queryByText('Y Position')).not.toBeInTheDocument()
  })

  it('hides the expanded child area when no properties are animated', async () => {
    render(CompositingTimeline)
    await fireEvent.click(screen.getByRole('button', { name: 'Expand layer properties' }))
    expect(screen.getByText('Position')).toBeInTheDocument()

    await chooseOption(
      screen.getByRole('combobox', { name: 'Property filter' }),
      'Animated properties',
    )

    expect(screen.queryByText('Position')).not.toBeInTheDocument()
    expect(screen.queryByText('No parameters match the current view')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Collapse layer properties' }),
    ).not.toBeInTheDocument()
  })

  it('pastes a copied layer onto a new track', async () => {
    render(CompositingTimeline)
    const layerName = screen.getByRole('button', { name: /1hero rectangle/i })
    const trackCountBefore = useItemsStore.getState().tracks.length

    await openContextMenu(layerName)
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy' }))
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Copy' })).toBeNull())
    await openContextMenu(layerName)
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Paste' }))

    const itemsState = useItemsStore.getState()
    expect(itemsState.items.filter((item) => item.id !== shape.id)).toHaveLength(1)
    expect(itemsState.tracks.length).toBeGreaterThan(trackCountBefore)
  })
})

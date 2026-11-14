// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
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
import type { AudioItem, ControllerItem, ShapeItem, VideoItem } from '@/types/timeline'
import { useComposeUiStore } from './compose-ui-store'
import { CompositingTimeline } from './compositing-timeline'

/*
 * Ported from FreeCut's compositing-timeline.test.tsx: the layer sheet, its spans,
 * trims, reorder, groups, context menu, parenting, ruler scrub, auto-pan, fit,
 * regions, I/O lane and drops. The React suite's tests of the embedded
 * dope-sheet (property inputs, keyframe diamonds, graph pane, retime range over
 * rendered diamonds, wheel zoom over its grids) and of edge auto-pan (painted
 * through the navigator thumb) exercise the keyframes feature's DopesheetEditor
 * and CompactNavigator, which port with that feature.
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

describe('CompositingTimeline', { timeout: 15_000 }, () => {
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

  it('shows generated motion as a badge on the layer span', () => {
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

  it('previews start and end trims on the span and cancels without committing', async () => {
    const frames = mockAnimationFrames()
    render(CompositingTimeline)
    const span = screen.getByTestId(`motion-layer-span-${shape.id}`)
    const lane = span.parentElement!
    const startHandle = screen.getByTestId(`motion-trim-start-${shape.id}`)
    const endHandle = screen.getByTestId(`motion-trim-end-${shape.id}`)
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
    await fireEvent.pointerCancel(startHandle, { pointerId: 11, clientX: 40 })
    expect(span.style.transform).toBe('')
    expect(span.style.width).toBe(initialWidth)
    expect(useItemsStore.getState().itemById[shape.id]).toMatchObject({
      from: 0,
      durationInFrames: 120,
    })

    await fireEvent.pointerDown(endHandle, { pointerId: 12, button: 0, clientX: 200 })
    await fireEvent.pointerMove(endHandle, { pointerId: 12, buttons: 1, clientX: 170 })
    frames.run()
    expect(span.style.transform).toBe('')
    expect(span.style.width).not.toBe(initialWidth)
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
    const frames = mockAnimationFrames()

    render(CompositingTimeline)
    const span = screen.getByTestId(`motion-group-span-${layerGroup.id}`)
    expect(span).toHaveClass('h-6')
    vi.spyOn(span.parentElement!, 'getBoundingClientRect').mockReturnValue(rect(300, 34))
    frames.callbacks.length = 0

    await fireEvent.pointerDown(span, { pointerId: 4, button: 0, clientX: 0 })
    await fireEvent.pointerMove(span, { pointerId: 4, buttons: 1, clientX: 10 })
    await fireEvent.pointerMove(span, { pointerId: 4, buttons: 1, clientX: 30 })
    expect(frames.callbacks).toHaveLength(1)
    frames.run()
    expect(useItemsStore.getState().itemById[shape.id]?.from).toBe(shape.from)
    expect(span.style.translate).toBe('')
    expect(span.style.transform).not.toBe('')
    await fireEvent.pointerUp(span, { pointerId: 4, clientX: 30 })
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
})

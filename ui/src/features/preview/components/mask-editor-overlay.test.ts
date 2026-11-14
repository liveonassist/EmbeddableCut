// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { act, fireEvent, render, waitFor } from '@testing-library/svelte'
import {
  useItemsStore,
  useKeyframesStore,
  useTimelineSettingsStore,
  useTransitionsStore,
} from '@/features/preview/deps/timeline-store'
import { setTimelineState } from '@/features/preview/deps/timeline-test-helpers-contract'
import { useMaskEditorStore } from '@/features/preview/stores/mask-editor-store'
import { useGizmoStore } from '@/features/preview/stores/gizmo-store'
import MaskEditorOverlay from './mask-editor-overlay.svelte'
import { useSelectionStore } from '@/shared/state/selection'
import { usePlaybackStore } from '@/shared/state/playback'
import type { CoordinateParams, Transform } from '@/features/preview/types/gizmo'
import type { ShapeItem } from '@/types/timeline'

const PROJECT_SIZE = { width: 200, height: 120 } as const
const PLAYER_SIZE = { width: 200, height: 120 } as const
let mockCanvasContext: {
  scale: ReturnType<typeof vi.fn>
  clearRect: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  rect: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  arc: ReturnType<typeof vi.fn>
  closePath: ReturnType<typeof vi.fn>
  bezierCurveTo: ReturnType<typeof vi.fn>
  quadraticCurveTo: ReturnType<typeof vi.fn>
  setLineDash: ReturnType<typeof vi.fn>
}

const FULL_CANVAS_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  width: PROJECT_SIZE.width,
  height: PROJECT_SIZE.height,
  rotation: 0,
  opacity: 1,
  cornerRadius: 0,
}

const PATH_ITEM_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  rotation: 0,
  opacity: 1,
  cornerRadius: 0,
}

function createRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: PLAYER_SIZE.width,
    bottom: PLAYER_SIZE.height,
    width: PLAYER_SIZE.width,
    height: PLAYER_SIZE.height,
    toJSON: () => ({}),
  } as DOMRect
}

function resetStores() {
  useMaskEditorStore.getState().stopEditing()
  useGizmoStore.getState().clearInteraction()
  useGizmoStore.getState().clearPreview()
  setTimelineState({ keyframes: [] })
  useTransitionsStore.getState().setTransitions([])
  useItemsStore.getState().setItems([])
  useItemsStore.getState().setTracks([
    {
      id: 'track-1',
      name: 'Track 1',
      height: 72,
      locked: false,
      visible: true,
      muted: false,
      solo: false,
      order: 0,
      items: [],
    },
  ])
  useTimelineSettingsStore.setState({
    fps: 30,
    scrollPosition: 0,
    snapEnabled: true,
    isDirty: false,
    isTimelineLoading: false,
  })
  usePlaybackStore.getState().setCurrentFrame(0)
  useSelectionStore.getState().clearSelection()
}

function createCoordParams(): CoordinateParams {
  return {
    containerRect: createRect(),
    playerSize: PLAYER_SIZE,
    projectSize: PROJECT_SIZE,
    zoom: 1,
  }
}

function renderMaskEditorOverlay(itemTransform: Transform = FULL_CANVAS_TRANSFORM) {
  const rendered = render(MaskEditorOverlay, {
    props: {
      coordParams: createCoordParams(),
      playerSize: PLAYER_SIZE,
      itemTransform: itemTransform,
    },
  })
  const { container } = rendered
  const canvas = container.querySelector('canvas')
  expect(canvas).toBeTruthy()
  vi.spyOn(canvas!, 'getBoundingClientRect').mockReturnValue(createRect())

  return { ...rendered, canvas: canvas! }
}

async function dragEditedPathPoint(itemTransform: Transform): Promise<ShapeItem | undefined> {
  useMaskEditorStore.getState().startEditing('path-1')

  const { canvas } = renderMaskEditorOverlay(itemTransform)

  await fireEvent.pointerDown(canvas, { clientX: 70, clientY: 30, pointerId: 1 })
  await fireEvent.pointerMove(canvas, { clientX: 82, clientY: 38, pointerId: 1 })
  await fireEvent.pointerUp(canvas, { clientX: 82, clientY: 38, pointerId: 1 })

  return useItemsStore.getState().items.find((item) => item.id === 'path-1') as
    | ShapeItem
    | undefined
}

async function clickCanvasPoint(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  pointerId: number,
) {
  await fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId })
  await fireEvent.pointerUp(canvas, { clientX: x, clientY: y, pointerId })
}

async function drawClosedRectanglePath() {
  const rendered = renderMaskEditorOverlay()

  await clickCanvasPoint(rendered.canvas, 20, 20, 1)
  await clickCanvasPoint(rendered.canvas, 120, 20, 2)
  await clickCanvasPoint(rendered.canvas, 120, 80, 3)
  await clickCanvasPoint(rendered.canvas, 20, 20, 4)

  await waitFor(() => {
    expect(useMaskEditorStore.getState().isEditing).toBe(false)
  })

  return rendered
}

function expectShapeOnActiveTrackAtPlayhead(
  shape: { trackId?: string; from?: number } | undefined,
  trackId: string | undefined,
) {
  expect(shape?.trackId).toBe(trackId)
  expect(shape?.from).toBe(120)
  expect(useSelectionStore.getState().activeTrackId).toBe(trackId ?? null)
}

describe('MaskEditorOverlay shape pen flow', () => {
  beforeAll(() => {
    ;(
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext') as unknown as {
        mockImplementation: (implementation: () => CanvasRenderingContext2D) => void
      }
    ).mockImplementation(() => {
      mockCanvasContext = {
        scale: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        rect: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        arc: vi.fn(),
        closePath: vi.fn(),
        bezierCurveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        setLineDash: vi.fn(),
      }
      return mockCanvasContext as unknown as CanvasRenderingContext2D
    })

    Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
  })

  beforeEach(() => {
    resetStores()
  })

  it('creates a shape path, fits bounds, selects it, and exits editing when closed', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()
    usePlaybackStore.getState().setCurrentFrame(48)
    flushSync()

    await drawClosedRectanglePath()

    const items = useItemsStore.getState().items
    expect(items).toHaveLength(1)

    const shape = items[0] as ShapeItem
    expect(shape?.type).toBe('shape')
    expect(shape?.shapeType).toBe('path')
    expect(shape?.pathClosed).toBe(true)
    expect(shape?.label).toBe('Path')
    expect(shape?.fillColor).toBe('#3b82f6')
    expect(shape?.isMask).toBe(false)
    expect(shape?.maskType).toBeUndefined()
    expect(shape?.from).toBe(48)
    expect(shape?.durationInFrames).toBe(150)
    expect(useSelectionStore.getState().selectedItemIds).toEqual([shape!.id])

    expect(shape?.transform?.width).toBeCloseTo(100)
    expect(shape?.transform?.height).toBeCloseTo(60)
    expect(shape?.transform?.x).toBeCloseTo(-30)
    expect(shape?.transform?.y).toBeCloseTo(-10)
    expect(shape?.pathVertices?.[0]?.position).toEqual([0, 0])
    expect(shape?.pathVertices?.[1]?.position).toEqual([1, 0])
    expect(shape?.pathVertices?.[2]?.position).toEqual([1, 1])
  })

  it('uses an existing top track before creating a new one', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()
    usePlaybackStore.getState().setCurrentFrame(120)
    flushSync()
    useSelectionStore.getState().setActiveTrack('track-2')
    flushSync()
    useItemsStore.getState().setTracks([
      {
        id: 'track-1',
        name: 'Track 1',
        height: 72,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
      {
        id: 'track-2',
        name: 'Track 2',
        height: 72,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 1,
        items: [],
      },
    ])
    flushSync()
    useItemsStore.getState().setItems([
      {
        id: 'busy-mask-track',
        type: 'shape',
        trackId: 'track-2',
        from: 100,
        durationInFrames: 120,
        label: 'Busy',
        shapeType: 'rectangle',
        fillColor: '#ffffff',
      },
    ])
    flushSync()

    await drawClosedRectanglePath()

    const shape = useItemsStore.getState().items.find((item) => item.id !== 'busy-mask-track')
    expect(shape?.trackId).toBe('track-1')
    expect(shape?.from).toBe(120)
    expect(useSelectionStore.getState().activeTrackId).toBe('track-1')
  })

  it('creates a new top track instead of placing the mask on a lower free track', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()
    usePlaybackStore.getState().setCurrentFrame(120)
    flushSync()
    useSelectionStore.getState().setActiveTrack('track-1')
    flushSync()
    useItemsStore.getState().setTracks([
      {
        id: 'track-1',
        name: 'Track 1',
        height: 72,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
      {
        id: 'track-2',
        name: 'Track 2',
        height: 72,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 1,
        items: [],
      },
    ])
    flushSync()
    useItemsStore.getState().setItems([
      {
        id: 'busy-mask-track',
        type: 'shape',
        trackId: 'track-1',
        from: 100,
        durationInFrames: 120,
        label: 'Busy',
        shapeType: 'rectangle',
        fillColor: '#ffffff',
      },
    ])
    flushSync()

    await drawClosedRectanglePath()

    const tracks = useItemsStore.getState().tracks
    expect(tracks).toHaveLength(3)

    const newTrack = tracks.find((track) => track.id !== 'track-1' && track.id !== 'track-2')
    const shape = useItemsStore.getState().items.find((item) => item.id !== 'busy-mask-track')

    expect(newTrack).toBeDefined()
    expect(newTrack?.name).toBe('Track 3')
    expect(newTrack?.order).toBeLessThan(0)
    expectShapeOnActiveTrackAtPlayhead(shape, newTrack?.id)
  })

  it('creates a video track when pen paths spill into a new classic track lane', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()
    usePlaybackStore.getState().setCurrentFrame(120)
    flushSync()
    useSelectionStore.getState().setActiveTrack('track-v1')
    flushSync()
    useItemsStore.getState().setTracks([
      {
        id: 'track-v1',
        name: 'V1',
        kind: 'video',
        height: 72,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
      {
        id: 'track-a1',
        name: 'A1',
        kind: 'audio',
        height: 72,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 1,
        items: [],
      },
    ])
    flushSync()
    useItemsStore.getState().setItems([
      {
        id: 'busy-video-track',
        type: 'shape',
        trackId: 'track-v1',
        from: 100,
        durationInFrames: 120,
        label: 'Busy',
        shapeType: 'rectangle',
        fillColor: '#ffffff',
      },
    ])
    flushSync()

    await drawClosedRectanglePath()

    const tracks = useItemsStore.getState().tracks
    const newTrack = tracks.find((track) => track.id !== 'track-v1' && track.id !== 'track-a1')
    const shape = useItemsStore.getState().items.find((item) => item.id !== 'busy-video-track') as
      | ShapeItem
      | undefined

    expect(newTrack).toBeDefined()
    expect(newTrack?.kind).toBe('video')
    expect(newTrack?.name).toBe('V2')
    expect(newTrack?.order).toBeLessThan(0)
    expect(shape?.isMask).toBe(false)
    expectShapeOnActiveTrackAtPlayhead(shape, newTrack?.id)
  })

  it('creates a new track to keep the mask at the playhead when all tracks are occupied', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()
    usePlaybackStore.getState().setCurrentFrame(120)
    flushSync()
    useSelectionStore.getState().setActiveTrack('track-1')
    flushSync()
    useItemsStore.getState().setTracks([
      {
        id: 'track-1',
        name: 'Track 1',
        height: 72,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
      {
        id: 'track-2',
        name: 'Track 2',
        height: 72,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 1,
        items: [],
      },
    ])
    flushSync()
    useItemsStore.getState().setItems([
      {
        id: 'busy-track-1',
        type: 'shape',
        trackId: 'track-1',
        from: 100,
        durationInFrames: 120,
        label: 'Busy 1',
        shapeType: 'rectangle',
        fillColor: '#ffffff',
      },
      {
        id: 'busy-track-2',
        type: 'shape',
        trackId: 'track-2',
        from: 110,
        durationInFrames: 120,
        label: 'Busy 2',
        shapeType: 'rectangle',
        fillColor: '#ffffff',
      },
    ])
    flushSync()

    await drawClosedRectanglePath()

    const tracks = useItemsStore.getState().tracks
    expect(tracks).toHaveLength(3)

    const newTrack = tracks.find((track) => track.id !== 'track-1' && track.id !== 'track-2')
    const shape = useItemsStore
      .getState()
      .items.find((item) => item.id !== 'busy-track-1' && item.id !== 'busy-track-2')

    expect(newTrack).toBeDefined()
    expect(newTrack?.name).toBe('Track 3')
    expectShapeOnActiveTrackAtPlayhead(shape, newTrack?.id)
  })

  it('closes and commits the path when the closing anchor is dragged to shape the bezier', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()

    const { canvas } = renderMaskEditorOverlay()

    await clickCanvasPoint(canvas, 20, 20, 1)
    await clickCanvasPoint(canvas, 120, 20, 2)
    await clickCanvasPoint(canvas, 120, 80, 3)

    await fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 4 })
    await fireEvent.pointerMove(canvas, { clientX: 5, clientY: 45, pointerId: 4 })
    await fireEvent.pointerUp(canvas, { clientX: 5, clientY: 45, pointerId: 4 })

    await waitFor(() => {
      expect(useMaskEditorStore.getState().isEditing).toBe(false)
    })

    const shape = useItemsStore.getState().items[0] as ShapeItem
    expect(shape?.type).toBe('shape')
    expect(shape?.shapeType).toBe('path')
    expect(shape?.pathVertices?.[0]?.inHandle[0]).not.toBeCloseTo(0)
    expect(shape?.pathVertices?.[0]?.inHandle[1]).not.toBeCloseTo(0)
    expect(shape?.pathVertices?.[0]?.outHandle[0]).not.toBeCloseTo(0)
    expect(shape?.pathVertices?.[0]?.outHandle[1]).not.toBeCloseTo(0)
  })

  it('does not turn a newly planted point into a bezier on tiny pointer movement', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()

    const { canvas } = renderMaskEditorOverlay()

    await fireEvent.pointerDown(canvas, { clientX: 40, clientY: 40, pointerId: 1 })
    await fireEvent.pointerMove(canvas, { clientX: 45, clientY: 44, pointerId: 1 })
    await fireEvent.pointerUp(canvas, { clientX: 45, clientY: 44, pointerId: 1 })

    const firstVertex = useMaskEditorStore.getState().penVertices[0]
    expect(firstVertex?.inHandle).toEqual([0, 0])
    expect(firstVertex?.outHandle).toEqual([0, 0])
  })

  it('finishes the pen path as an open, stroke-first shape from the preview toolbar', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()

    const { canvas } = renderMaskEditorOverlay()

    await clickCanvasPoint(canvas, 20, 20, 1)
    await clickCanvasPoint(canvas, 120, 20, 2)

    await act(() => {
      useMaskEditorStore.getState().requestFinishPenMode()
    })

    await waitFor(() => {
      expect(useMaskEditorStore.getState().isEditing).toBe(false)
    })

    const shape = useItemsStore.getState().items[0] as ShapeItem
    expect(shape?.type).toBe('shape')
    expect(shape?.shapeType).toBe('path')
    expect(shape?.isMask).toBe(false)
    expect(shape?.pathClosed).toBe(false)
    expect(shape?.fillEnabled).toBe(false)
    expect(shape?.strokeEnabled).toBe(true)
    expect(shape?.strokeLineCap).toBe('round')
    expect(shape?.strokeLineJoin).toBe('round')
  })

  it('renders the closing segment while dragging the final bezier', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()

    const { canvas } = renderMaskEditorOverlay()

    await clickCanvasPoint(canvas, 20, 20, 1)
    await clickCanvasPoint(canvas, 120, 20, 2)
    await clickCanvasPoint(canvas, 120, 80, 3)

    mockCanvasContext.bezierCurveTo.mockClear()

    await fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 4 })
    await fireEvent.pointerMove(canvas, { clientX: 5, clientY: 45, pointerId: 4 })

    await waitFor(() => {
      expect(
        mockCanvasContext.bezierCurveTo.mock.calls.some(
          (call) =>
            Math.abs(call[0] - 120) < 0.001 &&
            Math.abs(call[1] - 80) < 0.001 &&
            Math.abs(call[2] - 35) < 0.001 &&
            Math.abs(call[3] - -5) < 0.001 &&
            Math.abs(call[4] - 20) < 0.001 &&
            Math.abs(call[5] - 20) < 0.001,
        ),
      ).toBe(true)
    })
  })

  it('removes the last planted point with backspace and keeps pen mode active', async () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()

    const { canvas } = renderMaskEditorOverlay()

    await clickCanvasPoint(canvas, 20, 20, 1)
    await clickCanvasPoint(canvas, 120, 20, 2)
    await clickCanvasPoint(canvas, 120, 80, 3)

    await fireEvent.keyDown(window, { key: 'Backspace' })

    expect(useMaskEditorStore.getState().penMode).toBe(true)
    expect(useMaskEditorStore.getState().isEditing).toBe(true)
    expect(useMaskEditorStore.getState().penVertices).toHaveLength(2)

    await clickCanvasPoint(canvas, 60, 90, 4)
    await clickCanvasPoint(canvas, 20, 20, 5)

    await waitFor(() => {
      expect(useMaskEditorStore.getState().isEditing).toBe(false)
    })

    expect(useItemsStore.getState().items).toHaveLength(1)
  })

  it('swallows unrelated shortcuts while pen mode is active', () => {
    useMaskEditorStore.getState().startShapePenMode()
    flushSync()

    const coordParams: CoordinateParams = {
      containerRect: createRect(),
      playerSize: PLAYER_SIZE,
      projectSize: PROJECT_SIZE,
      zoom: 1,
    }

    render(MaskEditorOverlay, {
      props: {
        coordParams: coordParams,
        playerSize: PLAYER_SIZE,
        itemTransform: FULL_CANVAS_TRANSFORM,
      },
    })

    const bubbleListener = vi.fn()
    window.addEventListener('keydown', bubbleListener)

    try {
      const event = new KeyboardEvent('keydown', {
        key: 'v',
        bubbles: true,
        cancelable: true,
      })
      const dispatchResult = window.dispatchEvent(event)

      expect(dispatchResult).toBe(false)
      expect(bubbleListener).not.toHaveBeenCalled()
      expect(useMaskEditorStore.getState().penMode).toBe(true)
    } finally {
      window.removeEventListener('keydown', bubbleListener)
    }
  })
})

describe('MaskEditorOverlay edit mode', () => {
  beforeEach(() => {
    resetStores()
  })

  function seedEditablePath() {
    useItemsStore.getState().setItems([
      {
        id: 'path-1',
        type: 'shape',
        trackId: 'track-1',
        from: 0,
        durationInFrames: 90,
        label: 'Mask',
        shapeType: 'path',
        fillColor: '#ffffff',
        isMask: true,
        pathVertices: [
          { position: [0, 0], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [1, 0], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [1, 1], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [0, 1], inHandle: [0, 0], outHandle: [0, 0] },
        ],
        transform: { ...PATH_ITEM_TRANSFORM },
      },
    ])
    useMaskEditorStore.getState().startEditing('path-1')
  }

  it('shows a crosshair cursor when hovering a path point', async () => {
    seedEditablePath()

    const { canvas } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)

    await fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 })

    await waitFor(() => {
      expect(canvas.style.cursor).toBe('crosshair')
    })
  })

  it('shows a move cursor and insertion cue for editable path targets', async () => {
    seedEditablePath()

    const { canvas } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)

    mockCanvasContext.arc.mockClear()
    await fireEvent.pointerMove(canvas, { clientX: 100, clientY: 60, pointerId: 1 })

    await waitFor(() => {
      expect(canvas.style.cursor).toBe('move')
    })

    mockCanvasContext.arc.mockClear()
    await fireEvent.pointerMove(canvas, { clientX: 150, clientY: 60, pointerId: 1 })

    await waitFor(() => {
      expect(mockCanvasContext.arc.mock.calls.some((call) => Math.abs(call[2] - 4) < 0.1)).toBe(
        true,
      )
    })
    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('adds a point when double-clicking a path edge', async () => {
    seedEditablePath()

    const { canvas } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)

    await fireEvent.doubleClick(canvas, { clientX: 150, clientY: 60 })

    const updatedItem = useItemsStore.getState().items.find((item) => item.id === 'path-1') as
      | ShapeItem
      | undefined
    expect(updatedItem?.pathVertices).toHaveLength(5)
    expect(updatedItem?.pathVertices?.[2]?.position).toEqual([1, 0.5])
  })

  it('draws a visible selection ring for selected points', async () => {
    seedEditablePath()

    const coordParams: CoordinateParams = {
      containerRect: createRect(),
      playerSize: PLAYER_SIZE,
      projectSize: PROJECT_SIZE,
      zoom: 1,
    }

    render(MaskEditorOverlay, {
      props: {
        coordParams: coordParams,
        playerSize: PLAYER_SIZE,
        itemTransform: PATH_ITEM_TRANSFORM,
      },
    })

    mockCanvasContext.arc.mockClear()

    await act(() => {
      useMaskEditorStore.getState().selectVertex(1)
    })

    await waitFor(() => {
      expect(mockCanvasContext.arc.mock.calls.some((call) => Math.abs(call[2] - 8) < 0.1)).toBe(
        true,
      )
    })
  })

  it('box-selects multiple points and converts them together', async () => {
    seedEditablePath()

    const { canvas } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)

    mockCanvasContext.rect.mockClear()
    await fireEvent.pointerDown(canvas, { clientX: 40, clientY: 20, pointerId: 1 })
    await fireEvent.pointerMove(canvas, { clientX: 160, clientY: 100, pointerId: 1 })

    await waitFor(() => {
      expect(useMaskEditorStore.getState().selectedVertexIndices).toEqual([0, 1, 2, 3])
      expect(mockCanvasContext.rect).toHaveBeenCalled()
    })

    await fireEvent.pointerUp(canvas, { clientX: 160, clientY: 100, pointerId: 1 })

    await act(() => {
      useMaskEditorStore.getState().requestConvertSelectedVertex('bezier')
    })

    await waitFor(() => {
      const updatedItem = useItemsStore.getState().items.find((item) => item.id === 'path-1') as
        | ShapeItem
        | undefined
      expect(updatedItem?.pathVertices).toBeTruthy()
      expect(
        updatedItem?.pathVertices?.every(
          (vertex) =>
            Math.hypot(vertex.inHandle[0], vertex.inHandle[1]) > 0.01 &&
            Math.hypot(vertex.outHandle[0], vertex.outHandle[1]) > 0.01,
        ),
      ).toBe(true)
    })
  })

  it('converts the selected point to a bezier knot when requested', async () => {
    seedEditablePath()

    const coordParams: CoordinateParams = {
      containerRect: createRect(),
      playerSize: PLAYER_SIZE,
      projectSize: PROJECT_SIZE,
      zoom: 1,
    }

    render(MaskEditorOverlay, {
      props: {
        coordParams: coordParams,
        playerSize: PLAYER_SIZE,
        itemTransform: PATH_ITEM_TRANSFORM,
      },
    })

    await act(() => {
      useMaskEditorStore.getState().selectVertex(1)
      useMaskEditorStore.getState().requestConvertSelectedVertex('bezier')
    })

    await waitFor(() => {
      const updatedItem = useItemsStore.getState().items.find((item) => item.id === 'path-1') as
        | ShapeItem
        | undefined
      const convertedVertex = updatedItem?.pathVertices?.[1]
      expect(convertedVertex).toBeTruthy()
      expect(
        Math.hypot(convertedVertex!.inHandle[0], convertedVertex!.inHandle[1]),
      ).toBeGreaterThan(0.01)
      expect(
        Math.hypot(convertedVertex!.outHandle[0], convertedVertex!.outHandle[1]),
      ).toBeGreaterThan(0.01)
      expect(useMaskEditorStore.getState().selectedVertexIndex).toBe(1)
    })
  })

  it('converts the selected point to a corner knot when requested', async () => {
    useItemsStore.getState().setItems([
      {
        id: 'path-1',
        type: 'shape',
        trackId: 'track-1',
        from: 0,
        durationInFrames: 90,
        label: 'Mask',
        shapeType: 'path',
        fillColor: '#ffffff',
        isMask: true,
        pathVertices: [
          { position: [0, 0], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [1, 0], inHandle: [-0.2, 0], outHandle: [-0.15, 0.2] },
          { position: [1, 1], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [0, 1], inHandle: [0, 0], outHandle: [0, 0] },
        ],
        transform: { ...PATH_ITEM_TRANSFORM },
      },
    ])
    flushSync()
    useMaskEditorStore.getState().startEditing('path-1')
    flushSync()

    const coordParams: CoordinateParams = {
      containerRect: createRect(),
      playerSize: PLAYER_SIZE,
      projectSize: PROJECT_SIZE,
      zoom: 1,
    }

    render(MaskEditorOverlay, {
      props: {
        coordParams: coordParams,
        playerSize: PLAYER_SIZE,
        itemTransform: PATH_ITEM_TRANSFORM,
      },
    })

    await act(() => {
      useMaskEditorStore.getState().selectVertex(1)
      useMaskEditorStore.getState().requestConvertSelectedVertex('corner')
    })

    await waitFor(() => {
      const updatedItem = useItemsStore.getState().items.find((item) => item.id === 'path-1') as
        | ShapeItem
        | undefined
      expect(updatedItem?.pathVertices?.[1]?.inHandle).toEqual([0, 0])
      expect(updatedItem?.pathVertices?.[1]?.outHandle).toEqual([0, 0])
    })
  })

  it('moves the whole path when dragging inside the shape body', async () => {
    seedEditablePath()

    const { canvas } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)

    await act(() => {
      useMaskEditorStore.getState().selectVertices([0, 1, 2, 3], 3)
    })

    await fireEvent.pointerDown(canvas, { clientX: 100, clientY: 60, pointerId: 1 })
    await fireEvent.pointerMove(canvas, { clientX: 120, clientY: 75, pointerId: 1 })

    const itemDuringDrag = useItemsStore.getState().items.find((item) => item.id === 'path-1')
    expect(itemDuringDrag?.transform?.x).toBe(0)
    expect(itemDuringDrag?.transform?.y).toBe(0)
    expect(useMaskEditorStore.getState().selectedVertexIndices).toEqual([0, 1, 2, 3])
    expect(useGizmoStore.getState().activeGizmo?.itemId).toBe('path-1')
    expect(useGizmoStore.getState().previewTransform?.x).toBeCloseTo(20)
    expect(useGizmoStore.getState().previewTransform?.y).toBeCloseTo(15)

    await fireEvent.pointerUp(canvas, { clientX: 120, clientY: 75, pointerId: 1 })

    const movedItem = useItemsStore.getState().items.find((item) => item.id === 'path-1') as
      | ShapeItem
      | undefined
    expect(movedItem?.transform?.x).toBeCloseTo(20)
    expect(movedItem?.transform?.y).toBeCloseTo(15)
    expect(movedItem?.pathVertices).toEqual([
      { position: [0, 0], inHandle: [0, 0], outHandle: [0, 0], tangentMode: 'corner' },
      { position: [1, 0], inHandle: [0, 0], outHandle: [0, 0], tangentMode: 'corner' },
      { position: [1, 1], inHandle: [0, 0], outHandle: [0, 0], tangentMode: 'corner' },
      { position: [0, 1], inHandle: [0, 0], outHandle: [0, 0], tangentMode: 'corner' },
    ])
    expect(useMaskEditorStore.getState().selectedVertexIndices).toEqual([0, 1, 2, 3])
  })

  it('updates current-frame transform keyframes instead of baking animated bounds into the base mask transform', async () => {
    const animatedTransform: Transform = {
      x: 30,
      y: 10,
      width: 120,
      height: 80,
      rotation: 0,
      opacity: 1,
      cornerRadius: 0,
    }

    useItemsStore.getState().setItems([
      {
        id: 'path-1',
        type: 'shape',
        trackId: 'track-1',
        from: 0,
        durationInFrames: 90,
        label: 'Mask',
        shapeType: 'path',
        fillColor: '#ffffff',
        isMask: true,
        pathVertices: [
          { position: [0, 0], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [1, 0.5], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [0.25, 1], inHandle: [0, 0], outHandle: [0, 0] },
        ],
        transform: {
          x: 10,
          y: 5,
          width: 100,
          height: 60,
          rotation: 0,
          opacity: 1,
          cornerRadius: 0,
        },
      },
    ])
    flushSync()
    setTimelineState({
      keyframes: [
        {
          itemId: 'path-1',
          properties: [
            { property: 'x', keyframes: [{ id: 'x-kf', frame: 15, value: 30, easing: 'linear' }] },
            { property: 'y', keyframes: [{ id: 'y-kf', frame: 15, value: 10, easing: 'linear' }] },
            {
              property: 'width',
              keyframes: [{ id: 'width-kf', frame: 15, value: 120, easing: 'linear' }],
            },
            {
              property: 'height',
              keyframes: [{ id: 'height-kf', frame: 15, value: 80, easing: 'linear' }],
            },
          ],
        },
      ],
    })
    flushSync()
    usePlaybackStore.getState().setCurrentFrame(15)
    flushSync()
    const updatedItem = await dragEditedPathPoint(animatedTransform)
    expect(updatedItem?.transform?.x).toBeCloseTo(10)
    expect(updatedItem?.transform?.y).toBeCloseTo(5)
    expect(updatedItem?.transform?.width).toBeCloseTo(100)
    expect(updatedItem?.transform?.height).toBeCloseTo(60)

    const updatedKeyframes = useKeyframesStore
      .getState()
      .keyframes.find((entry) => entry.itemId === 'path-1')
    const xKeyframe = updatedKeyframes?.properties.find((property) => property.property === 'x')
      ?.keyframes[0]
    const yKeyframe = updatedKeyframes?.properties.find((property) => property.property === 'y')
      ?.keyframes[0]
    const widthKeyframe = updatedKeyframes?.properties.find(
      (property) => property.property === 'width',
    )?.keyframes[0]
    const heightKeyframe = updatedKeyframes?.properties.find(
      (property) => property.property === 'height',
    )?.keyframes[0]

    expect(xKeyframe?.value).toBeCloseTo(36)
    expect(yKeyframe?.value).toBeCloseTo(14)
    expect(widthKeyframe?.value).toBeCloseTo(108)
    expect(heightKeyframe?.value).toBeCloseTo(72)
  })

  it('adds current-frame transform keyframes for animated mask point edits between existing keys', async () => {
    const animatedTransform: Transform = {
      x: 30,
      y: 10,
      width: 120,
      height: 80,
      rotation: 0,
      opacity: 1,
      cornerRadius: 0,
    }

    useItemsStore.getState().setItems([
      {
        id: 'path-1',
        type: 'shape',
        trackId: 'track-1',
        from: 0,
        durationInFrames: 90,
        label: 'Mask',
        shapeType: 'path',
        fillColor: '#ffffff',
        isMask: true,
        pathVertices: [
          { position: [0, 0], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [1, 0.5], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [0.25, 1], inHandle: [0, 0], outHandle: [0, 0] },
        ],
        transform: {
          x: 10,
          y: 5,
          width: 100,
          height: 60,
          rotation: 0,
          opacity: 1,
          cornerRadius: 0,
        },
      },
    ])
    flushSync()
    setTimelineState({
      keyframes: [
        {
          itemId: 'path-1',
          properties: [
            {
              property: 'x',
              keyframes: [
                { id: 'x-kf-1', frame: 0, value: 10, easing: 'linear' },
                { id: 'x-kf-2', frame: 30, value: 50, easing: 'linear' },
              ],
            },
            {
              property: 'y',
              keyframes: [
                { id: 'y-kf-1', frame: 0, value: 5, easing: 'linear' },
                { id: 'y-kf-2', frame: 30, value: 15, easing: 'linear' },
              ],
            },
            {
              property: 'width',
              keyframes: [
                { id: 'width-kf-1', frame: 0, value: 100, easing: 'linear' },
                { id: 'width-kf-2', frame: 30, value: 140, easing: 'linear' },
              ],
            },
            {
              property: 'height',
              keyframes: [
                { id: 'height-kf-1', frame: 0, value: 60, easing: 'linear' },
                { id: 'height-kf-2', frame: 30, value: 100, easing: 'linear' },
              ],
            },
          ],
        },
      ],
    })
    flushSync()
    usePlaybackStore.getState().setCurrentFrame(15)
    flushSync()
    const updatedItem = await dragEditedPathPoint(animatedTransform)
    expect(updatedItem?.transform?.x).toBeCloseTo(10)
    expect(updatedItem?.transform?.y).toBeCloseTo(5)
    expect(updatedItem?.transform?.width).toBeCloseTo(100)
    expect(updatedItem?.transform?.height).toBeCloseTo(60)

    const updatedKeyframes = useKeyframesStore
      .getState()
      .keyframes.find((entry) => entry.itemId === 'path-1')
    const xKeyframes =
      updatedKeyframes?.properties.find((property) => property.property === 'x')?.keyframes ?? []
    const yKeyframes =
      updatedKeyframes?.properties.find((property) => property.property === 'y')?.keyframes ?? []
    const widthKeyframes =
      updatedKeyframes?.properties.find((property) => property.property === 'width')?.keyframes ??
      []
    const heightKeyframes =
      updatedKeyframes?.properties.find((property) => property.property === 'height')?.keyframes ??
      []

    expect(xKeyframes).toHaveLength(3)
    expect(yKeyframes).toHaveLength(3)
    expect(widthKeyframes).toHaveLength(3)
    expect(heightKeyframes).toHaveLength(3)

    expect(xKeyframes.find((keyframe) => keyframe.frame === 15)?.value).toBeCloseTo(36)
    expect(yKeyframes.find((keyframe) => keyframe.frame === 15)?.value).toBeCloseTo(14)
    expect(widthKeyframes.find((keyframe) => keyframe.frame === 15)?.value).toBeCloseTo(108)
    expect(heightKeyframes.find((keyframe) => keyframe.frame === 15)?.value).toBeCloseTo(72)
  })

  it('falls back to base transform when frame is in a transition region and keyframe add is blocked', async () => {
    const animatedTransform: Transform = {
      x: 30,
      y: 10,
      width: 120,
      height: 80,
      rotation: 0,
      opacity: 1,
      cornerRadius: 0,
    }

    useItemsStore.getState().setItems([
      {
        id: 'left-clip',
        type: 'shape',
        trackId: 'track-1',
        from: 0,
        durationInFrames: 30,
        label: 'Left',
        shapeType: 'rectangle',
        fillColor: '#000000',
        transform: {
          x: 0,
          y: 0,
          width: 200,
          height: 120,
          rotation: 0,
          opacity: 1,
          cornerRadius: 0,
        },
      },
      {
        id: 'path-1',
        type: 'shape',
        trackId: 'track-1',
        from: 20,
        durationInFrames: 60,
        label: 'Mask',
        shapeType: 'path',
        fillColor: '#ffffff',
        isMask: true,
        pathVertices: [
          { position: [0, 0], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [1, 0.5], inHandle: [0, 0], outHandle: [0, 0] },
          { position: [0.25, 1], inHandle: [0, 0], outHandle: [0, 0] },
        ],
        transform: {
          x: 10,
          y: 5,
          width: 100,
          height: 60,
          rotation: 0,
          opacity: 1,
          cornerRadius: 0,
        },
      },
    ])
    flushSync()

    // Transition covering frames 0-10 of path-1 (incoming clip)
    useTransitionsStore.getState().setTransitions([
      {
        id: 'trans-1',
        type: 'crossfade',
        presentation: 'fade',
        timing: 'linear',
        leftClipId: 'left-clip',
        rightClipId: 'path-1',
        trackId: 'track-1',
        durationInFrames: 10,
        alignment: 0,
      },
    ])
    flushSync()

    setTimelineState({
      keyframes: [
        {
          itemId: 'path-1',
          properties: [
            { property: 'x', keyframes: [{ id: 'x-kf', frame: 30, value: 50, easing: 'linear' }] },
            { property: 'y', keyframes: [{ id: 'y-kf', frame: 30, value: 20, easing: 'linear' }] },
            {
              property: 'width',
              keyframes: [{ id: 'w-kf', frame: 30, value: 140, easing: 'linear' }],
            },
            {
              property: 'height',
              keyframes: [{ id: 'h-kf', frame: 30, value: 100, easing: 'linear' }],
            },
          ],
        },
      ],
    })
    flushSync()

    // Frame 25 in project = frame 5 in item (inside transition region)
    usePlaybackStore.getState().setCurrentFrame(25)
    flushSync()
    const updatedItem = await dragEditedPathPoint(animatedTransform)

    // The edit should fall through to base transform since keyframe add is blocked
    expect(updatedItem?.transform?.x).not.toBeCloseTo(10)
    expect(updatedItem?.transform?.y).not.toBeCloseTo(5)

    // Keyframe count should NOT have increased — no new keyframes in transition region
    const updatedKeyframes = useKeyframesStore
      .getState()
      .keyframes.find((entry) => entry.itemId === 'path-1')
    const xKeyframes =
      updatedKeyframes?.properties.find((property) => property.property === 'x')?.keyframes ?? []
    expect(xKeyframes).toHaveLength(1)
  })

  it('keeps the current multi-selection while dragging a selected point', async () => {
    seedEditablePath()

    const { canvas } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)

    await act(() => {
      useMaskEditorStore.getState().selectVertices([0, 1, 2, 3], 1)
    })

    await fireEvent.pointerDown(canvas, { clientX: 150, clientY: 30, pointerId: 1 })
    await fireEvent.pointerMove(canvas, { clientX: 165, clientY: 30, pointerId: 1 })

    expect(useMaskEditorStore.getState().selectedVertexIndices).toEqual([0, 1, 2, 3])
    expect(useMaskEditorStore.getState().selectedVertexIndex).toBe(1)
  })

  it('deletes the selected point instead of deleting the whole path item', async () => {
    seedEditablePath()
    useSelectionStore.getState().selectItems(['path-1'])
    flushSync()

    const coordParams: CoordinateParams = {
      containerRect: createRect(),
      playerSize: PLAYER_SIZE,
      projectSize: PROJECT_SIZE,
      zoom: 1,
    }

    render(MaskEditorOverlay, {
      props: {
        coordParams: coordParams,
        playerSize: PLAYER_SIZE,
        itemTransform: PATH_ITEM_TRANSFORM,
      },
    })

    await act(() => {
      useMaskEditorStore.getState().selectVertex(1)
    })

    await fireEvent.keyDown(window, { key: 'Delete' })

    await waitFor(() => {
      const updatedItem = useItemsStore.getState().items.find((item) => item.id === 'path-1') as
        | ShapeItem
        | undefined
      expect(updatedItem).toBeDefined()
      expect(updatedItem?.pathVertices).toHaveLength(3)
      expect(updatedItem?.pathVertices?.[0]?.position).toEqual([0, 0])
      expect(updatedItem?.pathVertices?.[1]?.position).toEqual([1, 1])
      expect(updatedItem?.pathVertices?.[2]?.position).toEqual([0, 1])
    })
  })

  it('keeps the dragged vertex stable while the fitted transform catches up after release', async () => {
    const queuedRafCallbacks: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queuedRafCallbacks.push(callback)
      return queuedRafCallbacks.length
    })
    const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      const index = Number(id) - 1
      if (index >= 0 && index < queuedRafCallbacks.length) {
        queuedRafCallbacks[index] = () => 0
      }
    })

    try {
      seedEditablePath()

      const { canvas, rerender } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)

      await fireEvent.pointerDown(canvas, { clientX: 150, clientY: 30, pointerId: 1 })
      await fireEvent.pointerMove(canvas, { clientX: 170, clientY: 30, pointerId: 1 })
      await fireEvent.pointerUp(canvas, { clientX: 170, clientY: 30, pointerId: 1 })

      const committedItem = useItemsStore.getState().items.find((item) => item.id === 'path-1')
      const committedTransform: Transform = {
        x: committedItem?.transform?.x ?? 0,
        y: committedItem?.transform?.y ?? 0,
        width: committedItem?.transform?.width ?? PATH_ITEM_TRANSFORM.width,
        height: committedItem?.transform?.height ?? PATH_ITEM_TRANSFORM.height,
        rotation: committedItem?.transform?.rotation ?? 0,
        opacity: committedItem?.transform?.opacity ?? 1,
        cornerRadius: committedItem?.transform?.cornerRadius ?? 0,
      }

      mockCanvasContext.arc.mockClear()

      await rerender({
        coordParams: createCoordParams(),
        playerSize: PLAYER_SIZE,
        itemTransform: committedTransform,
      })

      await act(() => {
        useMaskEditorStore.getState().setHover(0, null)
      })

      await waitFor(() => {
        expect(mockCanvasContext.arc.mock.calls.length).toBeGreaterThan(0)
      })

      const hasVertexAtDraggedPosition = mockCanvasContext.arc.mock.calls.some(
        (call) => Math.abs(call[0] - 170) < 0.1 && Math.abs(call[1] - 30) < 0.1,
      )
      const hasVertexAtSnappedPosition = mockCanvasContext.arc.mock.calls.some(
        (call) => Math.abs(call[0] - 194) < 0.1 && Math.abs(call[1] - 30) < 0.1,
      )

      expect(hasVertexAtDraggedPosition).toBe(true)
      expect(hasVertexAtSnappedPosition).toBe(false)
    } finally {
      rafSpy.mockRestore()
      cancelRafSpy.mockRestore()
    }
  })

  it('does not let deferred cleanup from one vertex drag end the next drag', async () => {
    const queuedRafCallbacks: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queuedRafCallbacks.push(callback)
      return queuedRafCallbacks.length
    })
    const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      const index = Number(id) - 1
      if (index >= 0 && index < queuedRafCallbacks.length) {
        queuedRafCallbacks[index] = () => 0
      }
    })

    try {
      seedEditablePath()
      const { canvas } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)
      Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn(), configurable: true })
      Object.defineProperty(canvas, 'releasePointerCapture', { value: vi.fn(), configurable: true })

      await fireEvent.pointerDown(canvas, { clientX: 150, clientY: 30, pointerId: 1 })
      await fireEvent.pointerUp(canvas, { clientX: 150, clientY: 30, pointerId: 1 })

      await fireEvent.pointerDown(canvas, { clientX: 150, clientY: 30, pointerId: 2 })
      await fireEvent.pointerMove(canvas, { clientX: 165, clientY: 38, pointerId: 2 })

      const livePreview = useMaskEditorStore.getState().previewVertices
      expect(useMaskEditorStore.getState().draggingVertexIndex).not.toBeNull()
      expect(livePreview).not.toBeNull()

      await act(() => {
        let callbackIndex = 0
        while (callbackIndex < queuedRafCallbacks.length) {
          queuedRafCallbacks[callbackIndex++]!(0)
        }
      })

      expect(useMaskEditorStore.getState().draggingVertexIndex).not.toBeNull()
      expect(useMaskEditorStore.getState().previewVertices).toBe(livePreview)
    } finally {
      rafSpy.mockRestore()
      cancelRafSpy.mockRestore()
    }
  })

  it('does not clear a newer same-item gizmo interaction when the mask editor unmounts', async () => {
    seedEditablePath()
    const { canvas, unmount } = renderMaskEditorOverlay(PATH_ITEM_TRANSFORM)
    Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn(), configurable: true })
    Object.defineProperty(canvas, 'releasePointerCapture', { value: vi.fn(), configurable: true })

    await fireEvent.pointerDown(canvas, { clientX: 100, clientY: 60, pointerId: 1 })
    const maskInteractionId = useGizmoStore.getState().activeGizmo?.interactionId
    expect(maskInteractionId).toBeDefined()

    const newerInteractionId = useGizmoStore
      .getState()
      .startTranslate('path-1', { x: 20, y: 20 }, PATH_ITEM_TRANSFORM, undefined, 'shape')

    unmount()

    expect(useGizmoStore.getState().activeGizmo?.interactionId).toBe(newerInteractionId)
  })
})

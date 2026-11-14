// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { KeyframeRef } from '@/types/keyframe'
import Harness from './use-graph-interaction.harness.svelte'

// The harness graphs' size.
const viewport = { width: 600, height: 300 }

function installSvgDomMocks(svg: SVGSVGElement) {
  Object.defineProperty(svg, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: viewport.width,
      bottom: viewport.height,
      width: viewport.width,
      height: viewport.height,
      toJSON: () => ({}),
    }),
  })

  Object.defineProperty(svg, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  })

  Object.defineProperty(svg, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  })
}

describe('useGraphInteraction marquee selection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a marquee overlay and updates selection while dragging on the graph background', async () => {
    render(Harness, { mode: 'marquee' })

    const svg = screen.getByTestId('graph') as unknown as SVGSVGElement
    installSvgDomMocks(svg)

    await fireEvent.pointerDown(screen.getByTestId('background'), {
      button: 0,
      clientX: 90,
      clientY: 90,
      pointerId: 1,
    })

    await fireEvent.pointerMove(window, {
      clientX: 280,
      clientY: 210,
      pointerId: 1,
    })

    expect(screen.getByTestId('marquee')).toBeInTheDocument()
    expect(screen.getByTestId('selection')).toHaveTextContent('kf-1,kf-2')

    await fireEvent.pointerUp(window, { pointerId: 1 })

    expect(screen.queryByTestId('marquee')).not.toBeInTheDocument()
  })

  it('previews selected graph points as a group and commits on pointer up', async () => {
    const onKeyframeMove = vi.fn()
    render(Harness, { mode: 'drag', initialSelection: ['kf-1', 'kf-2'], onKeyframeMove })

    const svg = screen.getByTestId('drag-graph') as unknown as SVGSVGElement
    installSvgDomMocks(svg)

    await fireEvent.pointerDown(screen.getByTestId('point-kf-1'), {
      button: 0,
      clientX: 120,
      clientY: 120,
      pointerId: 2,
    })

    await fireEvent.pointerMove(svg, {
      clientX: 180,
      clientY: 90,
      pointerId: 2,
    })

    expect(onKeyframeMove).not.toHaveBeenCalled()
    expect(screen.getByTestId('preview-values')).toHaveTextContent('"kf-1"')
    expect(screen.getByTestId('preview-values')).toHaveTextContent('"kf-2"')

    await fireEvent.pointerUp(svg, { pointerId: 2 })

    const movedIds = new Set(
      onKeyframeMove.mock.calls.map(([ref]) => (ref as KeyframeRef).keyframeId),
    )

    expect(movedIds).toEqual(new Set(['kf-1', 'kf-2']))
  })

  it('uses the visible y-range for drag sensitivity', async () => {
    render(Harness, { mode: 'sensitivity', initialSelection: ['kf-1'] })

    const svg = screen.getByTestId('sensitivity-graph') as unknown as SVGSVGElement
    installSvgDomMocks(svg)

    await fireEvent.pointerDown(screen.getByTestId('sensitivity-point'), {
      button: 0,
      clientX: 120,
      clientY: 120,
      pointerId: 7,
    })

    await fireEvent.pointerMove(svg, {
      clientX: 120,
      clientY: 96,
      pointerId: 7,
    })

    expect(screen.getByTestId('sensitivity-preview-values')).toHaveTextContent('106')
  })

  it('duplicates dragged graph keyframes when alt is held', async () => {
    const onDuplicateKeyframes = vi.fn()
    const onKeyframeMove = vi.fn()

    render(Harness, {
      mode: 'drag',
      initialSelection: ['kf-1'],
      onKeyframeMove,
      onDuplicateKeyframes,
    })

    const svg = screen.getByTestId('drag-graph') as unknown as SVGSVGElement
    installSvgDomMocks(svg)

    await fireEvent.pointerDown(screen.getByTestId('point-kf-1'), {
      button: 0,
      clientX: 120,
      clientY: 150,
      pointerId: 9,
      altKey: true,
    })
    await fireEvent.pointerMove(svg, {
      clientX: 180,
      clientY: 150,
      pointerId: 9,
      altKey: true,
    })
    await fireEvent.pointerUp(svg, {
      clientX: 180,
      clientY: 150,
      pointerId: 9,
      altKey: true,
    })

    expect(onKeyframeMove).not.toHaveBeenCalled()
    expect(onDuplicateKeyframes).toHaveBeenCalled()
  })

  it('keeps the keyframe cluster in view when zooming with graph controls', async () => {
    render(Harness, { mode: 'zoom' })

    const zoomButton = screen.getByRole('button', { name: 'zoom' })
    await fireEvent.click(zoomButton)
    await fireEvent.click(zoomButton)
    await fireEvent.click(zoomButton)

    const [startFrame, endFrame] = screen
      .getByTestId('zoom-viewport')
      .textContent!.split(',')
      .map(Number)
    expect(startFrame).toBe(0)
    expect(endFrame).toBeCloseTo(51.2, 4)
  })

  it('uses ctrl+wheel to zoom the frame axis without changing value bounds', async () => {
    render(Harness, { mode: 'wheel-zoom' })

    const svg = screen.getByTestId('wheel-graph') as unknown as SVGSVGElement
    installSvgDomMocks(svg)

    await fireEvent.wheel(svg, {
      deltaY: -100,
      ctrlKey: true,
      clientX: 300,
      clientY: 150,
    })

    const [startFrame = 0, endFrame = 0, minValue = 0, maxValue = 0] = screen
      .getByTestId('wheel-viewport')
      .textContent!.split(',')
      .map(Number)

    expect(endFrame - startFrame).toBeCloseTo(80, 4)
    expect(minValue).toBe(0)
    expect(maxValue).toBe(100)
  })

  it('uses shift+wheel to pan the frame viewport', async () => {
    render(Harness, { mode: 'wheel-pan' })

    const svg = screen.getByTestId('pan-wheel-graph') as unknown as SVGSVGElement
    installSvgDomMocks(svg)

    await fireEvent.wheel(svg, {
      deltaY: 120,
      shiftKey: true,
      clientX: 300,
      clientY: 150,
    })

    const [startFrame = 0, endFrame = 0, minValue = 0, maxValue = 0] = screen
      .getByTestId('pan-wheel-viewport')
      .textContent!.split(',')
      .map(Number)

    expect(startFrame).toBeGreaterThan(10)
    expect(endFrame - startFrame).toBeCloseTo(60, 4)
    expect(minValue).toBe(0)
    expect(maxValue).toBe(100)
  })
})

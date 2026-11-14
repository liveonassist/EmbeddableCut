// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useKeyframesStore, useTimelineCommandStore } from '@/features/editor/deps/timeline-motion'
import PickWhipHarness from './use-linked-transform-pick-whip.harness.svelte'

function hitTestReturns(element: Element | null) {
  const hitTest = vi.fn(() => element)
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hitTest })
  return hitTest
}

async function drag(button: HTMLElement, pointerId: number) {
  await fireEvent.pointerDown(button, { button: 0, pointerId, clientX: 0, clientY: 0 })
  await fireEvent.pointerMove(window, { pointerId, clientX: 24, clientY: 24 })
  await fireEvent.pointerUp(window, { pointerId, clientX: 24, clientY: 24 })
}

describe('usePropertyLinkPickWhip', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory()
    useKeyframesStore.getState().setKeyframes([])
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'elementFromPoint')
    vi.restoreAllMocks()
  })

  it('creates a property link after dragging to a compatible row', async () => {
    render(PickWhipHarness)
    const sourceRow = screen.getByTestId('source-row')
    hitTestReturns(sourceRow)

    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Target X' }), {
      button: 0,
      pointerId: 9,
      clientX: 0,
      clientY: 0,
    })
    expect(screen.getByTestId('active-pick-whip')).toBeTruthy()
    expect(sourceRow).toHaveAttribute('data-expression-link-eligible', 'true')
    expect(screen.getByTestId('shape-source-row')).toHaveAttribute(
      'data-expression-link-eligible',
      'true',
    )
    expect(screen.getByTestId('vector-source-row')).not.toHaveAttribute(
      'data-expression-link-eligible',
    )

    await fireEvent.pointerMove(window, { pointerId: 9, clientX: 24, clientY: 24 })
    await waitFor(() => expect(sourceRow.getAttribute('data-expression-link-hover')).toBe('true'))
    await fireEvent.pointerUp(window, { pointerId: 9, clientX: 24, clientY: 24 })

    expect(useKeyframesStore.getState().keyframesByItemId.target?.propertyLinks).toEqual([
      {
        type: 'link',
        targetProperty: 'x',
        sourceItemId: 'source',
        sourceProperty: 'y',
        enabled: true,
        timeOffsetFrames: 0,
      },
    ])
    expect(sourceRow.hasAttribute('data-expression-link-hover')).toBe(false)
    expect(sourceRow).not.toHaveAttribute('data-expression-link-eligible')
    expect(screen.getByTestId('shape-source-row')).not.toHaveAttribute(
      'data-expression-link-eligible',
    )
    expect(screen.queryByTestId('active-pick-whip')).toBeNull()
  })

  it('clears eligible row highlights when the drag is canceled', async () => {
    render(PickWhipHarness)
    const sourceRow = screen.getByTestId('source-row')

    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Target X' }), {
      button: 0,
      pointerId: 18,
      clientX: 0,
      clientY: 0,
    })
    expect(sourceRow).toHaveAttribute('data-expression-link-eligible', 'true')

    await fireEvent.pointerCancel(window, { pointerId: 18 })

    expect(sourceRow).not.toHaveAttribute('data-expression-link-eligible')
    expect(screen.queryByTestId('active-pick-whip')).toBeNull()
  })

  it('coalesces pointer presentation and hit testing to one animation frame', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    render(PickWhipHarness)
    const hitTest = hitTestReturns(screen.getByTestId('source-row'))

    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Target X' }), {
      button: 0,
      pointerId: 17,
      clientX: 0,
      clientY: 0,
    })
    animationFrames.length = 0

    await fireEvent.pointerMove(window, { pointerId: 17, clientX: 8, clientY: 8 })
    await fireEvent.pointerMove(window, { pointerId: 17, clientX: 16, clientY: 16 })
    await fireEvent.pointerMove(window, { pointerId: 17, clientX: 24, clientY: 24 })

    expect(animationFrames).toHaveLength(1)
    expect(hitTest).not.toHaveBeenCalled()

    animationFrames.shift()?.(16)
    flushSync()

    expect(hitTest).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('active-pick-whip').querySelector('circle')?.getAttribute('cx')).toBe(
      '24',
    )

    await fireEvent.pointerUp(window, { pointerId: 17, clientX: 24, clientY: 24 })
  })

  it('accepts Shape scalar rows as link sources', async () => {
    render(PickWhipHarness)
    hitTestReturns(screen.getByTestId('shape-source-row'))

    await drag(screen.getByRole('button', { name: 'Target X' }), 10)

    expect(useKeyframesStore.getState().keyframesByItemId.target?.propertyLinks?.[0]).toMatchObject(
      {
        targetProperty: 'x',
        sourceItemId: 'shape-source',
        sourceProperty: 'trimPathEnd',
      },
    )
  })

  it('links Vector2 rows and rejects scalar-to-vector targets', async () => {
    render(PickWhipHarness)
    hitTestReturns(screen.getByTestId('vector-source-row'))

    await drag(screen.getByRole('button', { name: 'Target Position' }), 15)

    expect(useKeyframesStore.getState().keyframesByItemId['vector-target']?.propertyLinks).toEqual([
      {
        type: 'link',
        targetProperty: 'position',
        sourceItemId: 'vector-source',
        sourceProperty: 'scale',
        enabled: true,
        timeOffsetFrames: 0,
      },
    ])

    await drag(screen.getByRole('button', { name: 'Target X' }), 16)

    expect(useKeyframesStore.getState().keyframesByItemId.target?.propertyLinks).toBeUndefined()
  })

  it('keeps the cable anchored to its pick whip while the editor scrolls', async () => {
    render(PickWhipHarness)
    const button = screen.getByRole('button', { name: 'Target X' })
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    let top = 20
    vi.spyOn(button, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          left: 10,
          top,
          width: 12,
          height: 12,
          right: 22,
          bottom: top + 12,
          x: 10,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect,
    )
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          left: 4,
          top: 12,
          width: 500,
          height: 300,
          right: 504,
          bottom: 312,
          x: 4,
          y: 12,
          toJSON: () => ({}),
        }) as DOMRect,
    )
    hitTestReturns(null)

    await fireEvent.pointerDown(button, { button: 0, pointerId: 11, clientX: 16, clientY: 26 })
    expect(screen.getByTestId('active-pick-whip').querySelector('path')?.getAttribute('d')).toMatch(
      /^M 16 26 /,
    )
    expect(screen.getByTestId('active-pick-whip').getAttribute('viewBox')).toBe('4 12 500 300')

    top = 68
    await fireEvent.scroll(button.parentElement!)

    await waitFor(() => {
      expect(
        screen.getByTestId('active-pick-whip').querySelector('path')?.getAttribute('d'),
      ).toMatch(/^M 16 74 /)
    })
    await fireEvent.pointerUp(window, { pointerId: 11, clientX: 16, clientY: 26 })
  })

  it('auto-scrolls when the pointer is held near a vertical viewport edge', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    render(PickWhipHarness)
    const scrollArea = screen.getByTestId('motion-layer-scroll-area')
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 500,
      height: 300,
      right: 500,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
    Object.defineProperties(scrollArea, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, value: 100, writable: true },
    })
    hitTestReturns(null)

    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Target X' }), {
      button: 0,
      pointerId: 12,
      clientX: 100,
      clientY: 150,
    })
    animationFrames.length = 0
    await fireEvent.pointerMove(window, { pointerId: 12, clientX: 100, clientY: 292 })
    expect(animationFrames).toHaveLength(2)

    for (const callback of animationFrames.splice(0)) callback(16)
    flushSync()

    expect(scrollArea.scrollTop).toBeGreaterThan(100)
    await fireEvent.pointerUp(window, { pointerId: 12, clientX: 100, clientY: 292 })
  })
})

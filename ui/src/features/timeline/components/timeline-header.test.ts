// SPDX-License-Identifier: MIT

import { flushSync, tick } from 'svelte'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { ZOOM_MAX, ZOOM_MIN } from '@/features/timeline/constants'
import { useZoomStore } from '@/features/timeline/stores/zoom-store'
import { useSelectionStore } from '@/shared/state/selection'
import { micRenders, sliderInput, sliderRenders } from './timeline-header.harness'
import TimelineHeader from './timeline-header.svelte'

vi.mock('@/components/ui/slider', async () => ({
  Slider: (await import('./timeline-header-slider-stub.harness.svelte')).default,
}))

vi.mock('./mic-record-control', async () => ({
  MicRecordControl: (await import('./timeline-header-mic-stub.harness.svelte')).default,
}))

function act(fn: () => void) {
  fn()
  flushSync()
}

describe('TimelineHeader zoom slider', () => {
  beforeEach(() => {
    micRenders.count = 0
    sliderRenders.count = 0
    sliderInput.value = 0.75
    useZoomStore.getState().setZoomLevelSynchronized(1)
    useSelectionStore.setState({
      selectedItemIds: [],
      selectedItemIdSet: new Set<string>(),
      editKeyframePanelOpen: false,
      expandedKeyframeLanes: new Set<string>(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('previews pointer input immediately and commits without slider-only momentum', async () => {
    const animationFrameSpy = vi.spyOn(window, 'requestAnimationFrame')
    const onZoomChange = vi.fn()
    const targetZoom = ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, 0.75)

    render(TimelineHeader, { onZoomChange })
    expect(micRenders.count).toBe(1)

    await fireEvent.mouseDown(screen.getByRole('slider'))

    expect(screen.getByTestId('zoom-slider-thumb-positioner').style.left).toBe('calc(75% - 4px)')
    expect(screen.getByTestId('zoom-slider-range').style.right).toBe('25%')
    expect(onZoomChange).toHaveBeenLastCalledWith(targetZoom)
    expect(animationFrameSpy).not.toHaveBeenCalled()
    expect(micRenders.count).toBe(1)
    expect(useZoomStore.getState().level).toBe(1)

    await fireEvent.mouseUp(screen.getByRole('slider'))

    expect(onZoomChange).toHaveBeenCalledTimes(1)
    expect(onZoomChange).toHaveBeenLastCalledWith(targetZoom)
    expect(animationFrameSpy).not.toHaveBeenCalled()

    act(() => useZoomStore.getState().setZoomLevelImmediate(targetZoom))
    expect(Number(screen.getByRole('slider').getAttribute('aria-valuenow'))).toBeCloseTo(0.75)
    expect(micRenders.count).toBe(1)

    animationFrameSpy.mockRestore()
  })

  it('releases a max-zoom preview when a later zoom supersedes its queued target', async () => {
    sliderInput.value = 1
    const onZoomChange = vi.fn()

    render(TimelineHeader, { onZoomChange })
    const slider = screen.getByTestId('zoom-slider')

    await fireEvent.mouseDown(screen.getByRole('slider'))
    await fireEvent.mouseUp(screen.getByRole('slider'))
    expect(onZoomChange).toHaveBeenLastCalledWith(ZOOM_MAX)

    act(() => useZoomStore.getState().setZoomLevelSynchronized(ZOOM_MIN))

    expect(Number(slider.dataset.value)).toBeCloseTo(0)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0')
  })

  it('keeps wheel-frequency zoom updates outside the slider render path', () => {
    vi.useFakeTimers()
    try {
      render(TimelineHeader)
      const slider = screen.getByTestId('zoom-slider')
      const initialControlledValue = Number(slider.dataset.value)
      const firstZoom = 0.1
      const finalZoom = 2
      const firstSliderValue = Math.log(firstZoom / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)
      const finalSliderValue = Math.log(finalZoom / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)

      expect(sliderRenders.count).toBe(1)

      act(() => useZoomStore.getState().setZoomLevelImmediate(firstZoom))
      expect(sliderRenders.count).toBe(1)
      expect(Number(screen.getByRole('slider').getAttribute('aria-valuenow'))).toBeCloseTo(
        firstSliderValue,
      )
      expect(Number(slider.dataset.value)).toBeCloseTo(initialControlledValue)

      act(() => useZoomStore.getState().setZoomLevelImmediate(finalZoom))
      expect(sliderRenders.count).toBe(1)
      expect(Number(screen.getByRole('slider').getAttribute('aria-valuenow'))).toBeCloseTo(
        finalSliderValue,
      )
      expect(parseFloat(screen.getByTestId('zoom-slider-range').style.right)).toBeCloseTo(
        100 - finalSliderValue * 100,
      )

      act(() => vi.advanceTimersByTime(200))

      expect(sliderRenders.count).toBe(2)
      expect(Number(slider.dataset.value)).toBeCloseTo(finalSliderValue)
      expect(Number(screen.getByRole('slider').getAttribute('aria-valuenow'))).toBeCloseTo(
        finalSliderValue,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not settle or contract content while the slider thumb is held', async () => {
    vi.useFakeTimers()
    try {
      sliderInput.value = 0.9
      const targetZoom = ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, sliderInput.value)
      render(TimelineHeader)
      const thumb = screen.getByRole('slider')

      await fireEvent.pointerDown(thumb)
      await fireEvent.mouseDown(thumb)
      act(() => vi.advanceTimersByTime(1_000))

      expect(useZoomStore.getState()).toMatchObject({
        level: targetZoom,
        contentLevel: 1,
        isZoomInteracting: true,
      })

      await fireEvent.mouseUp(thumb)
      expect(useZoomStore.getState()).toMatchObject({
        contentLevel: targetZoom,
        isZoomInteracting: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases slider zoom when pointer-up lands outside the control', async () => {
    vi.useFakeTimers()
    try {
      sliderInput.value = 0.85
      const targetZoom = ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, sliderInput.value)
      render(TimelineHeader)

      await fireEvent.pointerDown(screen.getByRole('slider'))
      await fireEvent.mouseDown(screen.getByRole('slider'))
      act(() => vi.advanceTimersByTime(1_000))
      expect(useZoomStore.getState()).toMatchObject({
        level: targetZoom,
        contentLevel: 1,
        isZoomInteracting: true,
      })

      await fireEvent.pointerUp(window)

      expect(useZoomStore.getState()).toMatchObject({
        contentLevel: targetZoom,
        isZoomInteracting: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases slider focus after an outside pointer release', async () => {
    render(TimelineHeader)
    const thumb = screen.getByRole('slider')

    thumb.focus()
    expect(thumb).toHaveFocus()

    await fireEvent.pointerDown(thumb)
    await fireEvent.pointerUp(window)
    await tick()

    expect(thumb).not.toHaveFocus()
  })

  it('releases slider focus after a normal value commit', async () => {
    render(TimelineHeader)
    const thumb = screen.getByRole('slider')

    thumb.focus()
    expect(thumb).toHaveFocus()

    await fireEvent.pointerDown(thumb)
    await fireEvent.mouseDown(thumb)
    await fireEvent.mouseUp(thumb)
    await tick()

    expect(thumb).not.toHaveFocus()
  })

  it('synchronizes repeated keyboard steps without discarding slider focus', async () => {
    const onZoomChange = vi.fn()
    render(TimelineHeader, { onZoomChange })
    const slider = screen.getByTestId('zoom-slider')
    const thumb = screen.getByRole('slider')
    const initialValue = Number(slider.dataset.value)

    thumb.focus()

    await fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(Number(slider.dataset.value)).toBeCloseTo(initialValue + 0.005)
    expect(onZoomChange).toHaveBeenCalledTimes(1)

    await fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(Number(slider.dataset.value)).toBeCloseTo(initialValue + 0.01)
    expect(sliderRenders.count).toBe(3)
    expect(onZoomChange).toHaveBeenCalledTimes(2)
    expect(useZoomStore.getState().level).toBe(1)

    await fireEvent.keyUp(thumb, { key: 'ArrowRight' })
    await tick()
    expect(onZoomChange).toHaveBeenCalledTimes(2)
    expect(thumb).toHaveFocus()

    await fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(Number(slider.dataset.value)).toBeCloseTo(initialValue + 0.015)
    expect(onZoomChange).toHaveBeenCalledTimes(3)
  })

  it('toggles the keyframe panel without a selected clip', async () => {
    render(TimelineHeader)

    const toggle = screen.getByRole('button', { name: 'Show keyframe panel' })
    expect(toggle).toBeEnabled()

    await fireEvent.click(toggle)

    expect(useSelectionStore.getState().editKeyframePanelOpen).toBe(true)
    expect(useSelectionStore.getState().expandedKeyframeLanes.size).toBe(0)
    expect(screen.getByRole('button', { name: 'Hide keyframe panel' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import ClipIndicatorsHarness from './clip-indicators.harness.svelte'

const baseProps = {
  hasKeyframes: false,
  keyframesExpanded: false,
  hasMotion: false,
  currentSpeed: 1,
  isReversed: false,
  isStretching: false,
  stretchFeedback: null,
  isBroken: false,
  hasMediaId: false,
  isMask: false,
  isShape: false,
}

describe('ClipIndicators', () => {
  afterEach(() => {
    cleanup()
  })

  it('toggles the keyframe panel exactly once from the completed click', async () => {
    const onKeyframesToggle = vi.fn()
    const parentPointerDown = vi.fn()
    const parentClick = vi.fn()

    render(ClipIndicatorsHarness, {
      ...baseProps,
      hasKeyframes: true,
      onKeyframesToggle,
      parentPointerDown,
      parentClick,
    })

    const button = screen.getByRole('button', { name: 'Show keyframe panel' })

    await fireEvent.pointerDown(button, { button: 0 })
    expect(onKeyframesToggle).not.toHaveBeenCalled()
    expect(parentPointerDown).not.toHaveBeenCalled()

    await fireEvent.click(button, { detail: 1 })
    expect(onKeyframesToggle).toHaveBeenCalledTimes(1)
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('opens animation controls without starting the parent clip gesture', async () => {
    const onMotionOpen = vi.fn()
    const parentPointerDown = vi.fn()
    const parentClick = vi.fn()

    render(ClipIndicatorsHarness, {
      ...baseProps,
      hasMotion: true,
      onMotionOpen,
      parentPointerDown,
      parentClick,
    })

    const button = screen.getByRole('button', { name: 'Open animation controls' })

    await fireEvent.pointerDown(button, { button: 0 })
    expect(onMotionOpen).not.toHaveBeenCalled()
    expect(parentPointerDown).not.toHaveBeenCalled()

    await fireEvent.click(button, { detail: 1 })
    expect(onMotionOpen).toHaveBeenCalledTimes(1)
    expect(parentClick).not.toHaveBeenCalled()
  })
})

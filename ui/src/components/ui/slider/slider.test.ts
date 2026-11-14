// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import Slider from './slider.svelte'

describe('Slider', () => {
  it("reports the user's changes but not a controlled value off the step grid", async () => {
    const onValueChange = vi.fn()
    const { rerender } = render(Slider, {
      value: [37.48],
      max: 100,
      step: 0.1,
      onValueChange,
      'aria-label': 'Seek',
    })
    flushSync()
    // A media player's progress, updated from outside on every time update.
    await rerender({ value: [52.37] })
    flushSync()
    expect(onValueChange).not.toHaveBeenCalled()

    await fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange.mock.calls[0]?.[0]?.[0]).toBeCloseTo(52.5)
  })
})

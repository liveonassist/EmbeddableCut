// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import { SliderInput } from './slider-input'

describe('SliderInput', () => {
  it('commits the final dragged value on pointer release when using live preview', async () => {
    const onChange = vi.fn()
    const onLiveChange = vi.fn()

    render(SliderInput, {
      value: 0,
      onChange,
      onLiveChange,
      min: 0,
      max: 10,
      step: 1,
      liveChangeThrottleMs: 0,
    })

    const track = screen.getByText('0').closest('div[class*="relative"]') as HTMLDivElement
    expect(track).toBeTruthy()

    Object.defineProperty(track, 'offsetWidth', {
      configurable: true,
      value: 200,
    })
    track.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 28,
      width: 200,
      height: 28,
      toJSON: () => ({}),
    })
    track.setPointerCapture = vi.fn()

    await fireEvent.pointerDown(track, { clientX: 0, clientY: 14, pointerId: 1 })
    await fireEvent.pointerMove(track, { clientX: 120, clientY: 14, pointerId: 1 })
    await fireEvent.pointerUp(track, { clientX: 120, clientY: 14, pointerId: 1 })

    expect(onLiveChange).toHaveBeenCalledWith(6)
    expect(onChange).toHaveBeenCalledWith(6)
  })

  it('reflects committed text entry without waiting for a parent rerender', async () => {
    const onChange = vi.fn()

    render(SliderInput, { value: 5, onChange, min: 0, max: 10, step: 1 })

    await fireEvent.click(screen.getByText('5'))

    const input = screen.getByRole('textbox')
    await fireEvent.input(input, { target: { value: '15' } })
    await fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(10)
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument()
    })
  })

  it('supports formatted typed input separate from the raw stored value', async () => {
    const onChange = vi.fn()

    render(SliderInput, {
      value: 5,
      onChange,
      min: 0,
      max: 300,
      step: 1,
      formatValue: (value: number) => `${(value / 30).toFixed(2)}s`,
      formatInputValue: (value: number) => (value / 30).toFixed(2),
      parseInputValue: (rawValue: string) => parseFloat(rawValue) * 30,
    })

    await fireEvent.click(screen.getByText('0.17s'))

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('0.17')

    await fireEvent.input(input, { target: { value: '1.00' } })
    await fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(30)
    await waitFor(() => {
      expect(screen.getByText('1.00s')).toBeInTheDocument()
    })
  })
})

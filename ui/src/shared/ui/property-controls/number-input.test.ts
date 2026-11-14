// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import NumberInput from './number-input.svelte'

describe('NumberInput', () => {
  it('normalizes and reflects committed values without a parent rerender', async () => {
    const onChange = vi.fn()

    render(NumberInput, { value: 5, onChange, min: 0, max: 10 })

    const input = screen.getByRole('textbox')
    await fireEvent.input(input, { target: { value: '15' } })
    await fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(10)
    expect(input).toHaveValue('10')
  })

  it('supports formatted parse/format input without waiting for a parent rerender', async () => {
    const onChange = vi.fn()

    render(NumberInput, {
      value: 5,
      onChange,
      min: 0,
      max: 300,
      step: 1,
      unit: 'f',
      formatInputValue: (value: number) => (value / 30).toFixed(2),
      parseInputValue: (rawValue: string) => parseFloat(rawValue) * 30,
    })

    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('0.17')

    await fireEvent.input(input, { target: { value: '1.00' } })
    await fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith(30)
    expect(input).toHaveValue('1.00')
  })
})

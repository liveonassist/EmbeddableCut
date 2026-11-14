// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vite-plus/test'
import SelectHarness from './select.harness.svelte'

describe('Select', () => {
  it("shows the selected item's label while closed, as Radix's Value does", () => {
    render(SelectHarness, { value: 'cover' })

    const trigger = screen.getByRole('combobox', { name: 'Fit' })
    expect(trigger).toHaveTextContent('Fill frame')
    expect(trigger.querySelector('strong')).toHaveTextContent('Fill')
    // The closed content only registers labels: no options, no other items' text.
    expect(screen.queryByRole('option')).toBeNull()
    expect(screen.queryByText('Fit inside')).toBeNull()
  })

  it('shows the placeholder until a value is chosen', async () => {
    const { rerender } = render(SelectHarness, { placeholder: 'Choose a fit' })

    const trigger = screen.getByRole('combobox', { name: 'Fit' })
    expect(trigger).toHaveTextContent('Choose a fit')
    expect(trigger).toHaveAttribute('data-placeholder')

    await rerender({ value: 'contain' })
    flushSync()

    expect(trigger).toHaveTextContent('Fit inside')
    expect(trigger).not.toHaveAttribute('data-placeholder')
  })
})

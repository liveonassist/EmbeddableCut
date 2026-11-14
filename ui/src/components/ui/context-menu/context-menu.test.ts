// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import ContextMenuHarness from './context-menu.harness.svelte'

describe('ContextMenu', () => {
  it("renders Radix's span trigger and opens its menu on right-click", async () => {
    const onSelect = vi.fn()
    render(ContextMenuHarness, { onSelect })

    const trigger = screen.getByText('Clip')
    expect(trigger.tagName).toBe('SPAN')

    await fireEvent.contextMenu(trigger, { clientX: 10, clientY: 10 })
    const item = await screen.findByRole('menuitem', { name: 'Split' })
    await fireEvent.click(item)

    expect(onSelect).toHaveBeenCalledOnce()
  })
})

// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import AlertDialogHarness from './alert-dialog.harness.svelte'

describe('AlertDialog', () => {
  it('runs the action, then closes, as Radix does', async () => {
    const onAction = vi.fn()
    render(AlertDialogHarness, { onAction })

    const action = screen.getByRole('button', { name: 'Bake' })
    expect(action.className).toContain('bg-primary')
    await fireEvent.click(action)

    expect(onAction).toHaveBeenCalledOnce()
    expect(screen.getByTestId('state')).toHaveTextContent('closed')
  })

  it('stays open when the action prevents the default', async () => {
    render(AlertDialogHarness, { onAction: (event: MouseEvent) => event.preventDefault() })

    await fireEvent.click(screen.getByRole('button', { name: 'Bake' }))

    expect(screen.getByTestId('state')).toHaveTextContent('open')
  })
})

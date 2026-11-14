// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import Button from './button.svelte'

const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }))

describe('Button', () => {
  it("keeps the React kit's variant classes and forwards events", async () => {
    const onclick = vi.fn()
    render(Button, { variant: 'outline', size: 'sm', onclick, children: label('Export') })

    const button = screen.getByRole('button', { name: 'Export' })
    expect(button.className).toContain('border-input')
    expect(button.className).toContain('h-8')
    await fireEvent.click(button)
    expect(onclick).toHaveBeenCalledOnce()
  })
})

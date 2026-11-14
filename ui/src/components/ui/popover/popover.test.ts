// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vite-plus/test'
import PopoverHarness from './popover.harness.svelte'

describe('PopoverContent', () => {
  it("portals into the editor's portal layer, not the host page's body", async () => {
    const portalTarget = document.createElement('div')
    document.body.append(portalTarget)
    render(PopoverHarness, { portalTarget })

    const body = await screen.findByText('Popover body')
    expect(portalTarget.contains(body)).toBe(true)
    expect(body.className).toContain('bg-popover')
    portalTarget.remove()
  })
})

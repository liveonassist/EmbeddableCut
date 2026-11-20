// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { fireEvent, render } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import GlobalTooltip from './global-tooltip.svelte'

function renderWithTrigger(triggerHtml: string) {
  document.body.insertAdjacentHTML('afterbegin', triggerHtml)
  render(GlobalTooltip)
  return document.querySelector('[role="tooltip"]')
}

describe('GlobalTooltip', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('keeps the button tooltip active while the pointer moves across its icon', () => {
    vi.useFakeTimers()
    const tooltip = renderWithTrigger(
      '<button data-tooltip="Media"><svg data-testid="icon"></svg></button>',
    )
    const button = document.querySelector('button')!
    const icon = document.querySelector('[data-testid="icon"]')!

    fireEvent.pointerOver(button)
    vi.advanceTimersByTime(200)

    fireEvent.pointerOver(icon, { relatedTarget: button })
    vi.advanceTimersByTime(100)
    flushSync()

    expect(tooltip).toHaveAttribute('data-visible', 'true')
    expect(tooltip).toHaveTextContent('Media')

    fireEvent.pointerOut(icon, { relatedTarget: button })
    flushSync()
    expect(tooltip).toHaveAttribute('data-visible', 'true')
  })

  it('hides the tooltip after the pointer leaves the owning button', () => {
    vi.useFakeTimers()
    const tooltip = renderWithTrigger('<button data-tooltip="Media"></button>')
    const button = document.querySelector('button')!

    fireEvent.pointerOver(button)
    vi.advanceTimersByTime(300)
    flushSync()
    expect(tooltip).toHaveAttribute('data-visible', 'true')

    fireEvent.pointerOut(button)
    flushSync()
    expect(tooltip).toHaveAttribute('data-visible', 'false')
  })

  it('listens inside the shadow root it renders in', () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<button data-tooltip="Inside"></button><div id="target"></div>'
    render(GlobalTooltip, { target: shadow.getElementById('target')! })

    fireEvent.pointerOver(shadow.querySelector('button')!)
    vi.advanceTimersByTime(300)
    flushSync()

    expect(shadow.querySelector('[role="tooltip"]')).toHaveAttribute('data-visible', 'true')
  })
})

// @vitest-environment jsdom

import { tick } from 'svelte'
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'
import { mountEditor, type MountedEditor } from './mount'

let mounted: MountedEditor | null = null

beforeAll(() => {
  // jsdom has no constructable stylesheets.
  if (!('replaceSync' in CSSStyleSheet.prototype)) {
    Object.assign(CSSStyleSheet.prototype, { replaceSync() {} })
  }
})

afterEach(async () => {
  await mounted?.unmount()
  mounted = null
  document.body.innerHTML = ''
})

describe('mountEditor', () => {
  it('renders inside its own shadow root and themes only itself', async () => {
    const target = document.createElement('div')
    document.body.append(target)

    mounted = await mountEditor(target, { theme: 'dark' })

    const host = target.querySelector<HTMLElement>('.ec-host')!
    expect(host.shadowRoot?.querySelector('.ec-root')).not.toBeNull()
    expect(document.querySelector('.ec-root')).toBeNull()
    expect(host.dataset.theme).toBe('dark')

    mounted.setTheme({ mode: 'light', tokens: { primary: 'oklch(0.6 0.2 250)' } })
    expect(host.dataset.theme).toBe('light')
    expect(host.style.getPropertyValue('--primary')).toBe('oklch(0.6 0.2 250)')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
  })

  it('opens the document it is given, and frees the page for the next editor on unmount', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const first = await mountEditor(target, { isolation: 'none' })
    await first.editor.createProject({ name: 'Handed over' })
    const document_ = first.editor.toDocument()
    await first.unmount()
    expect(target.querySelector('.ec-root')).toBeNull()

    mounted = await mountEditor(target, { isolation: 'none', document: document_ })
    await tick()

    expect(mounted.editor.project?.name).toBe('Handed over')
    expect(target.querySelector('.ec-root')?.textContent).toContain('Handed over')
  })
})

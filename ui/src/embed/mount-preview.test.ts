// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync, tick } from 'svelte'
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'
import { createEditor, type Editor } from '@embeddablecut/sdk'
import { mountPreview, type MountedPreview } from './mount-preview'

let editor: Editor | null = null
let preview: MountedPreview | null = null

beforeAll(() => {
  // jsdom has no constructable stylesheets.
  if (!('replaceSync' in CSSStyleSheet.prototype)) {
    Object.assign(CSSStyleSheet.prototype, { replaceSync() {} })
  }
})

afterEach(async () => {
  await preview?.unmount()
  preview = null
  editor?.dispose()
  editor = null
  document.body.innerHTML = ''
})

async function editorWithTitle(): Promise<Editor> {
  const created = await createEditor()
  await created.createProject({ name: 'Preview', width: 1280, height: 720, fps: 30 })
  created.apply([
    { op: 'addTrack', callerId: 'track', kind: 'video' },
    {
      op: 'addText',
      trackId: { $ref: 'track#/detail/trackId' },
      text: 'Hello preview',
      durationInFrames: 60,
    },
  ])
  return created
}

async function settle() {
  flushSync()
  await tick()
}

describe('mountPreview', () => {
  it('plays the editor composition in its own shadow root, following the playback store', async () => {
    editor = await editorWithTitle()
    const target = document.createElement('div')
    document.body.append(target)

    preview = mountPreview(target, { editor })
    await settle()

    const shadow = target.querySelector<HTMLElement>('.ec-host')!.shadowRoot!
    expect(document.querySelector('[data-player-container]')).toBeNull()
    expect(shadow.querySelector('[data-player-container]')).not.toBeNull()
    expect(shadow.textContent).toContain('Hello preview')

    // The text runs frames 0-59: seeking past it unmounts its sequence.
    editor.seek(90)
    await settle()
    expect(shadow.textContent).not.toContain('Hello preview')

    editor.seek(10)
    await settle()
    expect(shadow.textContent).toContain('Hello preview')

    await preview.unmount()
    preview = null
    expect(target.querySelector('.ec-host')).toBeNull()
  })

  it('renders straight into the target without isolation', async () => {
    editor = await editorWithTitle()
    const target = document.createElement('div')
    document.body.append(target)

    preview = mountPreview(target, { editor, isolation: 'none' })
    await settle()

    expect(target.querySelector('.ec-root [data-embedded-preview]')).not.toBeNull()
    expect(target.textContent).toContain('Hello preview')
  })
})

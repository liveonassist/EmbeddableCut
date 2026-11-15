// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { flushSync } from 'svelte'
import type { Editor } from '@embeddablecut/sdk'
import { HOTKEYS } from '@/config/hotkeys'
import type { TimelineItem } from '@/types/timeline'
import { useItemsStore } from '@/features/timeline/stores/items-store'
import { useSelectionStore } from '@/shared/state/selection'
import { FeatureGate } from './feature-gate.svelte'

const editor = {} as Editor
const stream = { id: 'stream', type: 'video', trackId: 't', from: 0, durationInFrames: 30 }
const title = { id: 'title', type: 'text', trackId: 't', from: 0, durationInFrames: 30 }

describe('FeatureGate', () => {
  let gate: FeatureGate | null = null

  beforeEach(() => {
    useItemsStore.getState().setItems([stream, title] as TimelineItem[])
    useSelectionStore.getState().clearSelection()
  })

  afterEach(() => {
    gate?.dispose()
    gate = null
  })

  it('takes the most restrictive of a feature, its parents and its siblings', () => {
    gate = new FeatureGate(editor, { ai: 'locked', 'sidebar.ai': false, toolbar: 'locked' })

    expect(gate.mode('ai.generate')).toBe('locked')
    expect(gate.mode(['sidebar.ai', 'ai.generate'])).toBe('hidden')
    expect(gate.mode('toolbar.settings')).toBe('locked')
    expect(gate.mode('sidebar.text')).toBe('on')

    gate.set({})
    expect(gate.mode('toolbar.settings')).toBe('on')
  })

  it('asks predicates about the selection, and gates their shortcuts as it changes', () => {
    gate = new FeatureGate(editor, {
      'clip.delete': ({ items }) => !items.some((item) => item.id === 'stream'),
    })
    const deleteKey = () => gate!.gateHotkeys(HOTKEYS).DELETE_SELECTED

    useSelectionStore.getState().selectItems(['title'])
    flushSync()
    expect(gate.mode('clip.delete')).toBe('on')
    expect(deleteKey()).toBe(HOTKEYS.DELETE_SELECTED)

    useSelectionStore.getState().selectItems(['title', 'stream'])
    flushSync()
    expect(gate.mode('clip.delete')).toBe('hidden')
    expect(deleteKey()).toBe('')
    // Shortcuts of features left on keep their bindings.
    expect(gate.gateHotkeys(HOTKEYS).UNDO).toBe(HOTKEYS.UNDO)
    // A target the UI names takes the selection's place.
    expect(gate.mode('clip.delete', { items: [title as TimelineItem] })).toBe('on')
  })
})

// SPDX-License-Identifier: MIT
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const storage = vi.hoisted(() => ({ updateProject: vi.fn(async () => ({})) }))
vi.mock('@/infrastructure/storage', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  ...storage,
}))

import { useProjectStore } from '@/features/timeline/deps/projects'
import { setDetachedProject } from '@/shared/projects/detached-project'
import type { TimelineItem } from '@/types/timeline'
import { resetTimelineCompositionTestState, setTimelineState } from '../../test-helpers'
import { useCompositionNavigationStore } from '../composition-navigation-store'
import { useCompositionsStore, type SubComposition } from '../compositions-store'
import { useItemsStore } from '../items-store'
import { useTimelineCommandStore } from '../timeline-command-store'
import { useTimelineSettingsStore } from '../timeline-settings-store'
import { changeProjectSettings, getCanvasFraming } from './project-settings-actions'

const metadata = () => useProjectStore.getState().currentProject!.metadata

function composition(id: string, fps: number): SubComposition {
  return {
    id,
    name: id,
    items: [
      { id: `${id}-text`, type: 'text', trackId: 't', from: 0, durationInFrames: fps, label: '' },
    ] as TimelineItem[],
    tracks: [],
    transitions: [],
    keyframes: [],
    fps,
    width: 1920,
    height: 1080,
    durationInFrames: fps,
  }
}

function wrapper(id: string, compositionId: string, from: number, fps: number): TimelineItem {
  return {
    id,
    type: 'composition',
    trackId: 'v1',
    from,
    durationInFrames: 30,
    label: id,
    compositionId,
    compositionWidth: 1920,
    compositionHeight: 1080,
    sourceStart: 0,
    sourceEnd: fps,
    sourceDuration: fps,
    sourceFps: fps,
  } as TimelineItem
}

describe('changeProjectSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetTimelineCompositionTestState()
    setDetachedProject('doc')
    useProjectStore.setState({
      currentProject: {
        id: 'doc',
        name: 'Doc',
        description: '',
        createdAt: 0,
        updatedAt: 0,
        duration: 0,
        metadata: { width: 1920, height: 1080, fps: 30 },
      },
    })
    useCompositionsStore
      .getState()
      .setCompositions([composition('same', 30), composition('own', 24)])
    setTimelineState({
      fps: 30,
      items: [wrapper('w1', 'same', 0, 30), wrapper('w2', 'own', 30, 24)],
    })
    useTimelineCommandStore.getState().clearHistory()
  })

  it('converts the timeline and the compositions at its rate in one undo step', () => {
    changeProjectSettings({ fps: 60, width: 1080, height: 1920 })
    expect(metadata()).toMatchObject({ fps: 60, width: 1080, height: 1920 })
    expect(useTimelineSettingsStore.getState()).toMatchObject({ fps: 60, isDirty: true })
    expect(useItemsStore.getState().items).toMatchObject([
      { from: 0, durationInFrames: 60, sourceEnd: 60, sourceFps: 60 },
      // A composition with a rate of its own keeps it, and its wrapper's source with it.
      { from: 60, durationInFrames: 60, sourceEnd: 24, sourceFps: 24 },
    ])
    const { compositionById } = useCompositionsStore.getState()
    expect(compositionById.same).toMatchObject({ fps: 60, durationInFrames: 60 })
    expect(compositionById.same!.items[0]).toMatchObject({ durationInFrames: 60 })
    expect(compositionById.own).toMatchObject({ fps: 24, durationInFrames: 24 })

    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(1)
    useTimelineCommandStore.getState().undo()
    expect(metadata()).toMatchObject({ fps: 30, width: 1920, height: 1080 })
    expect(useTimelineSettingsStore.getState().fps).toBe(30)
    expect(useCompositionsStore.getState().compositionById.same).toMatchObject({ fps: 30 })
    useTimelineCommandStore.getState().redo()
    expect(metadata().fps).toBe(60)
    expect(storage.updateProject).not.toHaveBeenCalled()
  })

  it('changes Main from inside a composition, dropping history no undo there could apply', () => {
    useCompositionNavigationStore.getState().enterComposition('same', 'Same')
    useTimelineCommandStore.getState().execute({ type: 'EDIT' }, () => {
      useItemsStore.getState().setItems([])
    })
    changeProjectSettings({ fps: 60 })
    expect(useCompositionNavigationStore.getState().activeCompositionId).toBeNull()
    expect(useItemsStore.getState().items).toHaveLength(2)
    expect(useTimelineCommandStore.getState().stacksByContext).toEqual({})
  })

  it('keeps filling across a canvas the clips match', () => {
    changeProjectSettings({ width: 1080, height: 1920, framing: 'fill' })
    expect(getCanvasFraming()).toBe('fill')
    changeProjectSettings({ width: 1920, height: 1080 })
    expect(getCanvasFraming()).toBeNull()
    changeProjectSettings({ width: 1080, height: 1080 })
    expect(getCanvasFraming()).toBe('fill')
    changeProjectSettings({ framing: 'fit' })
    expect(getCanvasFraming()).toBe('fit')
  })

  it('persists a workspace project, and records nothing when nothing changes', () => {
    setDetachedProject(null)
    changeProjectSettings({ width: 1920, fps: 30 })
    expect(useTimelineCommandStore.getState().undoStack).toHaveLength(0)
    changeProjectSettings({ width: 1281, height: 720 })
    expect(storage.updateProject).toHaveBeenCalledWith('doc', {
      metadata: expect.objectContaining({ width: 1282, height: 720 }),
    })
  })
})

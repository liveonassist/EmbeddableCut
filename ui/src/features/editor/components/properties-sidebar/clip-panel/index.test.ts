// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useEditorStore } from '@/shared/state/editor'
import { useSelectionStore } from '@/shared/state/selection'
import { useItemsStore } from '@/features/editor/deps/timeline-store'
import { setTimelineState } from '@/features/editor/deps/timeline-test-helpers-contract'
import { useGizmoStore } from '@/features/editor/deps/preview'
import type {
  AudioItem,
  CompositionItem,
  ControllerItem,
  TimelineItem,
  VideoItem,
} from '@/types/timeline'
import { clipPanelTestState } from './index.test-state'
import ClipPanel from './index.svelte'

const act = (fn: () => void) => flushSync(fn)

vi.mock('./layout-section.svelte', async () => ({
  default: (await import('./index-layout-section.stub.svelte')).default,
}))

vi.mock('./fill-section.svelte', async () => ({
  default: (await import('../text-stub')).textStub('Fill Body'),
}))

vi.mock('./corner-pin-section.svelte', async () => ({
  default: (await import('../text-stub')).textStub('Corner Pin Body'),
}))

vi.mock('./video-section.svelte', async () => ({
  default: (await import('../text-stub')).textStub('Video Body'),
}))

vi.mock('./gif-section.svelte', async () => ({
  default: (await import('../text-stub')).textStub('Gif Body'),
}))

vi.mock('./composition-controls-section.svelte', async () => ({
  default: (await import('../text-stub')).textStub(''),
}))

vi.mock('./audio-section.svelte', async () => ({
  default: (await import('./index-audio-section.stub.svelte')).default,
}))

vi.mock('./text-section', async () => {
  const { textStub } = await import('../text-stub')
  return {
    TextContentSection: (await import('./index-text-content-section.stub.svelte')).default,
    TextStyleSection: textStub('Text Style Body'),
    TextEffectsSection: textStub('Text Effects Body'),
  }
})

vi.mock('./shape-section.svelte', async () => ({
  default: (await import('../text-stub')).textStub('Shape Body'),
}))

vi.mock('../../animate-workspace/animation-preset-library.svelte', async () => ({
  default: (await import('./index-animation-preset-library.stub.svelte')).default,
}))

vi.mock('@/features/editor/deps/effects-contract', async () => ({
  EffectsSection: (await import('../text-stub')).textStub('Effects Body'),
}))

vi.mock('../inspector-contributions.svelte', async () => ({
  default: (await import('./index-inspector-contributions.stub.svelte')).default,
}))

const VIDEO_ITEM: VideoItem = {
  id: 'clip-video-1',
  type: 'video',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 90,
  label: 'clip.mp4',
  src: 'blob:video',
  mediaId: 'media-video-1',
}

const AUDIO_ITEM: AudioItem = {
  id: 'clip-audio-1',
  type: 'audio',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 90,
  label: 'clip.wav',
  src: 'blob:audio',
  mediaId: 'media-audio-1',
}

const COMPOSITION_ITEM: CompositionItem = {
  id: 'composition-1',
  type: 'composition',
  trackId: 'track-1',
  from: 0,
  durationInFrames: 90,
  label: 'Compound clip',
  compositionId: 'nested-1',
  compositionWidth: 1920,
  compositionHeight: 1080,
}

const NULL_OBJECT: ControllerItem = {
  id: 'null-1',
  type: 'controller',
  controllerKind: 'null',
  trackId: 'null-track',
  from: 0,
  durationInFrames: 90,
  label: 'Null Object',
  transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
}

const TRANSFORM_REFERENCE = { x: 0, y: 0, width: 1920, height: 1080, rotation: 0 }

async function activateTab(name: 'Animate' | 'Animation' | 'Audio' | 'Effects' | 'Video') {
  await fireEvent.click(screen.getByRole('tab', { name }))
}

function resetStores(items: TimelineItem[], selectedItemIds: string[]) {
  useEditorStore.setState({
    workspace: 'edit',
    clipInspectorTab: 'video',
    linkedSelectionEnabled: true,
  })

  useSelectionStore.setState({
    selectedItemIds,
    selectedMarkerId: null,
    selectedTransitionId: null,
    selectedTrackId: null,
    selectedTrackIds: [],
    activeTrackId: null,
    selectionType: selectedItemIds.length > 0 ? 'item' : null,
    dragState: null,
  })

  setTimelineState({
    fps: 30,
    items,
    keyframes: [],
  })
}

describe('ClipPanel inspector tabs', () => {
  beforeEach(() => {
    clipPanelTestState.layoutRenderCount = 0
    clipPanelTestState.latestLayoutItemId = null
    clipPanelTestState.latestLayoutX = null
    clipPanelTestState.nextIdleCallbackId = 1
    clipPanelTestState.idleCallbacks.clear()
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
      const callbackId = clipPanelTestState.nextIdleCallbackId
      clipPanelTestState.nextIdleCallbackId += 1
      clipPanelTestState.idleCallbacks.set(callbackId, callback)
      return callbackId
    })
    vi.stubGlobal('cancelIdleCallback', (callbackId: number) => {
      clipPanelTestState.idleCallbacks.delete(callbackId)
    })
    useGizmoStore.setState({
      activeGizmo: null,
      previewTransform: null,
      presentationHandoff: null,
      preview: null,
    })
    resetStores([VIDEO_ITEM], [VIDEO_ITEM.id])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves the caret when text is edited in the middle', async () => {
    const item = {
      id: 'text-1',
      type: 'text' as const,
      trackId: 'track-1',
      from: 0,
      durationInFrames: 90,
      label: 'Hello',
      text: 'Hello',
      color: '#ffffff',
    }
    resetStores([item], [item.id])
    render(ClipPanel)

    const field = (await screen.findByRole('textbox', {
      name: 'Text content',
    })) as HTMLTextAreaElement
    field.focus()
    await fireEvent.input(field, {
      target: { value: 'HeXllo', selectionStart: 3, selectionEnd: 3 },
    })

    expect(field.value).toBe('HeXllo')
    expect(field.selectionStart).toBe(3)
    expect(field.selectionEnd).toBe(3)
  })

  it('keeps the full inspector idle across repeated gizmo translate commits', async () => {
    resetStores([NULL_OBJECT], [NULL_OBJECT.id])
    render(ClipPanel)

    const initialRenderCount = clipPanelTestState.layoutRenderCount
    const startTransform = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
    }

    for (const [x, y] of [
      [120, 80],
      [260, 170],
      [410, 230],
    ] as const) {
      act(() => {
        const interactionId = useGizmoStore
          .getState()
          .startTranslate(NULL_OBJECT.id, { x: 0, y: 0 }, startTransform)
        useGizmoStore.setState({
          previewTransform: { ...startTransform, x, y },
        })
        useItemsStore.getState()._updateItemTransform(NULL_OBJECT.id, { x, y })
        useGizmoStore.getState().clearInteraction(interactionId)
        useGizmoStore.getState().completePresentationHandoff(interactionId)
      })
    }

    expect(clipPanelTestState.layoutRenderCount).toBe(initialRenderCount)
    expect(clipPanelTestState.latestLayoutX).toBe(0)

    expect(clipPanelTestState.idleCallbacks.size).toBe(1)
    act(() => {
      const callbacks = [...clipPanelTestState.idleCallbacks.values()]
      clipPanelTestState.idleCallbacks.clear()
      for (const callback of callbacks) {
        callback({
          didTimeout: false,
          timeRemaining: () => 50,
        })
      }
    })

    await waitFor(() => {
      expect(clipPanelTestState.layoutRenderCount).toBeGreaterThan(initialRenderCount)
      expect(clipPanelTestState.latestLayoutX).toBe(410)
    })
    const caughtUpRenderCount = clipPanelTestState.layoutRenderCount

    // A later non-gizmo x/y write can be undo/redo or an inspector edit. The
    // completed interaction ID must not cause that canonical change to be
    // swallowed just because its presentation handoff is still retained.
    act(() => {
      useItemsStore.getState()._updateItemTransform(NULL_OBJECT.id, { x: 0, y: 0 })
    })

    await waitFor(() => {
      expect(clipPanelTestState.layoutRenderCount).toBeGreaterThan(caughtUpRenderCount)
      expect(clipPanelTestState.latestLayoutX).toBe(0)
    })
  })

  it('shows a newly selected item without waiting for deferred inspector work', async () => {
    const secondVideo: VideoItem = {
      ...VIDEO_ITEM,
      id: 'clip-video-2',
      trackId: 'track-2',
      label: 'second.mp4',
    }
    resetStores([VIDEO_ITEM, secondVideo], [VIDEO_ITEM.id])
    render(ClipPanel)

    expect(clipPanelTestState.latestLayoutItemId).toBe(VIDEO_ITEM.id)

    flushSync(() => {
      useSelectionStore.getState().selectItems([secondVideo.id])
    })
    expect(clipPanelTestState.latestLayoutItemId).toBe(secondVideo.id)
  })

  it('restores the last selected clip tab after deselecting and reselecting', async () => {
    render(ClipPanel)

    await activateTab('Effects')

    expect(screen.getByText('Effects Body')).toBeInTheDocument()
    expect(useEditorStore.getState().clipInspectorTab).toBe('effects')

    act(() => {
      useSelectionStore.getState().selectItems([])
    })

    await waitFor(() => {
      expect(screen.queryByText('Effects Body')).not.toBeInTheDocument()
    })
    expect(useEditorStore.getState().clipInspectorTab).toBe('effects')

    act(() => {
      useSelectionStore.getState().selectItems([VIDEO_ITEM.id])
    })

    await waitFor(() => {
      expect(screen.getByText('Effects Body')).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Effects' })).toHaveAttribute('data-state', 'active')
  })

  it('falls back to the first valid tab and updates the remembered tab', async () => {
    useEditorStore.getState().setClipInspectorTab('video')
    resetStores([AUDIO_ITEM], [AUDIO_ITEM.id])

    render(ClipPanel)

    await waitFor(() => {
      expect(screen.getByText('Audio Body')).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Audio' })).toHaveAttribute('data-state', 'active')
    expect(useEditorStore.getState().clipInspectorTab).toBe('audio')
  })

  it('shows visual media controls for a compound-only selection', async () => {
    resetStores([COMPOSITION_ITEM], [COMPOSITION_ITEM.id])

    render(ClipPanel)

    expect(screen.getByText('Video Body')).toBeInTheDocument()
  })

  it('embeds the complete motion library as a selected-layer tab in Motion', async () => {
    useEditorStore.setState({ workspace: 'motion' })

    render(ClipPanel)

    expect(screen.getByRole('tab', { name: 'Properties' })).toHaveAttribute('data-state', 'active')
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Properties',
      'Audio',
      'Animate',
      'Effects',
    ])

    await activateTab('Animate')

    expect(await screen.findByTestId('motion-library-mock')).toHaveAttribute(
      'data-embedded',
      'true',
    )
    expect(useEditorStore.getState().clipInspectorTab).toBe('motion')
    expect(screen.queryByText('Parenting')).not.toBeInTheDocument()
  })

  it('opens the compact clip-level Animation surface for an animated clip in Edit', async () => {
    const animatedVideo: VideoItem = {
      ...VIDEO_ITEM,
      motionModifiers: [
        {
          id: 'float-drift-1',
          type: 'float-drift',
          enabled: true,
          amplitude: 1,
          frequency: 0.5,
          phaseFrames: 0,
          seed: 7,
        },
      ],
    }
    resetStores([animatedVideo], [animatedVideo.id])

    render(ClipPanel)

    await activateTab('Animation')

    expect(await screen.findByTestId('motion-library-mock')).toHaveAttribute('data-variant', 'edit')
    expect(useEditorStore.getState().clipInspectorTab).toBe('motion')
  })

  it('always exposes Animation for an ordinary visual clip in Edit', async () => {
    render(ClipPanel)

    expect(screen.getByRole('tab', { name: 'Animation' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Motion' })).not.toBeInTheDocument()
  })

  it('edits the hidden linked-audio companion through the visual clip Audio tab', async () => {
    const linkedVideo: VideoItem = { ...VIDEO_ITEM, linkedGroupId: 'av-1' }
    const linkedAudio: AudioItem = { ...AUDIO_ITEM, linkedGroupId: 'av-1' }
    resetStores([linkedVideo, linkedAudio], [linkedVideo.id])

    render(ClipPanel)
    await activateTab('Audio')

    expect(screen.getByTestId('audio-body')).toHaveAttribute('data-item-ids', linkedAudio.id)
  })

  it('hides parenting from an ordinary unparented clip in Edit', async () => {
    render(ClipPanel)

    expect(screen.queryByText('Parenting')).not.toBeInTheDocument()
  })

  it('does not duplicate an existing parent relationship in the Edit inspector', async () => {
    const parentedVideo: VideoItem = {
      ...VIDEO_ITEM,
      transformParent: {
        parentItemId: NULL_OBJECT.id,
        parentReference: TRANSFORM_REFERENCE,
        childLocalReference: TRANSFORM_REFERENCE,
        childWorldReference: TRANSFORM_REFERENCE,
      },
    }
    resetStores([NULL_OBJECT, parentedVideo], [parentedVideo.id])

    render(ClipPanel)

    expect(screen.queryByText('Parenting')).not.toBeInTheDocument()
  })

  it('names the invisible rig layer as a Null Object', async () => {
    resetStores([NULL_OBJECT], [NULL_OBJECT.id])

    render(ClipPanel)

    expect(screen.getByRole('tab', { name: 'Null Object' })).toBeInTheDocument()
  })

  it('does not duplicate parenting for a multi-layer Motion selection', async () => {
    const secondVideo: VideoItem = {
      ...VIDEO_ITEM,
      id: 'clip-video-2',
      trackId: 'track-2',
      label: 'second.mp4',
    }
    resetStores([VIDEO_ITEM, secondVideo], [VIDEO_ITEM.id, secondVideo.id])
    useEditorStore.setState({ workspace: 'motion' })

    render(ClipPanel)
    await activateTab('Animate')

    expect(screen.queryByText('Parenting')).not.toBeInTheDocument()
  })
  it('offers host and extension inspector sections for a single selected clip', () => {
    render(ClipPanel)

    expect(screen.getByTestId('inspector-contributions')).toHaveAttribute(
      'data-item-id',
      VIDEO_ITEM.id,
    )
  })

  it('leaves contributed inspector sections out of a multi-clip selection', () => {
    const secondVideo: VideoItem = { ...VIDEO_ITEM, id: 'clip-video-2', trackId: 'track-2' }
    resetStores([VIDEO_ITEM, secondVideo], [VIDEO_ITEM.id, secondVideo.id])

    render(ClipPanel)

    expect(screen.getByText('Layout Body')).toBeInTheDocument()
    expect(screen.queryByTestId('inspector-contributions')).not.toBeInTheDocument()
  })
})

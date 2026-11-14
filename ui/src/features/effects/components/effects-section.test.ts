// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ItemEffect } from '@/types/effects'
import type { TimelineItem } from '@/types/timeline'
import EffectsSection from './effects-section.svelte'

const mocks = vi.hoisted(() => {
  const store = <S>(state: S) => ({ getState: () => state, subscribe: () => () => {} })
  const timelineState = {
    addEffect: vi.fn(),
    addEffects: vi.fn(),
    updateEffect: vi.fn(),
    removeEffect: vi.fn(),
    toggleEffect: vi.fn(),
    setItemEffects: vi.fn(),
    applyAutoKeyframeOperations: vi.fn(),
    items: [],
  }
  const gizmoState = {
    setEffectsPreviewNew: vi.fn(),
    clearPreview: vi.fn(),
  }
  const powerWindowEditorState = {
    startEditing: vi.fn(),
  }
  const spatialEffectEditorState = {
    stopEditing: vi.fn(),
  }
  const presetsState = {
    presets: [],
    loadPresets: vi.fn(() => Promise.resolve()),
    removePreset: vi.fn(() => Promise.resolve()),
  }
  return {
    store,
    timelineState,
    gizmoState,
    powerWindowEditorState,
    spatialEffectEditorState,
    presetsState,
  }
})

vi.mock('@/features/effects/deps/timeline-contract', () => ({
  addEffect: mocks.timelineState.addEffect,
  addEffects: mocks.timelineState.addEffects,
  applyAutoKeyframeOperations: mocks.timelineState.applyAutoKeyframeOperations,
  removeEffect: mocks.timelineState.removeEffect,
  setItemEffects: mocks.timelineState.setItemEffects,
  toggleEffect: mocks.timelineState.toggleEffect,
  updateEffect: mocks.timelineState.updateEffect,
  useItemsStore: mocks.store(mocks.timelineState),
}))

vi.mock('@/features/effects/deps/preview-contract', () => ({
  useGizmoStore: mocks.store(mocks.gizmoState),
  usePowerWindowEditorStore: mocks.store(mocks.powerWindowEditorState),
  useSpatialEffectEditorStore: mocks.store(mocks.spatialEffectEditorState),
  useThrottledFrame: () => ({ current: 24 }),
}))

vi.mock('../hooks/use-keyframes-by-item-id.svelte', () => ({
  useKeyframesByItemId: () => ({ current: new Map() }),
}))

vi.mock('../hooks/use-gpu-effect-preview-data.svelte', () => ({
  useGpuEffectPreviewData: () => ({
    gpuCategories: [],
    triggerPreviews: vi.fn(),
  }),
}))

vi.mock('@/features/effects/stores/user-presets-store', () => ({
  useUserPresetsStore: mocks.store(mocks.presetsState),
}))

vi.mock('./panels', async () => {
  const Panel = (await import('./effect-panel.stub.svelte')).default
  return {
    GpuEffectPanel: Panel,
    GpuWheelsPanel: Panel,
    GpuCurvesPanel: Panel,
    GpuLutPanel: Panel,
    GpuGradientMapPanel: Panel,
    GpuPowerWindowPanel: Panel,
    GpuSecondaryQualifierPanel: Panel,
  }
})

function makeEffect(id: string, gpuEffectType: string): ItemEffect {
  return {
    id,
    enabled: true,
    effect: { type: 'gpu-effect', gpuEffectType, params: {} },
  }
}

function makeItem(id: string, effects: ItemEffect[]): TimelineItem {
  return {
    id,
    type: 'video',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 120,
    label: `${id}.mp4`,
    src: `blob:${id}`,
    mediaId: `${id}-media`,
    effects,
  }
}

describe('EffectsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reorders visible effects across selected items while preserving hidden color dock effects', async () => {
    const hiddenWheels = makeEffect('wheels-a', 'gpu-color-wheels')
    const blurA = makeEffect('blur-a', 'gpu-gaussian-blur')
    const lutA = makeEffect('lut-a', 'gpu-lut')
    const brightnessA = makeEffect('brightness-a', 'gpu-brightness')
    const blurB = makeEffect('blur-b', 'gpu-gaussian-blur')
    const lutB = makeEffect('lut-b', 'gpu-lut')
    const brightnessB = makeEffect('brightness-b', 'gpu-brightness')

    render(EffectsSection, {
      hiddenGpuEffectTypes: ['gpu-color-wheels'],
      items: [
        makeItem('clip-a', [hiddenWheels, blurA, lutA, brightnessA]),
        makeItem('clip-b', [blurB, lutB, brightnessB]),
      ],
    })

    await fireEvent.click(screen.getByText('move lut-a up'))

    expect(mocks.timelineState.setItemEffects).toHaveBeenCalledWith([
      { itemId: 'clip-a', effects: [hiddenWheels, lutA, blurA, brightnessA] },
      { itemId: 'clip-b', effects: [lutB, blurB, brightnessB] },
    ])
  })
})

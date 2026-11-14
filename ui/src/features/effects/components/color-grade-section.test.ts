// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ItemEffect } from '@/types/effects'
import type { TimelineItem } from '@/types/timeline'
import { useGradeClipboardStore } from '@/shared/state/grade-clipboard'
import ColorGradeSection from './color-grade-section.svelte'

type ColorGradeComparisonMode = 'off' | 'before' | 'split'

const mocks = vi.hoisted(() => {
  const store = <S>(state: S) => ({ getState: () => state, subscribe: () => () => {} })
  const timelineState = {
    addEffects: vi.fn(),
    setItemEffects: vi.fn(),
    updateEffect: vi.fn(),
    removeEffect: vi.fn(),
    toggleEffect: vi.fn(),
    applyAutoKeyframeOperations: vi.fn(),
  }
  const gizmoState = {
    setEffectsPreviewNew: vi.fn(),
    clearPreview: vi.fn(),
    colorGradeComparisonMode: 'off' as ColorGradeComparisonMode,
    setColorGradeComparisonMode: vi.fn(),
  }
  const presetsState = {
    presets: [],
    loadPresets: vi.fn(() => Promise.resolve()),
    addPreset: vi.fn(() => Promise.resolve(null)),
    removePreset: vi.fn(() => Promise.resolve()),
  }
  return { store, timelineState, gizmoState, presetsState }
})

vi.mock('@/features/effects/deps/timeline-contract', () => ({
  addEffects: mocks.timelineState.addEffects,
  applyAutoKeyframeOperations: mocks.timelineState.applyAutoKeyframeOperations,
  removeEffect: mocks.timelineState.removeEffect,
  setItemEffects: mocks.timelineState.setItemEffects,
  toggleEffect: mocks.timelineState.toggleEffect,
  updateEffect: mocks.timelineState.updateEffect,
}))

vi.mock('@/features/effects/deps/preview-contract', () => ({
  useGizmoStore: mocks.store(mocks.gizmoState),
  useThrottledFrame: () => ({ current: 12 }),
}))

vi.mock('../hooks/use-keyframes-by-item-id.svelte', () => ({
  useKeyframesByItemId: () => ({ current: new Map() }),
}))

vi.mock('@/features/effects/stores/user-presets-store', () => ({
  useUserPresetsStore: mocks.store(mocks.presetsState),
}))

vi.mock('./panels', async () => ({
  GpuWheelsPanel: (await import('./wheels-panel.stub.svelte')).default,
  GpuCurvesPanel: (await import('./curves-panel.stub.svelte')).default,
}))

function makeVideoItem(effects: ItemEffect[] = [], id = 'clip-1'): TimelineItem {
  return {
    id,
    type: 'video',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 120,
    label: 'clip.mp4',
    src: 'blob:clip',
    mediaId: 'media-1',
    effects,
  }
}

describe('ColorGradeSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGradeClipboardStore.getState().setGrade([])
    mocks.gizmoState.colorGradeComparisonMode = 'off'
  })

  it('keeps copy and paste grade actions visible in the color panel', async () => {
    render(ColorGradeSection, { items: [makeVideoItem()] })

    expect(screen.getByRole('button', { name: 'Copy grade' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Paste grade' })).toBeDisabled()
  })

  it('disables split comparison until an enabled color grade exists', async () => {
    render(ColorGradeSection, { items: [makeVideoItem()] })

    const splitButton = screen.getByRole('button', {
      name: 'Add or enable a color grade to use split comparison',
    })
    expect(splitButton).toBeDisabled()
    // Browsers never dispatch clicks to a disabled button; jsdom's fireEvent
    // does (React filtered it in its own event system), so don't click here.
    expect(mocks.gizmoState.setColorGradeComparisonMode).not.toHaveBeenCalled()
  })

  it('enables split comparison for clips with an active color grade', async () => {
    const gradeEffect: ItemEffect = {
      id: 'grade-1',
      enabled: true,
      effect: {
        type: 'gpu-effect',
        gpuEffectType: 'gpu-color-wheels',
        params: { lift: 0.2 },
      },
    }

    render(ColorGradeSection, { items: [makeVideoItem([gradeEffect])] })

    const splitButton = screen.getByRole('button', {
      name: 'Show ungraded before on the left and graded after on the right',
    })
    expect(splitButton).toBeEnabled()
    await fireEvent.click(splitButton)
    expect(mocks.gizmoState.setColorGradeComparisonMode).toHaveBeenCalledWith('split')
  })

  it('falls back to after when split comparison has no active grade to compare', async () => {
    mocks.gizmoState.colorGradeComparisonMode = 'split'

    render(ColorGradeSection, { items: [makeVideoItem()] })

    expect(mocks.gizmoState.setColorGradeComparisonMode).toHaveBeenCalledWith('off')
  })

  it('keeps split disabled for disabled color grades', async () => {
    const disabledGradeEffect: ItemEffect = {
      id: 'grade-1',
      enabled: false,
      effect: {
        type: 'gpu-effect',
        gpuEffectType: 'gpu-color-wheels',
        params: { lift: 0.2 },
      },
    }

    render(ColorGradeSection, { items: [makeVideoItem([disabledGradeEffect])] })

    expect(
      screen.getByRole('button', {
        name: 'Add or enable a color grade to use split comparison',
      }),
    ).toBeDisabled()
  })

  it('previews and creates a single color wheels effect on first adjustment', async () => {
    render(ColorGradeSection, { items: [makeVideoItem()] })

    await fireEvent.click(screen.getByText('live wheels'))
    expect(mocks.gizmoState.setEffectsPreviewNew).toHaveBeenCalledWith({
      'clip-1': [
        expect.objectContaining({
          id: '__grade:gpu-color-wheels__',
          effect: expect.objectContaining({
            gpuEffectType: 'gpu-color-wheels',
            params: expect.objectContaining({ lift: 0.1 }),
          }),
        }),
      ],
    })
    expect(mocks.timelineState.addEffects).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByText('commit wheels'))
    expect(mocks.timelineState.addEffects).toHaveBeenCalledTimes(1)
    expect(mocks.timelineState.addEffects).toHaveBeenCalledWith([
      {
        itemId: 'clip-1',
        effects: [
          expect.objectContaining({
            gpuEffectType: 'gpu-color-wheels',
            params: expect.objectContaining({ lift: 0.1 }),
          }),
        ],
      },
    ])
  })

  it('updates an existing curves effect instead of adding a duplicate', async () => {
    const curves: ItemEffect = {
      id: 'curves-1',
      enabled: true,
      effect: {
        type: 'gpu-effect',
        gpuEffectType: 'gpu-curves',
        params: { masterPoints: '[[0,0],[1,1]]' },
      },
    }
    render(ColorGradeSection, { items: [makeVideoItem([curves])] })

    expect(screen.getByTestId('curves-panel')).toHaveAttribute('data-effect-id', 'curves-1')
    await fireEvent.click(screen.getByText('commit curves'))

    expect(mocks.timelineState.updateEffect).toHaveBeenCalledWith('clip-1', 'curves-1', {
      effect: {
        ...curves.effect,
        params: { masterPoints: '[[0,0],[1,1]]' },
      },
    })
    expect(mocks.timelineState.addEffects).not.toHaveBeenCalled()
  })

  it('copies the selected color grade and pastes it while preserving non-grade effects', async () => {
    const gradeEffect: ItemEffect = {
      id: 'grade-1',
      enabled: true,
      effect: {
        type: 'gpu-effect',
        gpuEffectType: 'gpu-color-wheels',
        params: { lift: 0.2 },
      },
    }
    const targetGradeEffect: ItemEffect = {
      id: 'target-grade-1',
      enabled: true,
      effect: {
        type: 'gpu-effect',
        gpuEffectType: 'gpu-curves',
        params: { masterPoints: '[[0,0],[1,1]]' },
      },
    }
    const targetBlurEffect: ItemEffect = {
      id: 'target-blur-1',
      enabled: true,
      effect: {
        type: 'gpu-effect',
        gpuEffectType: 'gpu-blur',
        params: { radius: 4 },
      },
    }

    render(ColorGradeSection, {
      items: [
        makeVideoItem([gradeEffect], 'clip-source'),
        makeVideoItem([targetGradeEffect, targetBlurEffect], 'clip-target'),
      ],
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Copy grade' }))
    expect(useGradeClipboardStore.getState().grade).toEqual([
      {
        enabled: true,
        effect: {
          type: 'gpu-effect',
          gpuEffectType: 'gpu-color-wheels',
          params: { lift: 0.2 },
        },
      },
    ])

    await fireEvent.click(screen.getByRole('button', { name: 'Paste grade' }))
    expect(mocks.timelineState.setItemEffects).toHaveBeenCalledWith([
      {
        itemId: 'clip-source',
        effects: [
          expect.objectContaining({
            effect: expect.objectContaining({
              gpuEffectType: 'gpu-color-wheels',
              params: { lift: 0.2 },
            }),
          }),
        ],
      },
      {
        itemId: 'clip-target',
        effects: [
          expect.objectContaining({
            effect: expect.objectContaining({
              gpuEffectType: 'gpu-color-wheels',
              params: { lift: 0.2 },
            }),
          }),
          targetBlurEffect,
        ],
      },
    ])
  })
})

// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { getGpuEffect } from '@/infrastructure/gpu-effects'
import type { GpuEffect, ItemEffect } from '@/types/effects'
import { useGizmoStore, usePowerWindowEditorStore } from '@/features/effects/deps/preview-contract'
import GpuPowerWindowPanel from './gpu-power-window-panel.svelte'

const definition = getGpuEffect('gpu-power-window')!

function makeProps(params: Record<string, number | boolean | string> = {}) {
  const gpuEffect: GpuEffect = {
    type: 'gpu-effect',
    gpuEffectType: 'gpu-power-window',
    params,
  }
  const effect: ItemEffect = { id: 'fx-window', effect: gpuEffect, enabled: true }
  return {
    itemIds: ['clip-1'],
    effect,
    gpuEffect,
    definition,
    getKeyframeProperty: vi.fn(() => null),
    onParamChange: vi.fn(),
    onParamLiveChange: vi.fn(),
    onReset: vi.fn(),
    onToggle: vi.fn(),
    onRemove: vi.fn(),
  }
}

describe('GpuPowerWindowPanel', () => {
  beforeEach(() => {
    usePowerWindowEditorStore.getState().stopEditing()
    useGizmoStore.getState().clearPreview()
  })

  it('renders the power window as window, matte, and correction sections', () => {
    render(GpuPowerWindowPanel, makeProps())

    expect(screen.getByText('Power Window')).toBeInTheDocument()
    expect(screen.getByText('Window')).toBeInTheDocument()
    expect(screen.getByText('Matte')).toBeInTheDocument()
    expect(screen.getByText('Correction')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ellipse' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rectangle' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('switches the active window shape', async () => {
    const props = makeProps({ shape: 'ellipse' })
    render(GpuPowerWindowPanel, props)

    await fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))

    expect(props.onParamChange).toHaveBeenCalledWith('fx-window', 'shape', 'rectangle')
  })

  it('resets individual parameters without resetting the whole effect', async () => {
    const props = makeProps({ centerX: 0.72, shape: 'rectangle', invertMask: true })
    render(GpuPowerWindowPanel, props)

    await fireEvent.click(screen.getByRole('button', { name: /reset to defaults: center x/i }))
    await fireEvent.click(screen.getByRole('button', { name: /reset to defaults: shape/i }))
    await fireEvent.click(screen.getByRole('button', { name: /reset to defaults: invert mask/i }))

    expect(props.onParamChange).toHaveBeenCalledWith(
      'fx-window',
      'centerX',
      definition.params.centerX?.default,
    )
    expect(props.onParamChange).toHaveBeenCalledWith(
      'fx-window',
      'shape',
      definition.params.shape?.default,
    )
    expect(props.onParamChange).toHaveBeenCalledWith(
      'fx-window',
      'invertMask',
      definition.params.invertMask?.default,
    )
    expect(props.onReset).not.toHaveBeenCalled()
  })

  it('toggles exclusive on-canvas editing for a single selected item', async () => {
    render(GpuPowerWindowPanel, makeProps())

    const editButton = screen.getByRole('button', { name: 'Edit on canvas' })
    await fireEvent.click(editButton)

    expect(usePowerWindowEditorStore.getState()).toMatchObject({
      isEditing: true,
      editingItemId: 'clip-1',
      editingEffectId: 'fx-window',
    })
    expect(screen.getByRole('button', { name: 'Editing on canvas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await fireEvent.click(screen.getByRole('button', { name: 'Editing on canvas' }))
    expect(usePowerWindowEditorStore.getState().isEditing).toBe(false)
  })

  it('reflects live gizmo geometry in the slider values', () => {
    const props = makeProps({ centerX: 0.5 })
    render(GpuPowerWindowPanel, props)

    useGizmoStore.getState().setEffectsPreviewNew({
      'clip-1': [
        {
          ...props.effect,
          effect: {
            ...props.gpuEffect,
            params: { ...props.gpuEffect.params, centerX: 0.72 },
          },
        },
      ],
    })
    flushSync()

    expect(screen.getByText('0.72')).toBeInTheDocument()
  })

  it('toggles matte preview and inverted matte params', async () => {
    const props = makeProps({ showMask: false, invertMask: false })
    render(GpuPowerWindowPanel, props)

    await fireEvent.click(screen.getByRole('button', { name: 'Show Mask' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Invert Mask' }))

    expect(props.onParamChange).toHaveBeenCalledWith('fx-window', 'showMask', true)
    expect(props.onParamChange).toHaveBeenCalledWith('fx-window', 'invertMask', true)
  })

  it('collapses its controls from the effect header', async () => {
    render(GpuPowerWindowPanel, makeProps())

    const disclosure = screen.getByRole('button', { name: 'Power Window' })
    await fireEvent.click(disclosure)

    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Ellipse' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove effect/i })).toBeInTheDocument()
  })
})

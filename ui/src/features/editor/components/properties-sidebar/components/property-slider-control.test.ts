// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vite-plus/test'
import PropertySliderControl from './property-slider-control.svelte'

vi.mock('@/features/editor/deps/keyframes', async () => ({
  KeyframeToggle: (await import('./keyframe-toggle.stub.svelte')).default,
}))

describe('PropertySliderControl', () => {
  it('composes the shared slider, keyframe action, and reset action', async () => {
    const onReset = vi.fn()
    render(PropertySliderControl, {
      value: 25,
      onChange: vi.fn(),
      min: 0,
      max: 100,
      unit: '%',
      keyframe: { itemIds: ['shape'], property: 'trimPathStart', currentValue: 25 },
      onReset,
      resetLabel: 'Reset to default',
    })

    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByTestId('keyframe-toggle')).toHaveAttribute('data-property', 'trimPathStart')
    await fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('omits optional actions when a property does not support them', () => {
    render(PropertySliderControl, { value: 4, onChange: vi.fn(), min: 0, max: 50, unit: 'px' })

    expect(screen.queryByTestId('keyframe-toggle')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

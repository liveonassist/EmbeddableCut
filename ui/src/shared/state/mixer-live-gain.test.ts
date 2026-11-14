// SPDX-License-Identifier: MIT
// @vitest-environment jsdom

import { flushSync } from 'svelte'
import { render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  clearMixerLiveGain,
  clearMixerLiveGainLayer,
  clearMixerLiveGains,
  setMixerLiveGainLayer,
  setMixerLiveGains,
} from './mixer-live-gain'
import GainProbe from './mixer-live-gain.harness.svelte'

function update(fn: () => void) {
  fn()
  flushSync()
}

describe('mixer-live-gain', () => {
  afterEach(() => {
    update(() => clearMixerLiveGains())
  })

  it('re-runs only the subscribed item when live gain changes', () => {
    let renderCountA = 0
    let renderCountB = 0

    render(GainProbe, { itemId: 'item-a', testId: 'gain-a', onRender: () => (renderCountA += 1) })
    render(GainProbe, { itemId: 'item-b', testId: 'gain-b', onRender: () => (renderCountB += 1) })

    expect(screen.getByTestId('gain-a').textContent).toBe('1')
    expect(screen.getByTestId('gain-b').textContent).toBe('1')
    expect(renderCountA).toBe(1)
    expect(renderCountB).toBe(1)

    update(() => setMixerLiveGains([{ itemId: 'item-a', gain: 0.5 }]))

    expect(screen.getByTestId('gain-a').textContent).toBe('0.5')
    expect(screen.getByTestId('gain-b').textContent).toBe('1')
    expect(renderCountA).toBe(2)
    expect(renderCountB).toBe(1)

    update(() => setMixerLiveGains([{ itemId: 'item-a', gain: 0.5 }]))

    expect(renderCountA).toBe(2)
    expect(renderCountB).toBe(1)

    update(() => clearMixerLiveGain('item-a'))

    expect(screen.getByTestId('gain-a').textContent).toBe('1')
    expect(screen.getByTestId('gain-b').textContent).toBe('1')
    expect(renderCountA).toBe(3)
    expect(renderCountB).toBe(1)
  })

  it('clears unity gains without notifying unrelated subscribers', () => {
    render(GainProbe, { itemId: 'item-a', testId: 'gain-a' })
    render(GainProbe, { itemId: 'item-b', testId: 'gain-b' })

    update(() =>
      setMixerLiveGains([
        { itemId: 'item-a', gain: 0.25 },
        { itemId: 'item-b', gain: 0.75 },
      ]),
    )

    expect(screen.getByTestId('gain-a').textContent).toBe('0.25')
    expect(screen.getByTestId('gain-b').textContent).toBe('0.75')

    update(() => setMixerLiveGains([{ itemId: 'item-a', gain: 1 }]))

    expect(screen.getByTestId('gain-a').textContent).toBe('1')
    expect(screen.getByTestId('gain-b').textContent).toBe('0.75')
  })

  it('multiplies independent gain layers and clears them independently', () => {
    render(GainProbe, { itemId: 'item-a', testId: 'gain-a' })

    update(() => {
      setMixerLiveGains([{ itemId: 'item-a', gain: 0.5 }])
      setMixerLiveGainLayer('mute-solo', [{ itemId: 'item-a', gain: 0.25 }])
    })

    expect(screen.getByTestId('gain-a').textContent).toBe('0.125')

    update(() => clearMixerLiveGainLayer('mute-solo'))

    expect(screen.getByTestId('gain-a').textContent).toBe('0.5')

    update(() => clearMixerLiveGain('item-a'))

    expect(screen.getByTestId('gain-a').textContent).toBe('1')
  })
})

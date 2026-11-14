// SPDX-License-Identifier: MIT

import { flushSync } from 'svelte'
import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { _resetZoomStoreForTest, useZoomStore } from '@/features/timeline/stores/zoom-store'
import Harness from './timeline-settled-content-zoom-provider.harness.svelte'

describe('TimelineSettledContentZoomProvider', () => {
  beforeEach(() => {
    _resetZoomStoreForTest()
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps rich content settled while live zoom changes, then publishes the settled value', () => {
    render(Harness)

    expect(screen.getByTestId('pixels-per-second')).toHaveTextContent('100')

    useZoomStore.setState({ level: 1.4, pixelsPerSecond: 140, isZoomInteracting: true })
    flushSync()
    expect(screen.getByTestId('pixels-per-second')).toHaveTextContent('100')

    useZoomStore.setState({
      contentLevel: 1.4,
      contentPixelsPerSecond: 140,
      isZoomInteracting: false,
    })
    flushSync()
    expect(screen.getByTestId('pixels-per-second')).toHaveTextContent('140')
  })

  it('keeps immediate edit previews on live zoom', () => {
    render(Harness, { preferImmediateRendering: true })

    useZoomStore.setState({ level: 1.4, pixelsPerSecond: 140, isZoomInteracting: true })
    flushSync()

    expect(screen.getByTestId('pixels-per-second')).toHaveTextContent('140')
  })

  it('keeps the settled value through a new gesture until content zoom commits', () => {
    render(Harness)

    useZoomStore.setState({
      level: 1.4,
      pixelsPerSecond: 140,
      contentLevel: 1.4,
      contentPixelsPerSecond: 140,
      isZoomInteracting: false,
    })
    flushSync()
    expect(screen.getByTestId('pixels-per-second')).toHaveTextContent('140')

    useZoomStore.setState({ level: 1.5, pixelsPerSecond: 150, isZoomInteracting: true })
    flushSync()
    expect(screen.getByTestId('pixels-per-second')).toHaveTextContent('140')

    useZoomStore.setState({
      contentLevel: 1.5,
      contentPixelsPerSecond: 150,
      isZoomInteracting: false,
    })
    flushSync()
    expect(screen.getByTestId('pixels-per-second')).toHaveTextContent('150')
  })
})

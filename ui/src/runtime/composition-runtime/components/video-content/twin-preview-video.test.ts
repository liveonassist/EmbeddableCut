// SPDX-License-Identifier: MIT

import { render } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  clearDomVideoElementRegistry,
  getBestDomVideoElementForItem,
  registerDomVideoElement,
  unregisterDomVideoElement,
} from '@/runtime/composition-runtime/utils/dom-video-element-registry'
import TwinPreviewVideo from './twin-preview-video.svelte'

function createVideo() {
  const video = document.createElement('video')
  const media = { readyState: 0, videoWidth: 0 }
  Object.defineProperty(video, 'readyState', { get: () => media.readyState })
  Object.defineProperty(video, 'videoWidth', { get: () => media.videoWidth })
  Object.assign(video, { requestVideoFrameCallback: () => 1, cancelVideoFrameCallback: () => {} })
  document.body.append(video)
  return { video, load: () => Object.assign(media, { readyState: 4, videoWidth: 1920 }) }
}

describe('TwinPreviewVideo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    clearDomVideoElementRegistry()
    document.body.replaceChildren()
  })

  it("stands the twin's video in for its own, however long that takes to load", async () => {
    const onMissing = vi.fn()
    const { video, load } = createVideo()
    render(TwinPreviewVideo, { itemId: 'copy', twinId: 'clip', onMissing })
    registerDomVideoElement('clip', video)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(getBestDomVideoElementForItem('copy')).toBeNull()
    load()
    await vi.advanceTimersByTimeAsync(200)
    expect(getBestDomVideoElementForItem('copy')).toBe(video)
    expect(onMissing).not.toHaveBeenCalled()

    unregisterDomVideoElement('clip', video)
    await vi.advanceTimersByTimeAsync(200)
    expect(getBestDomVideoElementForItem('copy')).toBeNull()
  })

  it('says so when the twin has no video', async () => {
    const onMissing = vi.fn()
    render(TwinPreviewVideo, { itemId: 'copy', twinId: 'clip', onMissing })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(onMissing).toHaveBeenCalledOnce()
  })
})

// @vitest-environment node
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { importsExternalFramesOnly, uploadExternalImage } from './external-image-upload'

class FakeVideoFrame {
  displayWidth = 4
  displayHeight = 2
  close = vi.fn()
}

class FakeCanvas {
  drawImage = vi.fn()
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return { fillRect: vi.fn(), clearRect: vi.fn(), drawImage: this.drawImage }
  }
}

interface FakeDevice {
  device: GPUDevice
  copy: ReturnType<typeof vi.fn>
  importExternalTexture: ReturnType<typeof vi.fn>
  submit: ReturnType<typeof vi.fn>
}

/** A device that copies like Chromium, or refuses frames like Firefox and maybe imports them. */
function fakeDevice(browser: 'chromium' | 'firefox' | 'software', imports: boolean): FakeDevice {
  const copy = vi.fn((info: { source: unknown }) => {
    if (browser === 'software') throw new TypeError('Failed to copy content from external image.')
    if (browser === 'firefox' && info.source instanceof FakeVideoFrame) {
      throw new TypeError("'source' could not be converted to any of: ImageBitmap, …")
    }
  })
  const importExternalTexture = vi.fn(() => {
    if (!imports) throw new DOMException('WebGPU external textures are disabled', 'OperationError')
    return {}
  })
  const submit = vi.fn()
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setScissorRect: vi.fn(),
    draw: vi.fn(),
    end: vi.fn(),
  }
  const device = {
    queue: { copyExternalImageToTexture: copy, submit },
    importExternalTexture,
    createTexture: () => ({ destroy: vi.fn() }),
    createShaderModule: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: () => ({}),
    createCommandEncoder: () => ({ beginRenderPass: () => pass, finish: () => ({}) }),
  } as unknown as GPUDevice
  return { device, copy, importExternalTexture, submit }
}

const texture = {
  format: 'rgba8unorm',
  width: 4,
  height: 2,
  createView: () => ({}),
} as unknown as GPUTexture
const size = { width: 4, height: 2 }

describe('uploadExternalImage', () => {
  beforeEach(() => {
    vi.stubGlobal('VideoFrame', FakeVideoFrame)
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    vi.stubGlobal('GPUTextureUsage', { COPY_DST: 2, RENDER_ATTACHMENT: 16 })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('copies frames directly where the browser accepts them, as Chromium does', () => {
    const { device, copy, importExternalTexture } = fakeDevice('chromium', true)
    const frame = new FakeVideoFrame()

    uploadExternalImage(device, frame as unknown as VideoFrame, texture, size)

    expect(copy).toHaveBeenLastCalledWith({ source: frame, flipY: false }, { texture }, size)
    expect(importExternalTexture).not.toHaveBeenCalled()
    expect(importsExternalFramesOnly(device)).toBe(false)
  })

  it('imports frames the browser refuses to copy, without a readback', () => {
    const { device, copy, importExternalTexture, submit } = fakeDevice('firefox', true)
    const frame = new FakeVideoFrame()

    uploadExternalImage(device, frame as unknown as VideoFrame, texture, size)

    expect(importExternalTexture).toHaveBeenLastCalledWith({ source: frame })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(copy.mock.calls.every(([info]) => info.source !== frame)).toBe(true)
    expect(importsExternalFramesOnly(device)).toBe(true)
  })

  it('stages frames through a 2D canvas where they can be neither copied nor imported', () => {
    const { device, copy } = fakeDevice('firefox', false)
    const frame = new FakeVideoFrame()

    uploadExternalImage(device, frame as unknown as VideoFrame, texture, size)

    const [info] = copy.mock.lastCall!
    expect(info.source).toBeInstanceOf(FakeCanvas)
    expect((info.source as FakeCanvas).drawImage).toHaveBeenCalledWith(frame, 0, 0, 4, 2)
    expect(importsExternalFramesOnly(device)).toBe(false)
  })

  it('keeps the copy path on a device that copies nothing, as Chromium on a software GPU', () => {
    const { device, copy, importExternalTexture } = fakeDevice('software', true)
    const frame = new FakeVideoFrame()

    expect(() =>
      uploadExternalImage(device, frame as unknown as VideoFrame, texture, size),
    ).toThrow(TypeError)

    expect(copy.mock.lastCall![0].source).toBe(frame)
    expect(importExternalTexture).not.toHaveBeenCalled()
  })

  it('leaves canvases and bitmaps to the copy everywhere', () => {
    const { device, copy, importExternalTexture } = fakeDevice('firefox', true)
    const canvas = new FakeCanvas(4, 2)

    uploadExternalImage(device, canvas as unknown as OffscreenCanvas, texture, size)

    expect(copy).toHaveBeenLastCalledWith({ source: canvas, flipY: false }, { texture }, size)
    expect(importExternalTexture).not.toHaveBeenCalled()
  })
})

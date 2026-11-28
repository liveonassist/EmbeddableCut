// SPDX-License-Identifier: MIT

/**
 * `copyExternalImageToTexture` for every source the renderer hands the GPU.
 *
 * Chromium copies `<video>` elements and `VideoFrame`s on the GPU, and keeps
 * doing so here. Firefox refuses both (bug 1922100, and the stalled patch
 * would read frames back to the CPU anyway); its only zero-copy route is
 * `importExternalTexture`, which shares the decoder's D3D11 texture or
 * IOSurface on Windows and macOS. There the frame is imported and drawn 1:1
 * into the destination. Where importing isn't possible (Linux, 10-bit
 * software-decoded frames), the frame is drawn onto a 2D canvas and that is
 * copied, which costs a readback but is always accepted.
 *
 * The blit reads texels with `textureLoad` at exact integer coordinates
 * rather than sampling: no filtering or edge clamping touches the result, so
 * it matches the copy texel for texel up to the browser's own YUV→RGB
 * conversion.
 */

type FrameSource = HTMLVideoElement | VideoFrame

export type ExternalImageSource =
  | FrameSource
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas

interface CopySize {
  width: number
  height: number
}

const BLIT_SHADER = /* wgsl */ `
@group(0) @binding(0) var frame: texture_external;

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return textureLoad(frame, vec2u(position.xy));
}
`

/** Consecutive failed imports after which a device stops trying them. */
const IMPORT_FAILURE_LIMIT = 3

function isFrameSource(source: ExternalImageSource): source is FrameSource {
  return (
    (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) ||
    (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame)
  )
}

function frameSize(source: FrameSource): CopySize {
  return source instanceof VideoFrame
    ? { width: source.displayWidth, height: source.displayHeight }
    : { width: source.videoWidth, height: source.videoHeight }
}

class ExternalImageUploader {
  private copiesFrames: boolean | null = null
  private importFailures = 0
  private importable: boolean | null = null
  private readonly blitPipelines = new Map<GPUTextureFormat, GPURenderPipeline>()
  private stagingCanvas: OffscreenCanvas | null = null
  private stagingContext: OffscreenCanvasRenderingContext2D | null = null

  constructor(private readonly device: GPUDevice) {}

  upload(source: ExternalImageSource, texture: GPUTexture, size: CopySize): void {
    if (!isFrameSource(source) || this.acceptsFrames()) {
      this.device.queue.copyExternalImageToTexture({ source, flipY: false }, { texture }, size)
      return
    }
    if (this.importFrame(source, texture, size)) return
    this.copyThroughCanvas(source, texture, size)
  }

  /** Whether this device imports frames as external textures, so a caller can prefer its own import paths. */
  canImportFrames(): boolean {
    if (this.importable === null) this.importable = this.probeImport()
    return this.importable && this.importFailures < IMPORT_FAILURE_LIMIT
  }

  /**
   * Whether frames reach the GPU without a readback only through import: the
   * browser refuses to copy them, but imports them (Firefox on Windows and
   * macOS). Drawing a frame onto a 2D canvas reads it back there.
   */
  importsFramesOnly(): boolean {
    return !this.acceptsFrames() && this.canImportFrames()
  }

  private acceptsFrames(): boolean {
    if (this.copiesFrames !== null) return this.copiesFrames
    if (typeof VideoFrame === 'undefined') return (this.copiesFrames = true)
    const canvas = new OffscreenCanvas(2, 2)
    canvas.getContext('2d')!.fillRect(0, 0, 2, 2)
    const probe = new VideoFrame(canvas, { timestamp: 0 })
    const texture = this.device.createTexture({
      size: { width: 2, height: 2 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    })
    const copies = (source: VideoFrame | OffscreenCanvas): boolean => {
      try {
        this.device.queue.copyExternalImageToTexture(
          { source, flipY: false },
          { texture },
          { width: 2, height: 2 },
        )
        return true
      } catch {
        return false
      }
    }
    try {
      // The browser refuses frames only if it copies the same pixels from a
      // canvas. A device that copies neither (Chromium on a software GPU) keeps
      // the copy path and whatever its callers already do when it fails.
      this.copiesFrames = copies(probe) || !copies(canvas)
    } finally {
      probe.close()
      texture.destroy()
    }
    return this.copiesFrames
  }

  private probeImport(): boolean {
    if (typeof this.device.importExternalTexture !== 'function') return false
    if (typeof VideoFrame === 'undefined') return false
    const probe = this.probeFrame()
    try {
      // Firefox exposes the method where its pref is on but the backend can't
      // import (Linux): only an actual import tells.
      this.device.importExternalTexture({ source: probe })
      return true
    } catch {
      return false
    } finally {
      probe.close()
    }
  }

  private probeFrame(): VideoFrame {
    const canvas = new OffscreenCanvas(2, 2)
    canvas.getContext('2d')!.fillRect(0, 0, 2, 2)
    return new VideoFrame(canvas, { timestamp: 0 })
  }

  private importFrame(source: FrameSource, texture: GPUTexture, size: CopySize): boolean {
    if (!this.canImportFrames()) return false
    let external: GPUExternalTexture
    try {
      external = this.device.importExternalTexture({ source })
    } catch {
      this.importFailures++
      return false
    }
    this.importFailures = 0
    const pipeline = this.blitPipeline(texture.format)
    const encoder = this.device.createCommandEncoder({ label: 'external-image-upload' })
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView(), loadOp: 'load', storeOp: 'store' }],
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: external }],
      }),
    )
    // copyExternalImageToTexture writes only the copy rect from the origin.
    pass.setScissorRect(
      0,
      0,
      Math.min(size.width, texture.width),
      Math.min(size.height, texture.height),
    )
    pass.draw(3)
    pass.end()
    // An external texture expires when the frame changes; submit before it can.
    this.device.queue.submit([encoder.finish()])
    return true
  }

  private blitPipeline(format: GPUTextureFormat): GPURenderPipeline {
    let pipeline = this.blitPipelines.get(format)
    if (!pipeline) {
      const module = this.device.createShaderModule({
        label: 'external-image-upload',
        code: BLIT_SHADER,
      })
      pipeline = this.device.createRenderPipeline({
        label: 'external-image-upload',
        layout: 'auto',
        vertex: { module, entryPoint: 'vertexMain' },
        fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      })
      this.blitPipelines.set(format, pipeline)
    }
    return pipeline
  }

  private copyThroughCanvas(source: FrameSource, texture: GPUTexture, size: CopySize): void {
    const { width, height } = frameSize(source)
    if (!this.stagingCanvas || !this.stagingContext) {
      this.stagingCanvas = new OffscreenCanvas(width, height)
      this.stagingContext = this.stagingCanvas.getContext('2d')
      if (!this.stagingContext) throw new Error('No 2D context to stage a video frame in')
    } else if (this.stagingCanvas.width !== width || this.stagingCanvas.height !== height) {
      this.stagingCanvas.width = width
      this.stagingCanvas.height = height
    }
    this.stagingContext.clearRect(0, 0, width, height)
    this.stagingContext.drawImage(source, 0, 0, width, height)
    this.device.queue.copyExternalImageToTexture(
      { source: this.stagingCanvas, flipY: false },
      { texture },
      size,
    )
  }
}

const uploaders = new WeakMap<GPUDevice, ExternalImageUploader>()

function uploaderFor(device: GPUDevice): ExternalImageUploader {
  let uploader = uploaders.get(device)
  if (!uploader) {
    uploader = new ExternalImageUploader(device)
    uploaders.set(device, uploader)
  }
  return uploader
}

/**
 * `device.queue.copyExternalImageToTexture({ source, flipY: false }, { texture }, size)`,
 * for any source in any browser. The texture needs `RENDER_ATTACHMENT`, as the copy does.
 */
export function uploadExternalImage(
  device: GPUDevice,
  source: ExternalImageSource,
  texture: GPUTexture,
  size: CopySize,
): void {
  uploaderFor(device).upload(source, texture, size)
}

/** Whether `importExternalTexture` works on this device; Firefox exposes it where it can't. */
export function canImportExternalFrames(device: GPUDevice): boolean {
  return uploaderFor(device).canImportFrames()
}

/** See `ExternalImageUploader.importsFramesOnly`: where video should skip 2D canvases. */
export function importsExternalFramesOnly(device: GPUDevice): boolean {
  return uploaderFor(device).importsFramesOnly()
}

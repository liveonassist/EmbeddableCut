// SPDX-License-Identifier: MIT

/**
 * Decodes video the browser's media element plays but WebCodecs can't: HEVC
 * in Firefox, whose `<video>` uses the OS decoders (Windows with hardware
 * support or Microsoft's extension, macOS, Linux through the system FFmpeg)
 * while its WebCodecs has no HEVC. Shipping a software HEVC decoder instead
 * would carry HEVC's patent licensing; the OS's decoder already has it.
 *
 * Registered as a mediabunny decoder, so every main-thread reader (preview
 * frames, scrubbing, transitions, main-thread export, thumbnails) decodes
 * through it unchanged. Workers have no media element: work that needs these
 * frames runs on the main thread instead.
 *
 * Each GOP is remuxed into a small MP4 in memory, loaded into a `<video>`,
 * and every frame captured by seeking to it, in presentation order as a
 * WebCodecs decoder would emit them. A seek decodes from the GOP's keyframe,
 * so this is far slower than WebCodecs: correct, not fast.
 */

import type { EncodedPacket, VideoCodec, VideoSample as MediabunnyVideoSample } from 'mediabunny'

type Mediabunny = typeof import('mediabunny')

const HANDLED_CODECS: ReadonlySet<VideoCodec> = new Set(['hevc'])
/** Main profile 4.0, which every HEVC decoder that exists takes. */
const HEVC_PROBE_CODEC = 'hvc1.1.6.L120.90'
const SEEK_TIMEOUT_MS = 10_000
/** HEVC's largest decoded picture buffer: no frame shows more than this many packets late. */
const HEVC_MAX_REORDER = 16
/** Frames captured per remux of the GOP so far: fewer reloads, a little more latency. */
const EMIT_BATCH = 8

let registration: Promise<void> | null = null

function mp4Type(codecString: string): string {
  return `video/mp4; codecs="${codecString}"`
}

function waitFor(target: EventTarget, event: string, failure = 'error'): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${event}`))
    }, SEEK_TIMEOUT_MS)
    const onEvent = () => {
      cleanup()
      resolve()
    }
    const onFailure = () => {
      cleanup()
      reject(new Error(`Media element failed while waiting for ${event}`))
    }
    const cleanup = () => {
      clearTimeout(timer)
      target.removeEventListener(event, onEvent)
      target.removeEventListener(failure, onFailure)
    }
    target.addEventListener(event, onEvent, { once: true })
    target.addEventListener(failure, onFailure, { once: true })
  })
}

export function createDecoderClass(mb: Mediabunny) {
  return class MediaElementVideoDecoder extends mb.CustomVideoDecoder {
    /** The GOP being decoded, from its keyframe, in decode order. */
    private gop: EncodedPacket[] = []
    /**
     * The previous GOP, held while the next keyframe's leading pictures arrive:
     * in an open GOP they follow the keyframe in decode order, show before it
     * and reference the previous GOP, so they decode with it.
     */
    private closing: { packets: EncodedPacket[]; until: number } | null = null
    /** Every frame before this timestamp has been emitted. */
    private emittedUntil = -Infinity
    private video: HTMLVideoElement | null = null
    /** The remux the element has loaded, by its packet count, so a batch that adds none reloads nothing. */
    private loaded: { packets: EncodedPacket[]; count: number; base: number; url: string } | null =
      null

    static override supports(codec: VideoCodec, config: VideoDecoderConfig): boolean {
      return HANDLED_CODECS.has(codec) && canPlayInElement(config.codec)
    }

    init(): void {
      const video = document.createElement('video')
      video.muted = true
      video.preload = 'auto'
      video.playsInline = true
      this.video = video
    }

    async decode(packet: EncodedPacket): Promise<void> {
      if (this.closing) {
        if (packet.timestamp < this.closing.until) {
          // A leading picture of the keyframe that ended the previous GOP. Trailing
          // pictures never reference leading ones, so the new GOP leaves it out.
          this.closing.packets.push(packet)
          return
        }
        const { packets, until } = this.closing
        this.closing = null
        await this.emit(packets, until)
      }
      if (packet.type === 'key' && this.gop.length > 0) {
        this.closing = { packets: [...this.gop, packet], until: packet.timestamp }
        this.gop = [packet]
        return
      }
      this.gop.push(packet)
      // Emit as a decoder does: a frame is final once its reorder window has passed.
      const final = this.finalTimestamps()
      if (final.length >= EMIT_BATCH) await this.emit(this.gop, final.at(-1)! + 1e-9)
    }

    async flush(): Promise<void> {
      if (this.closing) {
        const { packets, until } = this.closing
        this.closing = null
        await this.emit(packets, until)
      }
      if (this.gop.length > 0) await this.emit(this.gop, Infinity)
      this.gop = []
    }

    close(): void {
      this.gop = []
      this.closing = null
      this.unload()
      this.video = null
    }

    /** Unemitted frames no packet still to come can precede. */
    private finalTimestamps(): number[] {
      const from = this.startOf(this.gop)
      const pending = this.gop
        .map((packet) => packet.timestamp)
        .filter((timestamp) => timestamp >= from)
        .sort((a, b) => a - b)
      return pending.slice(0, Math.max(0, pending.length - HEVC_MAX_REORDER))
    }

    /**
     * Where a GOP's unemitted frames start. A stream's first GOP starts at its
     * keyframe: leading pictures before it reference a GOP this decoder never
     * saw, and WebCodecs skips them too.
     */
    private startOf(packets: EncodedPacket[]): number {
      return Number.isFinite(this.emittedUntil) ? this.emittedUntil : packets[0]!.timestamp
    }

    /** Emits a GOP's frames from `emittedUntil` up to, not including, `until`, in presentation order. */
    private async emit(packets: EncodedPacket[], until: number): Promise<void> {
      const video = this.video
      if (!video || packets[0]?.type !== 'key') return
      const from = this.startOf(packets)
      const frames = packets
        .filter((packet) => packet.timestamp >= from && packet.timestamp < until)
        .sort((a, b) => a.timestamp - b.timestamp)
      this.emittedUntil = Math.max(from, until === Infinity ? from : until)
      if (frames.length === 0) return

      const base = await this.load(packets)
      for (const packet of frames) {
        // A quarter frame in, so the seek lands inside this frame, never on the edge before it.
        const offset = packet.duration > 0 ? packet.duration / 4 : 1e-4
        video.currentTime = packet.timestamp - base + offset
        await waitFor(video, 'seeked')
        this.onSample(
          new mb.VideoSample(video, {
            timestamp: packet.timestamp,
            duration: packet.duration,
          }) as MediabunnyVideoSample,
        )
      }
      if (until === Infinity) this.emittedUntil = frames.at(-1)!.timestamp + 1e-9
    }

    /** Loads a remux of `packets` into the element, unless it already holds them; returns their base timestamp. */
    private async load(packets: EncodedPacket[]): Promise<number> {
      const video = this.video!
      if (this.loaded?.packets === packets && this.loaded.count === packets.length) {
        return this.loaded.base
      }
      this.unload()
      const base = Math.min(...packets.map((packet) => packet.timestamp))
      const url = URL.createObjectURL(
        new Blob([await this.remux(packets, base)], { type: 'video/mp4' }),
      )
      this.loaded = { packets, count: packets.length, base, url }
      video.src = url
      await waitFor(video, 'loadeddata')
      return base
    }

    private unload(): void {
      if (!this.loaded) return
      URL.revokeObjectURL(this.loaded.url)
      this.loaded = null
      this.video?.removeAttribute('src')
      this.video?.load()
    }

    private async remux(packets: EncodedPacket[], base: number): Promise<ArrayBuffer> {
      const target = new mb.BufferTarget()
      const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target })
      const source = new mb.EncodedVideoPacketSource(this.codec)
      output.addVideoTrack(source)
      await output.start()
      for (const [index, packet] of packets.entries()) {
        await source.add(
          packet.clone({ timestamp: packet.timestamp - base }),
          index === 0 ? { decoderConfig: this.config } : undefined,
        )
      }
      await output.finalize()
      return target.buffer!
    }
  }
}

/**
 * Registers the decoder in this realm for the codecs that need it: those
 * WebCodecs refuses and the media element plays. Main thread only; a no-op
 * where WebCodecs already decodes them (Chromium).
 */
export function ensureMediaElementVideoDecoderRegistered(): Promise<void> {
  if (registration) return registration
  registration = (async () => {
    if (!(await needsMediaElementDecoding(HEVC_PROBE_CODEC))) return
    const mb = await import('mediabunny')
    mb.registerDecoder(createDecoderClass(mb))
  })().catch((error: unknown) => {
    registration = null
    throw error
  })
  return registration
}

/** Whether the media element plays a codec string here; `false` in workers. */
export function canPlayInElement(codecString: string): boolean {
  if (typeof document === 'undefined') return false
  return document.createElement('video').canPlayType(mp4Type(codecString)) !== ''
}

/** Whether a codec string decodes only through the media element: it plays, WebCodecs refuses it. */
export async function needsMediaElementDecoding(codecString: string): Promise<boolean> {
  if (!canPlayInElement(codecString) || typeof VideoDecoder === 'undefined') return false
  const { supported } = await VideoDecoder.isConfigSupported({
    codec: codecString,
    codedWidth: 1920,
    codedHeight: 1080,
  }).catch(() => ({ supported: false }))
  return !supported
}

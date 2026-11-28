// @vitest-environment node
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { EncodedPacket } from 'mediabunny'
import { createDecoderClass } from './media-element-video-decoder'

const FRAME = 1 / 30

/** A `<video>` that loads and seeks at once, and remembers where each seek landed. */
class FakeVideo extends EventTarget {
  seeks: number[] = []
  private time = 0
  set src(_url: string) {
    queueMicrotask(() => this.dispatchEvent(new Event('loadeddata')))
  }
  get currentTime() {
    return this.time
  }
  set currentTime(value: number) {
    this.time = value
    this.seeks.push(value)
    queueMicrotask(() => this.dispatchEvent(new Event('seeked')))
  }
  removeAttribute() {}
  load() {}
}

const fakeMediabunny = {
  CustomVideoDecoder: class {},
  VideoSample: class {
    timestamp: number
    constructor(_source: unknown, init: { timestamp: number }) {
      this.timestamp = init.timestamp
    }
  },
  BufferTarget: class {
    buffer = new ArrayBuffer(0)
  },
  Mp4OutputFormat: class {},
  EncodedVideoPacketSource: class {
    add = vi.fn()
  },
  Output: class {
    addVideoTrack() {}
    async start() {}
    async finalize() {}
  },
}

function packet(frame: number, type: 'key' | 'delta' = 'delta'): EncodedPacket {
  const timestamp = frame * FRAME
  return {
    type,
    timestamp,
    duration: FRAME,
    clone: () => packet(frame, type),
  } as unknown as EncodedPacket
}

async function decodeAll(stream: EncodedPacket[]) {
  const Decoder = createDecoderClass(fakeMediabunny as never)
  const decoder = new (Decoder as unknown as new () => InstanceType<typeof Decoder>)()
  const emitted: number[] = []
  Object.assign(decoder, {
    codec: 'hevc',
    config: { codec: 'hvc1.1.6.L120.90' },
    onSample: (sample: { timestamp: number }) => emitted.push(Math.round(sample.timestamp / FRAME)),
  })
  decoder.init()
  for (const p of stream) await decoder.decode(p)
  await decoder.flush()
  decoder.close()
  return emitted
}

/**
 * Decode order of an open-GOP HEVC stream: P frames ahead of the B frames
 * that show before them, and keyframes at 0 and 30 whose leading pictures
 * (27–29 for the second) follow them in decode order.
 */
function openGopStream(): EncodedPacket[] {
  const stream = [packet(0, 'key')]
  const pbb = (from: number, to: number) => {
    for (let p = from; p < to; p += 3) stream.push(packet(p + 3), packet(p + 1), packet(p + 2))
  }
  pbb(0, 24) // 1–24
  stream.push(packet(26), packet(25))
  stream.push(packet(30, 'key'), packet(27), packet(28), packet(29))
  pbb(30, 57) // 31–57
  stream.push(packet(59), packet(58))
  return stream
}

describe('the media-element video decoder', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: () => new FakeVideo() })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:gop', revokeObjectURL: () => {} })
    vi.stubGlobal('Blob', class {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('emits every frame once, in presentation order, across open GOPs', async () => {
    const emitted = await decodeAll(openGopStream())

    expect(emitted).toEqual(Array.from({ length: 60 }, (_, frame) => frame))
  })

  it('skips the leading pictures of the keyframe a stream starts at, as WebCodecs does', async () => {
    // Starting at a keyframe whose leading pictures 0–2 reference a GOP never fed.
    const stream = [packet(3, 'key'), packet(0), packet(1), packet(2)]
    for (let p = 3; p < 27; p += 3) stream.push(packet(p + 3), packet(p + 1), packet(p + 2))

    const emitted = await decodeAll(stream)

    expect(emitted).toEqual(Array.from({ length: 25 }, (_, index) => index + 3)) // 3–27
  })
})

// SPDX-License-Identifier: MIT

/**
 * Import-time probing runs in a worker, which has no media element: a codec
 * only the media element decodes (HEVC in Firefox) comes back as undecodable,
 * without a thumbnail. Here, on the main thread, such media is marked
 * playable, so the preview uses its `<video>`, and gets its thumbnail through
 * the media-element decoder.
 */

import {
  canPlayInElement,
  ensureMediaElementVideoDecoderRegistered,
  needsMediaElementDecoding,
} from '@/infrastructure/browser/media-element-video-decoder'
import { createLogger } from '@/shared/logging/logger'
import { generateThumbnail } from '../utils/thumbnail-generator'
import type { RemoteProbeFile, VideoMetadata } from '../workers/media-processor.worker'

const logger = createLogger('ElementDecodedMedia')

/** The codec string each mediabunny codec name is probed with. */
const ELEMENT_PROBE_CODECS: Partial<Record<string, string>> = {
  hevc: 'hvc1.1.6.L120.90',
}

interface ProbeResult<M> {
  metadata: M
  thumbnail?: Blob
}

export async function completeElementDecodedProbe<M extends { type: string }>(
  result: ProbeResult<M>,
  file: File | RemoteProbeFile,
): Promise<ProbeResult<M>> {
  if (result.metadata.type !== 'video') return result
  const metadata = result.metadata as unknown as VideoMetadata
  const probeCodec = ELEMENT_PROBE_CODECS[metadata.codec]
  if (metadata.videoCodecSupported !== false || !probeCodec || !canPlayInElement(probeCodec)) {
    return result
  }
  if (!(await needsMediaElementDecoding(probeCodec))) return result

  let thumbnail = result.thumbnail
  if (!thumbnail && file instanceof File) {
    try {
      await ensureMediaElementVideoDecoderRegistered()
      thumbnail = await generateThumbnail(file)
    } catch (error) {
      logger.warn('Failed to generate a thumbnail through the media element', error)
    }
  }
  return {
    metadata: { ...metadata, videoCodecSupported: true } as unknown as M,
    thumbnail,
  }
}

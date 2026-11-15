// SPDX-License-Identifier: MIT

import { getObjectUrlSourceMetadata } from '@/infrastructure/browser/object-url-registry'

/**
 * The longest stretch of a URL asset's source one waveform request decodes.
 * Its audio is interleaved with its video, so decoding a stretch reads every
 * byte of it: a whole four-hour stream is gigabytes. Longer requests are left
 * to the visible range once the timeline is zoomed in that far.
 */
const REMOTE_WAVEFORM_MAX_SPAN_SEC = 10 * 60

/** Whether decoding `spanSec` of the media at `url` (its whole length when omitted) is too much to fetch. */
export function exceedsRemoteWaveformSpan(url: string, spanSec?: number): boolean {
  const metadata = getObjectUrlSourceMetadata(url)
  if (!metadata?.remote) return false
  const span = spanSec ?? metadata.duration ?? 0
  return span > REMOTE_WAVEFORM_MAX_SPAN_SEC
}

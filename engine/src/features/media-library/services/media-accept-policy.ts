// SPDX-License-Identifier: MIT

/**
 * The host's say over which files become media. Every import from disk is
 * probed first and checked here before anything is stored, so a refused file
 * leaves nothing behind.
 */

import type { MediaMetadata } from '@/types/storage'

/** What a file turned out to be, as the policy sees it. Durations are seconds. */
export type MediaCandidate = Pick<
  MediaMetadata,
  'fileName' | 'mimeType' | 'fileSize' | 'duration' | 'width' | 'height' | 'fps' | 'codec'
> & { audioCodec?: string }

/** `true` accepts the file; a string refuses it, and is shown to the user as the reason. */
export type MediaAcceptPolicy = (
  candidate: MediaCandidate,
) => true | string | Promise<true | string>

export class MediaRefusedError extends Error {
  constructor(
    readonly fileName: string,
    readonly reason: string,
  ) {
    super(`${fileName} wasn't added: ${reason}`)
    this.name = 'MediaRefusedError'
  }
}

let policy: MediaAcceptPolicy | null = null

export function setMediaAcceptPolicy(next: MediaAcceptPolicy | null): void {
  policy = next
}

/** @throws {MediaRefusedError} when the host's policy refuses the file. */
export async function assertMediaAccepted(media: MediaMetadata): Promise<void> {
  if (!policy) return
  const verdict = await policy({
    fileName: media.fileName,
    mimeType: media.mimeType,
    fileSize: media.fileSize,
    duration: media.duration,
    width: media.width,
    height: media.height,
    fps: media.fps,
    codec: media.codec,
    ...(media.audioCodec === undefined ? {} : { audioCodec: media.audioCodec }),
  })
  if (verdict !== true) throw new MediaRefusedError(media.fileName, verdict)
}

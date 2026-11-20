// SPDX-License-Identifier: MIT

/**
 * A video clip's own frame rate (`VideoItem.frameRate`): its picture updates
 * only that often, holding each frame for `fps / frameRate` timeline frames,
 * for a choppy, stop-motion look. Audio, transforms and effects keep the
 * timeline's rate.
 */

interface FrameRateClip {
  type: string
  from: number
  frameRate?: number
}

const EPSILON = 1e-6

/** The clip's frame rate when it holds frames at `fps`, else null. */
export function getHeldFrameRate(item: FrameRateClip, fps: number): number | null {
  if (item.type !== 'video') return null
  const rate = item.frameRate
  return rate !== undefined && Number.isFinite(rate) && rate > 0 && rate < fps ? rate : null
}

/**
 * The timeline frame whose picture `frame` shows. Steps sit on a grid from
 * timeline frame 0 rather than from the clip's start, so the halves of a
 * split clip keep stepping together; a clip starting mid-step holds its own
 * first frame until the next step.
 */
export function resolveHeldTimelineFrame(item: FrameRateClip, frame: number, fps: number): number {
  const rate = getHeldFrameRate(item, fps)
  if (rate === null) return frame
  const framesPerStep = fps / rate
  const stepStart = Math.floor(frame / framesPerStep + EPSILON) * framesPerStep
  const nearest = Math.round(stepStart)
  const held = Math.abs(stepStart - nearest) < EPSILON ? nearest : Math.ceil(stepStart)
  return frame >= item.from && held < item.from ? item.from : held
}

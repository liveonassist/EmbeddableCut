// SPDX-License-Identifier: MIT

import { createScrubThrottleState, shouldCommitScrubFrame } from '@/shared/utils/scrub-throttle'

interface ScrubCommit {
  frame: number
  pointerX: number
  pixelsPerSecond: number
}

export function useCoalescedScrub(onScrub: () => ((frame: number) => void) | undefined) {
  let rafId: number | null = null
  let pending: ScrubCommit | null = null
  let throttleState = createScrubThrottleState()

  const cancelPendingScrub = () => {
    pending = null
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const flushPendingScrub = (force = false) => {
    rafId = null
    const commit = pending
    pending = null
    if (!commit) return

    if (
      force ||
      shouldCommitScrubFrame({
        state: throttleState,
        pointerX: commit.pointerX,
        targetFrame: commit.frame,
        pixelsPerSecond: commit.pixelsPerSecond,
        nowMs: performance.now(),
      })
    ) {
      onScrub()?.(commit.frame)
    }
  }

  const startScrub = (commit: ScrubCommit) => {
    cancelPendingScrub()
    throttleState = createScrubThrottleState({
      pointerX: commit.pointerX,
      frame: commit.frame,
      nowMs: performance.now(),
    })
    onScrub()?.(commit.frame)
  }

  const queueScrub = (commit: ScrubCommit) => {
    pending = commit
    if (rafId === null) {
      rafId = requestAnimationFrame(() => flushPendingScrub())
    }
  }

  $effect(() => cancelPendingScrub)

  return { startScrub, queueScrub, flushPendingScrub, cancelPendingScrub }
}

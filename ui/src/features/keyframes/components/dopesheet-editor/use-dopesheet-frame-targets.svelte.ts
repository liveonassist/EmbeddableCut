// SPDX-License-Identifier: MIT

/**
 * Dopesheet frame targets and guards.
 * Owns which frames a drag may snap to, and which frames reject a new keyframe
 * because they sit inside a transition. Both read the same playhead and the
 * same flattened keyframe list, and both are consulted from event handlers
 * (per drag move and per add), so they stay callbacks rather than state.
 */

import { toast } from 'svelte-sonner'
import { t } from '$lib/i18n.svelte'
import type { AnimatableProperty, Keyframe } from '@/types/keyframe'
import { SNAP_THRESHOLD_PX } from './dopesheet-constants'
import type { DopesheetEditorProps } from './dopesheet-editor-props'

export interface UseDopesheetFrameTargetsOptions {
  visibleKeyframes: Array<{ property: AnimatableProperty; keyframe: Keyframe }>
  selectedKeyframeIds: Set<string>
  additionalSnapFrames: readonly number[]
  currentFrame: number
  effectiveTimelineWidth: number
  frameRange: number
  transitionBlockedRanges: NonNullable<DopesheetEditorProps['transitionBlockedRanges']>
}

export interface UseDopesheetFrameTargetsReturn {
  /** Snaps a frame to the nearest target within the threshold. */
  snapFrame: (frame: number) => number
  readonly isCurrentFrameBlocked: boolean
  notifyKeyframeBlocked: () => void
}

/** Derives the drag snap targets and the transition-blocked frame guard. */
export function useDopesheetFrameTargets(
  options: () => UseDopesheetFrameTargetsOptions,
): UseDopesheetFrameTargetsReturn {
  const visibleKeyframes = $derived(options().visibleKeyframes)
  const selectedKeyframeIds = $derived(options().selectedKeyframeIds)
  const additionalSnapFrames = $derived(options().additionalSnapFrames)
  const currentFrame = $derived(options().currentFrame)
  const effectiveTimelineWidth = $derived(options().effectiveTimelineWidth)
  const frameRange = $derived(options().frameRange)
  const transitionBlockedRanges = $derived(options().transitionBlockedRanges)

  const isCurrentFrameBlocked = $derived(
    transitionBlockedRanges.some(
      (range) => currentFrame >= range.start && currentFrame < range.end,
    ),
  )

  // Adds inside a transition region are rejected by the action layer; surface
  // that instead of failing silently. A fixed toast id prevents stacking on
  // repeated clicks.
  const notifyKeyframeBlocked = () => {
    toast.warning(t('timeline.keyframeEditor.transitionBlocked'), {
      id: 'keyframe-transition-blocked',
    })
  }

  const snapFrameTargets = $derived.by(() => {
    const targets: number[] = [0, currentFrame, ...additionalSnapFrames]
    for (const { keyframe } of visibleKeyframes) {
      if (!selectedKeyframeIds.has(keyframe.id)) {
        targets.push(keyframe.frame)
      }
    }
    return [...new Set(targets)]
  })

  const snapThresholdFrames = $derived((SNAP_THRESHOLD_PX / effectiveTimelineWidth) * frameRange)

  const snapFrame = (frame: number) => {
    let closest = frame
    let minDistance = Infinity
    for (const target of snapFrameTargets) {
      const distance = Math.abs(frame - target)
      if (distance <= snapThresholdFrames && distance < minDistance) {
        minDistance = distance
        closest = target
      }
    }
    return closest
  }

  return {
    snapFrame,
    get isCurrentFrameBlocked() {
      return isCurrentFrameBlocked
    },
    notifyKeyframeBlocked,
  }
}

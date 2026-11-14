// SPDX-License-Identifier: MIT

import type { MotionTimeViewport } from './motion-time-viewport-controller'
import { usePlaybackStore } from '@/shared/state/playback'
import type { AnimatableProperty } from '@/types/keyframe'
import { createSubscriber } from 'svelte/reactivity'

export const LAYER_COLUMN_WIDTH = 620

export const LAYER_PARENT_COLUMN_WIDTH = 148

export const LAYER_TIMING_COLUMN_WIDTH = 128

export const LAYER_MODE_COLUMN_WIDTH = 100

export const LAYER_ROW_HEIGHT = 34

export const RULER_DIVISIONS = 10

/** Sentinel for the parent column's "no parent" option. */
export const NO_TRANSFORM_PARENT = '__none__'

export interface MotionViewportPreviewElement {
  element: HTMLElement
  edgeInset: number
  usableWidth: number
  frame: number
  frameSpan: number | null
  clampToSurface: boolean
  left: string
  width: string
  willChange: string
}

export interface MotionViewportPreviewPlayhead {
  element: HTMLElement
  width: number
  transform: string
  hidden: boolean | 'until-found'
}

export interface MotionViewportPreviewRulerLabel {
  element: HTMLElement
  index: number
  text: string
}

export interface MotionViewportPreviewGrid {
  element: HTMLElement
  edgeInset: number
  usableWidth: number
  frames: number[]
  framesAttribute: string
  cssText: string
  willChange: string
}

export interface MotionViewportPreviewNavigator {
  element: HTMLElement
  startFrame: string
  endFrame: string
  thumb: HTMLElement
  thumbLeft: string
  thumbWidth: string
  trackWidth: number
}

export interface MotionViewportPreviewState {
  baseViewport: MotionTimeViewport
  elements: MotionViewportPreviewElement[]
  grids: MotionViewportPreviewGrid[]
  playhead: MotionViewportPreviewPlayhead | null
  rulerLabels: MotionViewportPreviewRulerLabel[]
  navigator: MotionViewportPreviewNavigator | null
}

export interface MotionMiddlePanState {
  startClientY: number
  startScrollTop: number
}

export const MOTION_INLINE_PROPERTY_GROUP_IDS = ['crop', 'audio', 'effects'] as const

export interface InlineCurveState {
  compositionId: string
  itemId: string
  property: AnimatableProperty
}

/** React's `Dispatch<SetStateAction<T>>`: a setter taking a value or an updater. */
export type StateSetter<T> = (value: T | ((previous: T) => T)) => void

export interface RenameTarget {
  kind: 'layer' | 'group'
  id: string
}

/**
 * Property editors need the frame while paused/scrubbing, but feeding every
 * playback tick through to them makes every expanded dopesheet rerender. During
 * playback the frame holds still; pausing publishes the latest frame once so
 * inputs and keyframe controls catch up immediately. Read `current`.
 */

export function useSettledMotionFrame(): { readonly current: number } {
  let settledFrame =
    usePlaybackStore.getState().previewFrame ?? usePlaybackStore.getState().currentFrame

  const subscribe = createSubscriber((update) =>
    usePlaybackStore.subscribe((state) => {
      if (state.isPlaying || state.previewFrame !== null) return
      const nextFrame = state.currentFrame
      if (nextFrame === settledFrame) return
      settledFrame = nextFrame
      update()
    }),
  )

  return {
    get current() {
      subscribe()
      return settledFrame
    },
  }
}

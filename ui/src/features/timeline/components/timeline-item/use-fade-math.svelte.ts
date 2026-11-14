// SPDX-License-Identifier: MIT

import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { getAudioFadeRatio } from '@/features/timeline/utils/audio-fade'
import {
  getAudioFadeCurveControlPoint,
  getAudioFadeCurvePath,
} from '@/features/timeline/utils/audio-fade-curve'
import {
  getAudioVisualizationScale,
  getAudioVolumeLineY,
} from '@/features/timeline/utils/audio-volume'

const AUDIO_ENVELOPE_VIEWBOX_HEIGHT = 100
const FADE_VIEWBOX_WIDTH = 1000
const VIDEO_FADE_LINE_Y_PERCENT = 50

export interface FadeMath {
  readonly videoFadeInRatio: number
  readonly videoFadeOutRatio: number
  readonly audioFadeInRatio: number
  readonly audioFadeOutRatio: number
  readonly audioFadeInHoverLabel: string
  readonly audioFadeOutHoverLabel: string
  readonly videoFadeInHoverLabel: string
  readonly videoFadeOutHoverLabel: string
  readonly audioVolumeLineY: number
  readonly audioVolumeLineYPercent: number
  readonly audioVisualizationScale: number
  readonly videoFadeLineYPercent: number
  readonly isAudioVolumeControlActive: boolean
  readonly audioVolumeLineStroke: string
  readonly audioFadeInViewboxWidth: number
  readonly audioFadeOutViewboxWidth: number
  readonly videoFadeInViewboxWidth: number
  readonly videoFadeOutViewboxWidth: number
  readonly audioFadeInCurvePoint: ReturnType<typeof getAudioFadeCurveControlPoint> | null
  readonly audioFadeOutCurvePoint: ReturnType<typeof getAudioFadeCurveControlPoint> | null
  readonly audioFadeInCurvePath: string
  readonly audioFadeOutCurvePath: string
  readonly videoFadeInPath: string
  readonly videoFadeOutPath: string
}

interface UseFadeMathParams {
  item: TimelineItemType
  fps: number
  isVisualFadeItem: boolean
  isSelected: boolean
  audioVolumeEditActive: boolean
  skipFadeComputation: boolean
  clipFadeDurationFrames: number
  displayedVideoFadeIn: number
  displayedVideoFadeOut: number
  displayedAudioFadeIn: number
  displayedAudioFadeOut: number
  displayedAudioFadeInCurve: number
  displayedAudioFadeOutCurve: number
  displayedAudioFadeInCurveX: number
  displayedAudioFadeOutCurveX: number
  displayedAudioVolumeDb: number
}

export function useFadeMath(params: () => UseFadeMathParams): FadeMath {
  // Unpacked one field at a time so each derived below only recomputes when
  // its own inputs change (React's useMemo dependency lists).
  const itemType = $derived(params().item.type)
  const fps = $derived(params().fps)
  const isVisualFadeItem = $derived(params().isVisualFadeItem)
  const isSelected = $derived(params().isSelected)
  const audioVolumeEditActive = $derived(params().audioVolumeEditActive)
  const skipFadeComputation = $derived(params().skipFadeComputation)
  const clipFadeDurationFrames = $derived(params().clipFadeDurationFrames)
  const displayedVideoFadeIn = $derived(params().displayedVideoFadeIn)
  const displayedVideoFadeOut = $derived(params().displayedVideoFadeOut)
  const displayedAudioFadeIn = $derived(params().displayedAudioFadeIn)
  const displayedAudioFadeOut = $derived(params().displayedAudioFadeOut)
  const displayedAudioFadeInCurve = $derived(params().displayedAudioFadeInCurve)
  const displayedAudioFadeOutCurve = $derived(params().displayedAudioFadeOutCurve)
  const displayedAudioFadeInCurveX = $derived(params().displayedAudioFadeInCurveX)
  const displayedAudioFadeOutCurveX = $derived(params().displayedAudioFadeOutCurveX)
  const displayedAudioVolumeDb = $derived(params().displayedAudioVolumeDb)

  const videoFadeInRatio = $derived(
    skipFadeComputation
      ? 0
      : isVisualFadeItem
        ? getAudioFadeRatio(displayedVideoFadeIn, fps, clipFadeDurationFrames)
        : 0,
  )
  const videoFadeOutRatio = $derived(
    skipFadeComputation
      ? 0
      : isVisualFadeItem
        ? getAudioFadeRatio(displayedVideoFadeOut, fps, clipFadeDurationFrames)
        : 0,
  )
  const audioFadeInRatio = $derived(
    skipFadeComputation
      ? 0
      : itemType === 'audio'
        ? getAudioFadeRatio(displayedAudioFadeIn, fps, clipFadeDurationFrames)
        : 0,
  )
  const audioFadeOutRatio = $derived(
    skipFadeComputation
      ? 0
      : itemType === 'audio'
        ? getAudioFadeRatio(displayedAudioFadeOut, fps, clipFadeDurationFrames)
        : 0,
  )
  const audioFadeInHoverLabel = $derived(
    skipFadeComputation ? '' : `Fade In ${displayedAudioFadeIn.toFixed(2)}s`,
  )
  const audioFadeOutHoverLabel = $derived(
    skipFadeComputation ? '' : `Fade Out ${displayedAudioFadeOut.toFixed(2)}s`,
  )
  const videoFadeInHoverLabel = $derived(
    skipFadeComputation ? '' : `Fade In ${displayedVideoFadeIn.toFixed(2)}s`,
  )
  const videoFadeOutHoverLabel = $derived(
    skipFadeComputation ? '' : `Fade Out ${displayedVideoFadeOut.toFixed(2)}s`,
  )
  const audioVolumeLineY = $derived(
    itemType === 'audio'
      ? getAudioVolumeLineY(displayedAudioVolumeDb, AUDIO_ENVELOPE_VIEWBOX_HEIGHT)
      : AUDIO_ENVELOPE_VIEWBOX_HEIGHT / 2,
  )
  const audioVisualizationScale = $derived(
    itemType === 'audio' ? getAudioVisualizationScale(displayedAudioVolumeDb) : 1,
  )
  const audioVolumeLineYPercent = $derived((audioVolumeLineY / AUDIO_ENVELOPE_VIEWBOX_HEIGHT) * 100)
  const isAudioVolumeControlActive = $derived(
    itemType === 'audio' && (isSelected || audioVolumeEditActive),
  )
  const audioVolumeLineStroke = $derived(
    isAudioVolumeControlActive ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.42)',
  )

  const audioFadeInViewboxWidth = $derived(audioFadeInRatio * FADE_VIEWBOX_WIDTH)
  const audioFadeOutViewboxWidth = $derived(audioFadeOutRatio * FADE_VIEWBOX_WIDTH)
  const videoFadeInViewboxWidth = $derived(videoFadeInRatio * FADE_VIEWBOX_WIDTH)
  const videoFadeOutViewboxWidth = $derived(videoFadeOutRatio * FADE_VIEWBOX_WIDTH)

  const audioFadeInCurvePoint = $derived(
    skipFadeComputation
      ? null
      : getAudioFadeCurveControlPoint({
          handle: 'in',
          fadePixels: audioFadeInViewboxWidth,
          clipWidthPixels: FADE_VIEWBOX_WIDTH,
          curve: displayedAudioFadeInCurve,
          curveX: displayedAudioFadeInCurveX,
        }),
  )
  const audioFadeOutCurvePoint = $derived(
    skipFadeComputation
      ? null
      : getAudioFadeCurveControlPoint({
          handle: 'out',
          fadePixels: audioFadeOutViewboxWidth,
          clipWidthPixels: FADE_VIEWBOX_WIDTH,
          curve: displayedAudioFadeOutCurve,
          curveX: displayedAudioFadeOutCurveX,
        }),
  )
  const audioFadeInCurvePath = $derived(
    skipFadeComputation
      ? ''
      : getAudioFadeCurvePath({
          handle: 'in',
          fadePixels: audioFadeInViewboxWidth,
          clipWidthPixels: FADE_VIEWBOX_WIDTH,
          curve: displayedAudioFadeInCurve,
          curveX: displayedAudioFadeInCurveX,
        }),
  )
  const audioFadeOutCurvePath = $derived(
    skipFadeComputation
      ? ''
      : getAudioFadeCurvePath({
          handle: 'out',
          fadePixels: audioFadeOutViewboxWidth,
          clipWidthPixels: FADE_VIEWBOX_WIDTH,
          curve: displayedAudioFadeOutCurve,
          curveX: displayedAudioFadeOutCurveX,
        }),
  )
  const videoFadeInPath = $derived(
    skipFadeComputation
      ? ''
      : getAudioFadeCurvePath({
          handle: 'in',
          fadePixels: videoFadeInViewboxWidth,
          clipWidthPixels: FADE_VIEWBOX_WIDTH,
          curve: 0,
          curveX: 0.52,
        }),
  )
  const videoFadeOutPath = $derived(
    skipFadeComputation
      ? ''
      : getAudioFadeCurvePath({
          handle: 'out',
          fadePixels: videoFadeOutViewboxWidth,
          clipWidthPixels: FADE_VIEWBOX_WIDTH,
          curve: 0,
          curveX: 0.52,
        }),
  )

  return {
    get videoFadeInRatio() {
      return videoFadeInRatio
    },
    get videoFadeOutRatio() {
      return videoFadeOutRatio
    },
    get audioFadeInRatio() {
      return audioFadeInRatio
    },
    get audioFadeOutRatio() {
      return audioFadeOutRatio
    },
    get audioFadeInHoverLabel() {
      return audioFadeInHoverLabel
    },
    get audioFadeOutHoverLabel() {
      return audioFadeOutHoverLabel
    },
    get videoFadeInHoverLabel() {
      return videoFadeInHoverLabel
    },
    get videoFadeOutHoverLabel() {
      return videoFadeOutHoverLabel
    },
    get audioVolumeLineY() {
      return audioVolumeLineY
    },
    get audioVolumeLineYPercent() {
      return audioVolumeLineYPercent
    },
    get audioVisualizationScale() {
      return audioVisualizationScale
    },
    videoFadeLineYPercent: VIDEO_FADE_LINE_Y_PERCENT,
    get isAudioVolumeControlActive() {
      return isAudioVolumeControlActive
    },
    get audioVolumeLineStroke() {
      return audioVolumeLineStroke
    },
    get audioFadeInViewboxWidth() {
      return audioFadeInViewboxWidth
    },
    get audioFadeOutViewboxWidth() {
      return audioFadeOutViewboxWidth
    },
    get videoFadeInViewboxWidth() {
      return videoFadeInViewboxWidth
    },
    get videoFadeOutViewboxWidth() {
      return videoFadeOutViewboxWidth
    },
    get audioFadeInCurvePoint() {
      return audioFadeInCurvePoint
    },
    get audioFadeOutCurvePoint() {
      return audioFadeOutCurvePoint
    },
    get audioFadeInCurvePath() {
      return audioFadeInCurvePath
    },
    get audioFadeOutCurvePath() {
      return audioFadeOutCurvePath
    },
    get videoFadeInPath() {
      return videoFadeInPath
    },
    get videoFadeOutPath() {
      return videoFadeOutPath
    },
  }
}

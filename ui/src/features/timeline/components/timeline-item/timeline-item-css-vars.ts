// SPDX-License-Identifier: MIT

import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import {
  getAudioVisualizationScale,
  getAudioVolumeLineY,
} from '@/features/timeline/utils/audio-volume'
import type { AudioVolumeEditState } from './use-fade-editors.svelte'

export const AUDIO_ENVELOPE_VIEWBOX_HEIGHT = 100

export interface AudioVolumeCssVarsParams {
  itemType: TimelineItemType['type']
  audioVolumeEdit: AudioVolumeEditState | null
  audioVolumePreviewRef: { current: number }
  audioVolumeLineYPercent: number
  audioVisualizationScale: number
}

export interface AudioVolumeCssVars {
  '--timeline-audio-volume-line-y': string
  '--timeline-audio-waveform-scale': string
}

/**
 * Audio envelope custom properties for the clip shell. While a volume drag is
 * live the preview ref is the source of truth (the store value lags the drag).
 */
export function getAudioVolumeCssVars({
  itemType,
  audioVolumeEdit,
  audioVolumePreviewRef,
  audioVolumeLineYPercent,
  audioVisualizationScale,
}: AudioVolumeCssVarsParams): AudioVolumeCssVars {
  const isEditingVolume = itemType === 'audio' && audioVolumeEdit !== null

  return {
    '--timeline-audio-volume-line-y': `${
      isEditingVolume
        ? (getAudioVolumeLineY(audioVolumePreviewRef.current, AUDIO_ENVELOPE_VIEWBOX_HEIGHT) /
            AUDIO_ENVELOPE_VIEWBOX_HEIGHT) *
          100
        : audioVolumeLineYPercent
    }%`,
    '--timeline-audio-waveform-scale': String(
      isEditingVolume
        ? getAudioVisualizationScale(audioVolumePreviewRef.current)
        : audioVisualizationScale,
    ),
  }
}

// SPDX-License-Identifier: MIT

import type { Snippet } from 'svelte'

export interface AudioMixerTrack {
  id: string
  name: string
  kind?: 'video' | 'audio'
  color?: string
  muted: boolean
  solo: boolean
  volume: number // dB, -60 to +12
  eqEnabled?: boolean
  itemIds: string[] // item IDs on this track (for live gain during fader drag)
}

export interface AudioMixerLevel {
  left: number
  right: number
  unresolvedSourceCount: number
  resolvedSourceCount: number
}

export interface AudioMixerViewProps {
  tracks: AudioMixerTrack[]
  perTrackLevels: Map<string, AudioMixerLevel>
  masterEstimate: AudioMixerLevel
  isPlaying: boolean
  masterVolumeDb: number
  masterMuted: boolean
  onMasterVolumeChange: (volumeDb: number) => void
  onMasterMuteToggle: () => void
  onTrackVolumeChange: (trackId: string, volumeDb: number) => void
  onTrackMuteToggle: (trackId: string) => void
  onTrackSoloToggle: (trackId: string) => void
  onTrackEqToggle?: (trackId: string) => void
  onBusEqToggle?: () => void
  activeEqTrackId?: string | null
  busEqActive?: boolean
  busEqEnabled?: boolean
  headerExtra?: Snippet
  /** Expanded layout for floating panel — wider strips, bigger meters */
  expanded?: boolean
}

// SPDX-License-Identifier: MIT

import type { SilenceRemovalSettings } from '@/features/timeline/utils/silence-removal-preview'
import type { TimelineItem } from '@/types/timeline'

export function areSettingsEqual(a: SilenceRemovalSettings, b: SilenceRemovalSettings): boolean {
  return Object.entries(a).every(([key, value]) => b[key as keyof SilenceRemovalSettings] === value)
}

export const SILENCE_REMOVAL_PANEL_STORAGE_KEY = 'timeline:silenceRemovalPanelBounds'
export const SILENCE_REMOVAL_PANEL_DEFAULT_BOUNDS = { x: -1, y: -1, width: 420, height: 320 }

export interface AuditionPlan {
  skipEndFrame?: number
  skipStartFrame?: number
  stopFrame: number
}

export interface ReviewRange {
  end: number
  index: number
  key: string
  label: string
  mediaId: string
  start: number
}

export interface ReviewWaveformModel {
  item: TimelineItem & { mediaId: string; type: 'audio' | 'video' }
  ranges: Array<{ endRatio: number; key: string; startRatio: number }>
  sourceDuration: number
  sourceEnd: number
  sourceStart: number
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.0s'
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  return `${Math.round(seconds)}s`
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

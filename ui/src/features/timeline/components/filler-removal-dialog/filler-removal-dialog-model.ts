// SPDX-License-Identifier: MIT

import type {
  FillerAudioConfidenceLevel,
  FillerPreviewSummary,
  FillerRange,
  FillerRangesByMediaId,
  FillerRemovalSettings,
} from '@/features/timeline/utils/filler-word-removal-preview'

export const FILLER_REMOVAL_PANEL_STORAGE_KEY = 'timeline:fillerRemovalPanelBounds'
export const FILLER_REMOVAL_PANEL_DEFAULT_BOUNDS = { x: -1, y: -1, width: 460, height: 520 }
export const DRAFT_HISTORY_LIMIT = 50

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.0s'
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  return `${Math.round(seconds)}s`
}

export function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00.0'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return `${minutes}:${remainder.toFixed(1).padStart(4, '0')}`
}

export function getConfidenceClass(level: FillerAudioConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
    case 'medium':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-600'
    case 'low':
      return 'border-destructive/40 bg-destructive/10 text-destructive'
    default:
      return 'border-muted-foreground/30 bg-muted/30 text-muted-foreground'
  }
}

function normalizeEntry(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function removeEntry(entries: readonly string[], entry: string): string[] {
  return entries.filter((value) => value !== entry)
}

export function addEntry(entries: readonly string[], value: string): string[] {
  const normalized = normalizeEntry(value)
  if (!normalized || entries.includes(normalized)) {
    return [...entries]
  }
  return [...entries, normalized].toSorted((left, right) => left.localeCompare(right))
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

export function cloneSettings(settings: FillerRemovalSettings): FillerRemovalSettings {
  return {
    fillerWords: [...settings.fillerWords],
    fillerPhrases: [...settings.fillerPhrases],
    paddingMs: settings.paddingMs,
    maxSimpleFillerMs: settings.maxSimpleFillerMs,
    maxPhraseFillerMs: settings.maxPhraseFillerMs,
  }
}

function areEntriesEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index])
}

export function areSettingsEqual(
  left: FillerRemovalSettings,
  right: FillerRemovalSettings,
): boolean {
  return (
    left.paddingMs === right.paddingMs &&
    left.maxSimpleFillerMs === right.maxSimpleFillerMs &&
    left.maxPhraseFillerMs === right.maxPhraseFillerMs &&
    areEntriesEqual(left.fillerWords, right.fillerWords) &&
    areEntriesEqual(left.fillerPhrases, right.fillerPhrases)
  )
}

export function getRangeId(mediaId: string, range: FillerRange, index: number): string {
  return `${mediaId}:${range.start.toFixed(3)}:${range.end.toFixed(3)}:${range.text}:${index}`
}

export function createSelectedRangeIds(rangesByMediaId: FillerRangesByMediaId): Set<string> {
  const selectedIds = new Set<string>()
  for (const [mediaId, ranges] of Object.entries(rangesByMediaId)) {
    ranges.forEach((range, index) => {
      selectedIds.add(getRangeId(mediaId, range, index))
    })
  }
  return selectedIds
}

export function createHighConfidenceSelectedRangeIds(
  rangesByMediaId: FillerRangesByMediaId,
): Set<string> {
  const selectedIds = new Set<string>()
  for (const [mediaId, ranges] of Object.entries(rangesByMediaId)) {
    ranges.forEach((range, index) => {
      if (range.audioConfidence?.level === 'high') {
        selectedIds.add(getRangeId(mediaId, range, index))
      }
    })
  }
  return selectedIds
}

export function filterRangesBySelectedIds(
  rangesByMediaId: FillerRangesByMediaId,
  selectedRangeIds: ReadonlySet<string>,
): FillerRangesByMediaId {
  const selectedRangesByMediaId: FillerRangesByMediaId = {}
  for (const [mediaId, ranges] of Object.entries(rangesByMediaId)) {
    const selectedRanges = ranges.filter((range, index) =>
      selectedRangeIds.has(getRangeId(mediaId, range, index)),
    )
    if (selectedRanges.length > 0) {
      selectedRangesByMediaId[mediaId] = selectedRanges
    }
  }
  return selectedRangesByMediaId
}

export function summarizeRanges(rangesByMediaId: FillerRangesByMediaId): FillerPreviewSummary {
  let rangeCount = 0
  let totalSeconds = 0
  for (const ranges of Object.values(rangesByMediaId)) {
    rangeCount += ranges.length
    totalSeconds += ranges.reduce((sum, range) => sum + Math.max(0, range.end - range.start), 0)
  }
  return { rangeCount, totalSeconds }
}

/** The editable controls a window `keydown` must leave alone, seen through shadow roots. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.getAttribute('role') === 'textbox') return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

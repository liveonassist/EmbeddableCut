// SPDX-License-Identifier: MIT

import type { useBentoPresetsStore } from '@/features/timeline/stores/bento-presets-store'
import type { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
import {
  buildTransitionChains,
  type LayoutPresetType,
} from '@/features/timeline/utils/bento-layout'
import { buildTransitionIndexes } from '@/features/timeline/utils/transition-indexes'

// ── Built-in presets ──────────────────────────────────────────────────────

interface BuiltInPreset {
  type: LayoutPresetType
  labelKey: string
  cols?: number
  rows?: number
}

export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  { type: 'auto', labelKey: 'timeline.bento.presetAuto' },
  { type: 'row', labelKey: 'timeline.bento.presetSideBySide' },
  { type: 'column', labelKey: 'timeline.bento.presetStacked' },
  { type: 'pip', labelKey: 'timeline.bento.presetPip' },
  { type: 'focus-sidebar', labelKey: 'timeline.bento.presetFocusSidebar' },
  { type: 'grid', labelKey: 'timeline.bento.presetGrid2', cols: 2, rows: 2 },
  { type: 'grid', labelKey: 'timeline.bento.presetGrid3', cols: 3, rows: 3 },
]

// ── Item type colors ──────────────────────────────────────────────────────

const ITEM_TYPE_COLORS: Record<string, { bg: string; border: string }> = {
  video: { bg: 'bg-blue-500/60', border: 'border-blue-400/80' },
  image: { bg: 'bg-green-500/60', border: 'border-green-400/80' },
  text: { bg: 'bg-amber-500/60', border: 'border-amber-400/80' },
  shape: { bg: 'bg-purple-500/60', border: 'border-purple-400/80' },
  adjustment: { bg: 'bg-violet-500/60', border: 'border-violet-400/80' },
}

const DEFAULT_COLOR = { bg: 'bg-muted-foreground/40', border: 'border-muted-foreground/60' }

export function getItemColor(type: string) {
  return ITEM_TYPE_COLORS[type] ?? DEFAULT_COLOR
}

// ── Layout canvas item ────────────────────────────────────────────────────

export interface CanvasItemRect {
  id: string
  label: string
  type: string
  left: number
  top: number
  width: number
  height: number
}

// ── Preset strip ──────────────────────────────────────────────────────────

export type SelectedPreset = { kind: 'builtin'; index: number } | { kind: 'custom'; id: string }

export type BentoTransitions = ReturnType<typeof useTransitionsStore.getState>['transitions']
export type BentoPresetsState = ReturnType<typeof useBentoPresetsStore.getState>

export function buildChainOrder(itemIds: string[], transitions: BentoTransitions) {
  const { transitionsByClipId } = buildTransitionIndexes(transitions)
  return buildTransitionChains(itemIds, transitionsByClipId)
}

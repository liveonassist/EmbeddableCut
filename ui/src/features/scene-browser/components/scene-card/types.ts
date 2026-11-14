// SPDX-License-Identifier: MIT

import type { ScoredScene } from '@/features/scene-browser/utils/rank'

type SceneMatchRank = 'top' | 'default'
export type SceneMatchState = { rank: SceneMatchRank }

export interface SceneCardVariantProps {
  scene: ScoredScene
  /** Present while a search is active; toggling it keeps the card instead of remounting. */
  match?: SceneMatchState
}

export function parseCaptionIndex(sceneId: string): number | null {
  const idx = sceneId.lastIndexOf(':')
  if (idx < 0) return null
  const parsed = Number(sceneId.slice(idx + 1))
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

// SPDX-License-Identifier: MIT

import type { ItemEffect } from '@/types/effects'
import type {
  ColorGradeThumbnailTreatment,
  ThumbnailStyle,
} from '@/features/editor/utils/color-grade-thumbnail-treatment'
import type { MiniFilmTileClip } from './mini-timeline'

/** Shared by color-timeline-navigator.svelte and its film tile (one React file upstream). */

export const COLOR_TIMELINE_TEST_ID_PREFIX = 'color-timeline'

/** Film-tile clip extended with track id (for mini lanes) + the live grade. */
export interface ColorTimelineClip extends MiniFilmTileClip {
  trackId: string
  effects: readonly ItemEffect[]
  gradeThumbnail: ColorGradeThumbnailTreatment
}

/** A treatment style object as an inline `style` string. */
export function toStyleString(style: ThumbnailStyle | null | undefined): string | undefined {
  if (!style) return undefined
  const declarations = Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([name, value]) => `${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value}`)
  return declarations.length > 0 ? declarations.join('; ') : undefined
}

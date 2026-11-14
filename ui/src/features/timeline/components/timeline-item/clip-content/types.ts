// SPDX-License-Identifier: MIT

import type { TimelineItem } from '@/types/timeline'

export const WAVEFORM_MIN_WIDTH_PX = 12
export const FILMSTRIP_MIN_WIDTH_PX = 20
export const MEDIA_LABEL_MIN_WIDTH_PX = 28
export const MEDIA_LINK_ICON_MIN_WIDTH_PX = 48
export const MEDIA_LINKED_LABEL_MIN_WIDTH_PX = 56
export const MEDIA_LABEL_ROW_HORIZONTAL_PADDING_PX = 16
export const MEDIA_LABEL_GAP_PX = 6
export const MEDIA_LINK_ICON_WIDTH_PX = 16
export const MEDIA_LINKED_LABEL_VISIBLE_TEXT_WIDTH_PX = 18
export const MEDIA_SYNC_OFFSET_BADGE_HORIZONTAL_PADDING_PX = 12
export const MEDIA_SYNC_OFFSET_CHARACTER_WIDTH_PX = 6.25
export const MEDIA_LOD_VISUAL = 1 << 0
export const MEDIA_LOD_LINK_ICON = 1 << 1
export const MEDIA_LOD_LABEL = 1 << 2
export const MEDIA_LOD_SYNC_OFFSET = 1 << 3

/**
 * Small render buffer: filmstrip/waveform are rendered slightly wider than the
 * clip width.  The parent's overflow:hidden clips the excess invisibly.
 * Protects against sub-frame timing where the CSS variable has updated but
 * the filmstrip width hasn't been committed yet.
 */
export const RENDER_BUFFER = 1.03

export interface ClipContentProps {
  item: TimelineItem
  clipLeftFrames: number
  clipWidthFrames: number
  fps: number
  isCompactWidth?: boolean
  isLinked?: boolean
  preferImmediateRendering?: boolean
  audioWaveformScale?: number
  linkedSyncOffsetFrames?: number | null
  isDetailEligible?: boolean
}

export type MediaTimelineItem = Extract<TimelineItem, { type: 'video' | 'audio' | 'image' }> & {
  mediaId: string
}

export function hasBasicMediaVisuals(item: TimelineItem): boolean {
  if (item.type === 'video') {
    return !!item.mediaId
  }
  if (item.type === 'audio') {
    return !!item.mediaId && !item.compositionId
  }
  return item.type === 'image' && !!item.src && !!item.mediaId
}

export function getMediaVisualMinWidthPx(item: TimelineItem): number {
  return item.type === 'audio' ? WAVEFORM_MIN_WIDTH_PX : FILMSTRIP_MIN_WIDTH_PX
}

export function getSyncOffsetBadgeMinWidthPx(linkedSyncOffsetLabel: string): number {
  const badgeWidthPx =
    MEDIA_SYNC_OFFSET_BADGE_HORIZONTAL_PADDING_PX +
    linkedSyncOffsetLabel.length * MEDIA_SYNC_OFFSET_CHARACTER_WIDTH_PX
  return MEDIA_LABEL_ROW_HORIZONTAL_PADDING_PX + Math.ceil(badgeWidthPx)
}

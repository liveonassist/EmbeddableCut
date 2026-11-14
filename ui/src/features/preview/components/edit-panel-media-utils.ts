// SPDX-License-Identifier: MIT

import type { TimelineItem } from '@/types/timeline'

export function getItemAspectRatio(item: TimelineItem | null): number {
  if (
    item &&
    (item.type === 'video' || item.type === 'image') &&
    item.sourceWidth &&
    item.sourceHeight
  ) {
    return item.sourceWidth / item.sourceHeight
  }
  if (item?.type === 'composition' && item.compositionWidth && item.compositionHeight) {
    return item.compositionWidth / item.compositionHeight
  }
  return 16 / 9
}

export function computeFittedMediaSize(
  panelWidth: number,
  areaHeight: number,
  aspectRatio: number,
): {
  mediaWidth: number
  mediaHeight: number
} {
  let mediaWidth = panelWidth
  let mediaHeight = panelWidth / aspectRatio
  if (mediaHeight > areaHeight) {
    mediaHeight = areaHeight
    mediaWidth = areaHeight * aspectRatio
  }

  return {
    mediaWidth: Math.max(mediaWidth, 1),
    mediaHeight: Math.max(mediaHeight, 1),
  }
}

/**
 * React's renderers returned elements; here they return whatever the panel
 * renders from, and the panels use `PANEL_MEDIA` to get a tagged descriptor
 * their markup branches on.
 */
export interface PanelMediaRenderers<T> {
  renderVideo: (item: TimelineItem, sourceTime: number) => T
  renderImage: (item: TimelineItem) => T
  renderComposition: (item: TimelineItem, sourceFrame: number) => T
  renderPlaceholder: (type: string, text: string) => T
}

export type PanelMedia =
  | { kind: 'video'; item: TimelineItem; sourceTime: number }
  | { kind: 'image'; item: TimelineItem }
  | { kind: 'composition'; item: TimelineItem; sourceFrame: number }
  | { kind: 'placeholder'; type: string; text: string }

export const PANEL_MEDIA: PanelMediaRenderers<PanelMedia> = {
  renderVideo: (item, sourceTime) => ({ kind: 'video', item, sourceTime }),
  renderImage: (item) => ({ kind: 'image', item }),
  renderComposition: (item, sourceFrame) => ({ kind: 'composition', item, sourceFrame }),
  renderPlaceholder: (type, text) => ({ kind: 'placeholder', type, text }),
}

export function renderPanelMedia<T>(
  item: TimelineItem | null,
  sourceTime: number | undefined,
  placeholderText: string | undefined,
  renderers: PanelMediaRenderers<T>,
  sourceFrame?: number,
): T {
  if (!item) {
    return renderers.renderPlaceholder('gap', placeholderText ?? 'GAP')
  }

  if (item.type === 'video') {
    return renderers.renderVideo(item, sourceTime ?? 0)
  }

  if (item.type === 'image') {
    return renderers.renderImage(item)
  }

  if (item.type === 'composition') {
    const fallbackSourceFrame = Math.max(
      0,
      Math.round((sourceTime ?? 0) * Math.max(1, item.sourceFps ?? 30)),
    )
    return renderers.renderComposition(item, sourceFrame ?? fallbackSourceFrame)
  }

  return renderers.renderPlaceholder(item.type, placeholderText ?? item.type)
}

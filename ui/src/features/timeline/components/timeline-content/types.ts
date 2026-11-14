// SPDX-License-Identifier: MIT

import type { TimelineTrack } from '@/types/timeline'

export interface TimelineZoomHandlers {
  handleZoomChange: (newZoom: number) => void
  handleZoomIn: () => void
  handleZoomOut: () => void
  handleZoomToFit: () => void
}

export interface TimelineContentProps {
  duration: number // Total timeline duration in seconds
  tracks: TimelineTrack[]
  /** The horizontal scroll container, bound out for scroll syncing. */
  scroll?: HTMLDivElement | null
  allTracksScroll?: HTMLDivElement | null
  videoTracksScroll?: HTMLDivElement | null
  audioTracksScroll?: HTMLDivElement | null
  videoPaneHeight?: number
  audioPaneHeight?: number
  onSectionDividerMouseDown?: (event: MouseEvent) => void
  onZoomHandlersReady?: (handlers: TimelineZoomHandlers) => void
}

export type TrackScrollbarSection = 'video' | 'audio' | 'single'

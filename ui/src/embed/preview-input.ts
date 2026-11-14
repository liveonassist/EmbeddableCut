// SPDX-License-Identifier: MIT

/**
 * The composition a standalone preview plays: the editor's tracks with their
 * items, media `src` filled in from resolved URLs, as FreeCut's preview
 * builds its player input (without the fast-scrub overlay or proxies).
 */

import type { AudioEqSettings } from '@/types/audio'
import type { CompositionInputProps } from '@/types/export'
import type { ItemKeyframes } from '@/types/keyframe'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import { resolveEffectiveTrackStates } from '@/features/preview/deps/timeline-utils'
import { appendVirtualTranscriptCaptionTrack } from '@/features/preview/deps/caption-items'

export interface PreviewInputSource {
  tracks: TimelineTrack[]
  itemsByTrackId: Record<string, TimelineItem[]>
  items: TimelineItem[]
  transitions: CompositionInputProps['transitions']
  keyframes: ItemKeyframes[]
  busAudioEq?: AudioEqSettings
  fps: number
  project: { width: number; height: number; backgroundColor?: string }
  /** The playable URL of each media item, when known. */
  getMediaUrl: (mediaId: string) => string | null
}

export interface PreviewInput {
  inputProps: CompositionInputProps
  totalFrames: number
  /** The player's render size: the project's, at least 2×2. */
  renderSize: { width: number; height: number }
}

function hasMediaSource(item: TimelineItem): boolean {
  return (
    !!item.mediaId &&
    (item.type === 'video' ||
      item.type === 'audio' ||
      item.type === 'image' ||
      item.type === 'lottie')
  )
}

export function buildPreviewInput(source: PreviewInputSource): PreviewInput {
  const { fps, project } = source
  // Layer-group state (mute/hide/lock/solo) applies to children; group
  // containers, which hold no items, drop out.
  const tracks = resolveEffectiveTrackStates(source.tracks)
    .toSorted((a, b) => b.order - a.order)
    .map((track) => ({
      ...track,
      items: (source.itemsByTrackId[track.id] ?? []).map((item) => {
        if (!hasMediaSource(item)) return item
        const sourceUrl = source.getMediaUrl(item.mediaId!) ?? ''
        const audioSrcMatches = item.type !== 'video' || item.audioSrc === sourceUrl
        if ('src' in item && item.src === sourceUrl && audioSrcMatches) return item
        return {
          ...item,
          src: sourceUrl,
          ...(item.type === 'video' ? { audioSrc: sourceUrl } : {}),
        } as TimelineItem
      }),
    }))

  const furthestItemEndFrame = source.items.reduce(
    (max, item) => Math.max(max, item.from + item.durationInFrames),
    0,
  )
  return {
    inputProps: {
      fps,
      width: project.width,
      height: project.height,
      tracks: appendVirtualTranscriptCaptionTrack(
        tracks,
        fps,
        project.width,
        project.height,
      ) as CompositionInputProps['tracks'],
      transitions: source.transitions,
      backgroundColor: project.backgroundColor,
      keyframes: source.keyframes,
      busAudioEq: source.busAudioEq,
    },
    totalFrames: furthestItemEndFrame === 0 ? 900 : furthestItemEndFrame + fps * 5,
    renderSize: { width: Math.max(2, project.width), height: Math.max(2, project.height) },
  }
}

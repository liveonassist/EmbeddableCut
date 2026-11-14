// SPDX-License-Identifier: MIT

/**
 * Mini timeline — the compact ruler + track-lane strip shared by the Color and
 * Animate workspaces. Compose the pieces you need: every consumer drives the
 * scrub surface with {@link useMiniTimelineScrub} and renders a
 * MiniTimelinePlayhead; the Color/Animate parity layout adds the film-tile row,
 * MiniTimelineIoLane, MiniTimelineAnnotations, MiniTimelineRuler and
 * MiniTimelineTrackLanes on top.
 */
export * from './constants'
export * from './types'
export { resolveMiniTimelineMaxFrame, formatMiniTimelineTimecode } from './utils'
export { useMiniTimelineScrub } from './use-mini-timeline-scrub.svelte'
export { default as MiniTimelinePlayhead } from './mini-timeline-playhead.svelte'
export { default as MiniTimelineRuler } from './mini-timeline-ruler.svelte'
export { default as MiniTimelineTrackLanes } from './mini-timeline-track-lanes.svelte'
export { default as MiniTimelineIoLane } from './mini-timeline-io-lane.svelte'
export { default as MiniTimelineAnnotations } from './mini-timeline-annotations.svelte'
export { default as MiniFilmTile } from './mini-film-tile.svelte'
export { useMediaPosterUrls, useClipStartFrameUrl } from './use-clip-thumbnails.svelte'

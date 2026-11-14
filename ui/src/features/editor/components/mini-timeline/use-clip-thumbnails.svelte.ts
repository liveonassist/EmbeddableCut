// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { select, shallow } from '$lib/store.svelte'
import {
  importMediaLibraryService,
  resolveMediaUrl,
  useMediaLibraryStore,
} from '@/features/editor/deps/media-library'
import { useFilmstrip, type FilmstripFrame } from '@/features/editor/deps/timeline-hooks'
import type { MiniFilmTileClip } from './types'

/**
 * Resolve poster thumbnails (the per-media frame captured at import) for clips
 * with no inline `thumbnailUrl`, so film tiles show a real frame instead of a
 * flat placeholder. The media library service owns/caches/revokes these blob
 * URLs — read only, never revoke here.
 */
export function useMediaPosterUrls(mediaIds: () => readonly string[]): {
  readonly current: Map<string, string>
} {
  let posterUrls = $state.raw<Map<string, string>>(new Map())

  // Reactive snapshot of which media have a poster available, so a clip painted
  // before its thumbnail finishes generating re-resolves once it lands.
  const thumbnailIds = $derived.by(() => {
    const ids = mediaIds()
    return select(
      useMediaLibraryStore,
      (s) => {
        const out: Record<string, string | undefined> = {}
        for (const id of ids) {
          out[id] = s.mediaById[id]?.thumbnailId
        }
        return out
      },
      shallow,
    )
  })

  $effect(() => {
    const known = posterUrls
    const missing = Object.entries(thumbnailIds.current)
      .filter(([id, thumbnailId]) => thumbnailId && !known.has(id))
      .map(([id]) => id)
    if (missing.length === 0) return

    let cancelled = false
    void importMediaLibraryService().then(async ({ mediaLibraryService }) => {
      if (cancelled) return
      // allSettled (not all): one failed thumbnail must not drop the whole
      // batch of successfully-resolved posters.
      const settled = await Promise.allSettled(
        missing.map(async (id) => [id, await mediaLibraryService.getThumbnailBlobUrl(id)] as const),
      )
      if (cancelled) return
      const entries = settled.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      )
      const prev = untrack(() => posterUrls)
      let changed = false
      const next = new Map(prev)
      for (const [id, url] of entries) {
        if (url && !next.has(id)) {
          next.set(id, url)
          changed = true
        }
      }
      if (changed) posterUrls = next
    })

    return () => {
      cancelled = true
    }
  })

  return {
    get current() {
      return posterUrls
    },
  }
}

/**
 * Extract the frame at a video clip's actual start (DaVinci-style), reusing the
 * shared filmstrip cache (1fps, worker-pooled, deduped per media, disk-cached).
 * Returns null for non-video clips or until the frame lands — callers fall back
 * to the import poster so a tile never flashes black.
 */
export function useClipStartFrameUrl(
  clip: () => MiniFilmTileClip,
  projectFps: () => number,
): { readonly current: string | null } {
  const isVideo = $derived(clip().type === 'video' && Boolean(clip().mediaId))
  const mediaId = $derived(clip().mediaId ?? '')

  const media = $derived.by(() => {
    const id = mediaId
    return select(
      useMediaLibraryStore,
      (s) => ({ duration: s.mediaById[id]?.duration ?? 0, fps: s.mediaById[id]?.fps ?? 0 }),
      shallow,
    )
  })

  // Tie the resolved URL to the media it belongs to so a tile reused for a new
  // mediaId (same clip.id, relinked/replaced source) doesn't keep feeding the
  // old blob URL into useFilmstrip — `blobUrl` falls back to null until the new
  // media resolves.
  let resolved = $state.raw<{ mediaId: string; url: string } | null>(null)
  const blobUrl = $derived(resolved?.mediaId === mediaId ? resolved.url : null)

  $effect(() => {
    const id = mediaId
    if (!isVideo || !id || blobUrl) return
    let cancelled = false
    void resolveMediaUrl(id)
      .then((url) => {
        if (!cancelled && url) resolved = { mediaId: id, url }
      })
      .catch(() => {
        /* extraction simply stays unavailable; poster fallback remains */
      })
    return () => {
      cancelled = true
    }
  })

  // Source-frame -> seconds, mirroring clip-content's conversion. Prefer the
  // media's real duration (duration-ratio) over source-fps division when known.
  const timing = $derived.by(() => {
    const c = clip()
    const { duration: mediaDuration, fps: mediaFps } = media.current
    const sourceFps = c.sourceFps > 0 ? c.sourceFps : mediaFps > 0 ? mediaFps : 30
    const sourceDurationSeconds =
      mediaDuration > 0 ? mediaDuration : c.sourceDurationFrames / sourceFps
    const sourceStartSeconds =
      mediaDuration > 0
        ? (c.sourceStartFrames / c.sourceDurationFrames) * mediaDuration
        : c.sourceStartFrames / sourceFps
    const startSeconds = Math.max(
      0,
      sourceStartSeconds + c.trimStartFrames / Math.max(1, projectFps()),
    )
    return { sourceDurationSeconds, startSeconds, startIndex: Math.floor(startSeconds) }
  })

  const filmstrip = useFilmstrip(() => ({
    mediaId,
    blobUrl,
    duration: timing.sourceDurationSeconds,
    isVisible: isVideo,
    enabled: isVideo,
    priorityWindow: { startTime: timing.startSeconds, endTime: timing.startSeconds + 1 },
    targetFrameIndices: [timing.startIndex],
  }))

  const url = $derived.by(() => {
    const frames = filmstrip.frames
    if (!frames || frames.length === 0) return null
    const startIndex = timing.startIndex
    let best: FilmstripFrame | null = null
    for (const frame of frames) {
      if (!best || Math.abs(frame.index - startIndex) < Math.abs(best.index - startIndex)) {
        best = frame
      }
    }
    return best?.url ?? null
  })

  return {
    get current() {
      return url
    },
  }
}

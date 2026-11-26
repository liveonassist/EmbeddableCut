// SPDX-License-Identifier: MIT

import { select } from '$lib/store.svelte'
import { createLogger } from '@/shared/logging/logger'
import { clipProvider, embeddingsProvider } from '@/features/scene-browser/deps/analysis'
import { useMediaLibraryStore } from '@/features/scene-browser/deps/media-library'
import { useSettingsStore } from '@/features/scene-browser/deps/settings'
import { useSceneBrowserStore } from '@/features/scene-browser/stores/scene-browser-store'
import {
  getEmbeddingsSnapshot,
  getImageEmbeddingsSnapshot,
  getPalettesSnapshot,
} from '@/features/scene-browser/utils/embeddings-cache'
import { parseColorQuery } from '@/features/scene-browser/utils/color-boost'
import {
  rankScenes,
  type RankableScene,
  type ScoredScene,
} from '@/features/scene-browser/utils/rank'
import { semanticRank } from '@/features/scene-browser/utils/semantic-rank'

const log = createLogger('SceneBrowser:RankedScenes')

export interface RankedScenesResult {
  scenes: ScoredScene[]
  totalScenes: number
  totalClips: number
  clipsWithCaptions: number
  /**
   * Filenames of media currently being Analyzed-with-AI (and therefore
   * excluded from the scene list above). Exposed so the panel can surface
   * a "re-analyzing" indicator while the old entries are hidden and the
   * new ones haven't landed yet.
   */
  reanalyzingMedia: Array<{ id: string; fileName: string }>
  /**
   * Whether the active search mode produced the shown ranking. Semantic
   * mode falls back to keyword while the query embedding is in flight —
   * the panel can use this to show a subtle "embedding…" indicator.
   */
  activeMode: 'keyword' | 'semantic'
  /**
   * True when a non-empty query is being ranked — toggles per-row score
   * chrome so browsing without a query doesn't look cluttered with 0%
   * badges on every scene.
   */
  isQuerying: boolean
  /**
   * Count of scenes (not clips) whose text embedding is currently loaded
   * in memory, vs. the total visible scene count. Gives the status-bar
   * something concrete to say while the background indexer is still
   * filling things in.
   */
  sceneTextIndexed: number
  /** Same, for CLIP image embeddings. */
  sceneImageIndexed: number
  /**
   * True while we're waiting on the query's semantic text embedding —
   * old scenes still render via keyword fallback, but the panel can show
   * a subtle "embedding query…" pill so the delay isn't mysterious.
   */
  queryTextEmbedding: 'idle' | 'embedding' | 'ready'
  /** Same, for the CLIP text-encoder half of the query. */
  queryImageEmbedding: 'idle' | 'embedding' | 'ready'
}

/**
 * How long typing pauses before a query is embedded. The embedding workers
 * run every job they are sent, aborted or not, so each keystroke would queue
 * a text and a four-template CLIP inference ahead of the one that matters.
 */
const QUERY_EMBED_DELAY_MS = 200

/**
 * Build the ranked scene list for the Scene Browser. The hook owns all
 * joining between media metadata and caption records so components can
 * treat each row as a self-contained record (filename, timestamp, thumb path).
 */
export function useRankedScenes(): { readonly current: RankedScenesResult } {
  const mediaItems = select(useMediaLibraryStore, (s) => s.mediaItems)
  const taggingMediaIds = select(useMediaLibraryStore, (s) => s.taggingMediaIds)
  const query = select(useSceneBrowserStore, (s) => s.query)
  const scope = select(useSceneBrowserStore, (s) => s.scope)
  const sortMode = select(useSceneBrowserStore, (s) => s.sortMode)
  const reference = select(useSceneBrowserStore, (s) => s.reference)
  const captionSearchMode = select(useSettingsStore, (s) => s.captionSearchMode)
  const paletteOnly = $derived(parseColorQuery(query.current).paletteOnly)

  // Embed the query with both text models when semantic mode is active.
  // Keeping each in a separate state slot (rather than a sync read) means
  // typing stays fluid — old scenes remain visible while the new embedding
  // is in flight.
  let queryEmbedding = $state.raw<Float32Array | null>(null)
  let queryImageEmbedding = $state.raw<Float32Array | null>(null)
  let queryTextState = $state<'idle' | 'embedding' | 'ready'>('idle')
  let queryImageState = $state<'idle' | 'embedding' | 'ready'>('idle')

  $effect(() => {
    const currentQuery = query.current
    if (captionSearchMode.current !== 'semantic' || currentQuery.trim().length === 0) {
      queryEmbedding = null
      queryTextState = 'idle'
      return
    }
    if (paletteOnly) {
      queryEmbedding = new Float32Array(0)
      queryTextState = 'ready'
      return
    }
    let cancelled = false
    queryTextState = 'embedding'
    const timer = setTimeout(
      () =>
        void embeddingsProvider
          .embed(currentQuery.trim())
          .then((vector) => {
            if (cancelled) return
            queryEmbedding = vector
            queryTextState = 'ready'
          })
          .catch((error) => {
            if (!cancelled) {
              log.warn('Query text embedding failed — falling back to keyword', {
                query: currentQuery,
                error,
              })
              queryEmbedding = null
              queryTextState = 'idle'
            }
          }),
      QUERY_EMBED_DELAY_MS,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  })

  // CLIP text-encoder embedding for the visual side. Loaded independently
  // so a slow CLIP download doesn't block text-side ranking — scenes can
  // be shown via text-only cosine until the CLIP query vector lands.
  $effect(() => {
    const currentQuery = query.current
    if (
      captionSearchMode.current !== 'semantic' ||
      currentQuery.trim().length === 0 ||
      paletteOnly
    ) {
      queryImageEmbedding = null
      queryImageState = 'idle'
      return
    }
    let cancelled = false
    queryImageState = 'embedding'
    // Use the ensembled path so a one-word query ("fighting") gets
    // wrapped in natural-sentence templates before embedding — CLIP is
    // badly behaved on bare tokens and the averaged vector materially
    // reduces false positives like "a tower matches fighting".
    const timer = setTimeout(
      () =>
        void clipProvider
          .embedQueryForImages(currentQuery.trim())
          .then((vector) => {
            if (cancelled) return
            if (vector) {
              queryImageEmbedding = vector
              queryImageState = 'ready'
            } else {
              queryImageState = 'idle'
            }
          })
          .catch((error) => {
            if (!cancelled) {
              log.warn('CLIP query embedding failed — skipping visual ranking', {
                query: currentQuery,
                error,
              })
              queryImageEmbedding = null
              queryImageState = 'idle'
            }
          }),
      QUERY_EMBED_DELAY_MS,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  })

  const result = $derived.by<RankedScenesResult>(() => {
    const items = mediaItems.current
    const tagging = taggingMediaIds.current
    const currentQuery = query.current
    const currentScope = scope.current
    const currentReference = reference.current
    const allScenes: RankableScene[] = []
    const reanalyzingMedia: Array<{ id: string; fileName: string }> = []
    let clipsWithCaptions = 0

    for (const media of items) {
      if (currentScope && media.id !== currentScope) continue
      // Hide entries for media that's actively being Analyzed-with-AI —
      // the old captions are about to be replaced, and surfacing them
      // alongside "re-analyzing" state would be misleading.
      if (tagging.has(media.id)) {
        if (media.aiCaptions && media.aiCaptions.length > 0) {
          reanalyzingMedia.push({ id: media.id, fileName: media.fileName })
        }
        continue
      }
      const captions = media.aiCaptions
      if (!captions || captions.length === 0) continue
      clipsWithCaptions += 1
      captions.forEach((caption, captionIndex) => {
        allScenes.push({
          id: `${media.id}:${captionIndex}`,
          mediaId: media.id,
          mediaFileName: media.fileName,
          timeSec: caption.timeSec,
          text: caption.text,
          thumbRelPath: caption.thumbRelPath,
          palette: caption.palette,
        })
      })
    }

    const textEmbedding = queryEmbedding
    const isSemanticActive =
      captionSearchMode.current === 'semantic' &&
      currentQuery.trim().length > 0 &&
      textEmbedding !== null

    const textEmbeddings = getEmbeddingsSnapshot()
    const imageEmbeddings = getImageEmbeddingsSnapshot()
    const paletteSnapshot = getPalettesSnapshot()

    // A reference palette forces semantic-lane ranking (palette-only
    // scoring inside semanticRank). The query stays visible in the input
    // but is ignored until the reference is cleared.
    let ranked
    if (currentReference) {
      ranked = semanticRank(new Float32Array(0), allScenes, textEmbeddings, {
        palettes: paletteSnapshot,
        referencePalette: currentReference.palette,
      })
    } else if (isSemanticActive) {
      ranked = semanticRank(textEmbedding, allScenes, textEmbeddings, {
        queryImageEmbedding,
        imageEmbeddings,
        query: currentQuery,
        palettes: paletteSnapshot,
      })
    } else {
      ranked = rankScenes(currentQuery, allScenes)
    }

    // Coverage stats over the scenes the user can currently see, not
    // over the whole library — keeps the "indexed" counter honest when
    // scoped to a single media.
    let sceneTextIndexed = 0
    let sceneImageIndexed = 0
    for (const scene of allScenes) {
      if (textEmbeddings.has(scene.id)) sceneTextIndexed += 1
      if (imageEmbeddings.has(scene.id)) sceneImageIndexed += 1
    }

    const currentSortMode = sortMode.current
    const hasRankingSignal = currentQuery.trim().length > 0 || !!currentReference
    if (!hasRankingSignal || currentSortMode === 'time' || currentSortMode === 'name') {
      ranked.sort((a, b) => {
        if (a.mediaFileName !== b.mediaFileName) {
          return a.mediaFileName.localeCompare(b.mediaFileName)
        }
        return a.timeSec - b.timeSec
      })
    }
    // relevance sort is the default output of rankScenes / semanticRank.

    return {
      scenes: ranked,
      totalScenes: allScenes.length,
      totalClips: items.length,
      clipsWithCaptions,
      reanalyzingMedia,
      activeMode: isSemanticActive || currentReference ? 'semantic' : 'keyword',
      isQuerying: hasRankingSignal,
      sceneTextIndexed,
      sceneImageIndexed,
      queryTextEmbedding: queryTextState,
      queryImageEmbedding: queryImageState,
    }
  })

  return {
    get current() {
      return result
    },
  }
}

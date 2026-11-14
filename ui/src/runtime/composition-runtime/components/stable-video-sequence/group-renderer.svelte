<!-- SPDX-License-Identifier: MIT -->
<!--
  Renders the active item from a group based on current frame.

  CRITICAL for halftone/canvas effects: the adjusted item only changes when
  crossing split boundaries, so the rendered item content isn't re-derived
  every frame.
-->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const warmupLog = createLogger('StableVideoWarmup')
  const SAME_ORIGIN_SHADOW_MOUNT_MIN_LOOKAHEAD_FRAMES = 8
  const SHADOW_UNMOUNT_COOLDOWN_FRAMES = 18
  const TRANSITION_SYNC_COOLDOWN_FRAMES = 18
  const TRANSITION_WARMUP_LOOKAHEAD_SECONDS = 1.5

  function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a.size !== b.size) return false
    for (const id of a) if (!b.has(id)) return false
    return true
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import {
    useSequenceContext,
    useVideoSourcePool,
  } from '@/runtime/composition-runtime/deps/player'
  import { DEFAULT_SPEED, getSafeTrimBefore } from '@/runtime/composition-runtime/deps/timeline'
  import { useMediaLibraryStore } from '@/runtime/composition-runtime/deps/stores'
  import type { TimelineItem } from '@/types/timeline'
  import type { ResolvedTransitionWindow } from '@/shared/timeline/transitions/transition-planner'
  import {
    findActiveVideoItemIndex,
    type StableVideoGroup,
  } from '@/runtime/composition-runtime/utils/video-scene'
  import {
    buildTransitionShadowItems,
    collectTransitionParticipantClipIds,
    resolveSameOriginTransitionActiveIndex,
    resolveTransitionParticipantIndexKey,
    resolveTransitionParticipantItems,
  } from '@/runtime/composition-runtime/utils/transition-scene'
  import { buildTransitionShadowWarmupRequests } from '@/runtime/composition-runtime/utils/transition-shadow-warmup'
  import { useVideoConfig } from '../../hooks/use-player-compat.svelte'
  import { useTransitionParticipantSync } from '../../hooks/use-transition-participant-sync.svelte'
  import HiddenShadowVideoBridge from './hidden-shadow-video-bridge.svelte'
  import ProResDecoderPrewarm from './prores-decoder-prewarm.svelte'
  import type { StableVideoSequenceItem } from './types'

  let {
    group,
    transitionWindows = [],
    renderItem,
  }: {
    group: StableVideoGroup<StableVideoSequenceItem>
    transitionWindows?: ResolvedTransitionWindow<TimelineItem>[]
    renderItem: Snippet<[StableVideoSequenceItem]>
  } = $props()

  // Get local frame from Sequence context (0-based within this Sequence)
  const sequenceContext = useSequenceContext()
  const localFrame = $derived(sequenceContext?.localFrame ?? 0)

  // CRITICAL: Don't render during premount phase (localFrame < 0)
  // Premount is for keeping the tree mounted, not for showing content.
  // Without this check, clips with gaps would show their start frame
  // before the playhead actually reaches them.
  const isPremounted = $derived(localFrame < 0)

  // Convert to global frame for comparison with item.from (which is global)
  const globalFrame = $derived(localFrame + group.minFrom)

  // During premount, warm the decoder for an upcoming ProRes clip so crossing into it
  // during playback paints immediately instead of cold-starting to black. The src of
  // the nearest upcoming browser-undecodable (ProRes) clip, or null.
  const prewarmSrc = $derived.by(() => {
    if (!isPremounted) return null
    const mediaById = useMediaLibraryStore.getState().mediaById
    const upcoming = group.items
      .filter((it) => it.src && it.mediaId && it.from + it.durationInFrames > globalFrame)
      .sort((a, b) => a.from - b.from)[0]
    if (!upcoming?.mediaId || !upcoming.src) return null
    return mediaById[upcoming.mediaId]?.videoCodecSupported === false ? upcoming.src : null
  })

  // Find the active item ID for current frame
  // During premount, don't find any active item - we shouldn't render.
  const rawActiveItemIndex = $derived(
    isPremounted ? -1 : findActiveVideoItemIndex(group.items, globalFrame),
  )

  // Stabilize active index during same-origin transitions.
  // When two items in the same group participate in a transition (A→A clip,
  // same media/origin split), the active index switches mid-transition at
  // the cut point. This causes the primary pool lane's video element to
  // seek to a different source position and the shadow to remount — both
  // stalling frame delivery for 200-500ms. Keep the LEFT clip as active
  // throughout the transition so pool lanes and shadows stay stable.
  const activeItemIndex = $derived(
    resolveSameOriginTransitionActiveIndex({
      rawActiveItemIndex,
      items: group.items,
      transitionWindows,
      frame: globalFrame,
    }),
  )

  const activeItem = $derived(activeItemIndex >= 0 ? group.items[activeItemIndex] : null)

  const videoConfig = useVideoConfig()
  const fps = $derived(videoConfig.fps)
  const pool = useVideoSourcePool()

  const transitionWarmupClipIds = $derived.by(() => {
    if (isPremounted || activeItemIndex < 0 || group.items.length <= 1) return ''
    const transitionClipIds = collectTransitionParticipantClipIds({
      transitionWindows,
      frame: globalFrame,
      lookaheadFrames: Math.round(fps * TRANSITION_WARMUP_LOOKAHEAD_SECONDS),
    })
    return resolveTransitionParticipantIndexKey({
      items: group.items,
      activeItemIndex,
      transitionClipIds,
    })
  })

  // Mount hidden transition shadows only a few frames before the overlap.
  // Pool lane warmup happens earlier; hidden DOM activation should stay late so
  // normal playback keeps using the simple single-clip path until near the cut.
  const overlapKey = $derived.by(() => {
    if (isPremounted || activeItemIndex < 0 || group.items.length <= 1) return ''
    const shadowMountLookaheadFrames = Math.max(
      SAME_ORIGIN_SHADOW_MOUNT_MIN_LOOKAHEAD_FRAMES,
      Math.ceil(fps * TRANSITION_WARMUP_LOOKAHEAD_SECONDS),
    )
    const transitionClipIds = collectTransitionParticipantClipIds({
      transitionWindows,
      frame: globalFrame,
      lookaheadFrames: shadowMountLookaheadFrames,
      lookbehindFrames: SHADOW_UNMOUNT_COOLDOWN_FRAMES,
    })
    return resolveTransitionParticipantIndexKey({
      items: group.items,
      activeItemIndex,
      transitionClipIds,
    })
  })

  // Recomputed every frame, but kept as the same Set while its members are
  // unchanged, so what derives from it stays put between frames.
  let previousActiveTransitionClipIds: Set<string> | null = null
  const activeTransitionClipIds = $derived.by(() => {
    const next = collectTransitionParticipantClipIds({
      transitionWindows,
      frame: globalFrame,
      lookaheadFrames: 0,
      lookbehindFrames: TRANSITION_SYNC_COOLDOWN_FRAMES,
    })
    if (previousActiveTransitionClipIds && sameMembers(previousActiveTransitionClipIds, next)) {
      return previousActiveTransitionClipIds
    }
    previousActiveTransitionClipIds = next
    return next
  })

  const warmupShadows = $derived(
    resolveTransitionParticipantItems({ items: group.items, indexKey: transitionWarmupClipIds }),
  )

  // Only rebuilt when the overlap composition changes; the key compares by value.
  const adjustedShadows = $derived(
    buildTransitionShadowItems({
      items: group.items,
      indexKey: overlapKey,
      groupMinFrom: group.minFrom,
      activeTransitionClipIds,
    }),
  )

  // The adjusted item changes only when crossing split boundaries or when
  // item/group properties change.
  const adjustedItem = $derived.by((): StableVideoSequenceItem | null => {
    if (!activeItem) return null

    // Keep source metadata absolute/stable.
    // Shared Sequence frame-origin differences are handled downstream via
    // _sequenceFrameOffset in video timing calculations.
    const itemOffset = activeItem.from - group.minFrom

    return {
      ...activeItem,
      // Pass the frame offset so fades can be calculated correctly within shared Sequences
      // Without this, the sequence frame is relative to the shared Sequence,
      // not relative to this specific item, causing fades to misbehave on split clips
      _sequenceFrameOffset: itemOffset,
      // Keep a stable pool identity across split boundaries so preview video
      // playback does not release/reacquire the element on item.id changes.
      _poolClipId: `group-${group.originKey}`,
      _sharedTransitionSync: activeTransitionClipIds.has(activeItem.id),
    }
  })

  const transitionWarmupRequests = $derived(
    buildTransitionShadowWarmupRequests(adjustedItem, warmupShadows),
  )

  const syncShadows = $derived(
    adjustedShadows.filter((item) => activeTransitionClipIds.has(item.id)),
  )

  const transitionSyncParticipants = $derived.by(() => {
    if (
      !adjustedItem ||
      syncShadows.length === 0 ||
      !activeTransitionClipIds.has(adjustedItem.id)
    ) {
      return []
    }

    const mediaById = useMediaLibraryStore.getState().mediaById
    const toParticipant = (item: StableVideoSequenceItem, role: 'leader' | 'follower') => {
      const trimBefore = item.sourceStart ?? item.trimStart ?? item.offset ?? 0
      const mediaSourceFps = item.mediaId ? mediaById[item.mediaId]?.fps : undefined
      const sourceFps = item.sourceFps ?? mediaSourceFps ?? fps
      const playbackRate = item.speed ?? DEFAULT_SPEED
      const safeTrimBefore = getSafeTrimBefore(
        trimBefore,
        item.durationInFrames,
        playbackRate,
        item.sourceDuration || undefined,
        fps,
        sourceFps,
      )

      return {
        poolClipId: item._poolClipId ?? item.id,
        safeTrimBefore,
        sourceFps,
        playbackRate,
        sequenceFrameOffset: item._sequenceFrameOffset ?? 0,
        role,
      }
    }

    return [
      toParticipant(adjustedItem, 'leader'),
      ...syncShadows.map((item) => toParticipant(item, 'follower')),
    ]
  })

  useTransitionParticipantSync(
    () => transitionSyncParticipants,
    () => group.minFrom,
    () => fps,
  )

  $effect(() => {
    const requests = transitionWarmupRequests
    if (requests.length === 0) {
      return
    }

    let cancelled = false

    for (const request of requests) {
      void pool
        .ensureReadyLanes(request.sourceUrl, request.minTotalLanes, {
          targetTimeSeconds: request.targetTimeSeconds,
          warmDecode: true,
        })
        .catch((error) => {
          if (cancelled) return
          warmupLog.debug('Transition shadow warmup failed:', request.sourceUrl, error)
        })
    }

    return () => {
      cancelled = true
    }
  })
</script>

{#if adjustedItem}
  {@render renderItem(adjustedItem)}
{/if}
{#each adjustedShadows as shadow (shadow.id)}
  <HiddenShadowVideoBridge item={shadow} />
{/each}
{#if prewarmSrc}
  <ProResDecoderPrewarm src={prewarmSrc} />
{/if}

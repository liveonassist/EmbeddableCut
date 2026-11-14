<!-- SPDX-License-Identifier: MIT -->
<!--
  Renders the contents of a sub-composition inline within the main preview.

  Each sub-composition item is rendered via a Sequence at its local `from`,
  offset so that frame 0 of the sub-comp maps to the CompositionItem's
  `from` on the parent timeline.

  The sub-comp is rendered at its own native resolution inside a VideoConfigProvider,
  then CSS-scaled to fit the parent container dimensions. This ensures sub-items
  use the correct coordinate space (sub-comp dimensions, not main canvas).
-->
<script lang="ts" module>
  import type { TimelineItem } from '@/types/timeline'
  import type { ResolvedAudioEqSettings } from '@/types/audio'
  import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
  import {
    mapSourceWindowOverlap,
    timelineToSourceFrames,
  } from '@/runtime/composition-runtime/deps/timeline'
  import { resolveProxyUrl } from '@/runtime/composition-runtime/deps/media-library'
  import type { resolveTrackRenderState } from '@/runtime/composition-runtime/utils/scene-assembly'

  const EMPTY_AUDIO_EQ_STAGES: ResolvedAudioEqSettings[] = []
  type TrackRenderState = ReturnType<typeof resolveTrackRenderState>
  const EMPTY_VISIBLE_TRACKS_BY_ORDER_DESC: TrackRenderState['visibleTracksByOrderDesc'] = []
  const EMPTY_VISIBLE_TRACKS: TrackRenderState['visibleTracks'] = []

  interface CompositionWindow {
    durationInFrames: number
    speed?: number
    sourceFps?: number
    sourceStart?: number
    sourceEnd?: number
    trimStart?: number
  }

  /**
   * Resolve media URLs on sub-comp items using the centralized blob URL manager.
   * The parent preview has already acquired blob URLs for all mediaIds —
   * we just need to look them up and set `src`.
   */
  function resolveSubCompItem(
    subItem: TimelineItem,
    nestedMediaResolutionMode: 'source' | 'proxy',
  ): TimelineItem {
    if (
      subItem.mediaId &&
      (subItem.type === 'video' ||
        subItem.type === 'audio' ||
        subItem.type === 'image' ||
        subItem.type === 'lottie')
    ) {
      const sourceSrc = blobUrlManager.get(subItem.mediaId) ?? ''

      if (subItem.type === 'video') {
        const proxySrc =
          nestedMediaResolutionMode === 'proxy' ? resolveProxyUrl(subItem.mediaId) : null
        const resolvedSrc = proxySrc || sourceSrc
        const resolvedAudioSrc = sourceSrc || undefined
        if (resolvedSrc !== subItem.src || subItem.audioSrc !== resolvedAudioSrc) {
          return { ...subItem, src: resolvedSrc, audioSrc: resolvedAudioSrc }
        }
        return subItem
      }

      if (sourceSrc !== subItem.src) {
        return { ...subItem, src: sourceSrc } as TimelineItem
      }
    }
    return subItem
  }

  function mapSubCompItemToWrapperWindow(params: {
    subItem: TimelineItem
    wrapper: CompositionWindow
    parentFps: number
    subCompFps: number
  }): TimelineItem | null {
    const { subItem, wrapper, parentFps, subCompFps } = params
    const wrapperSourceStart = wrapper.sourceStart ?? wrapper.trimStart ?? 0
    const mapping = mapSourceWindowOverlap({
      itemStart: subItem.from,
      itemDuration: subItem.durationInFrames,
      wrapperDuration: wrapper.durationInFrames,
      wrapperSpeed: wrapper.speed,
      wrapperSourceFps: wrapper.sourceFps,
      wrapperSourceStart,
      wrapperSourceEnd: wrapper.sourceEnd,
      timelineFps: parentFps,
      fallbackSourceFps: subCompFps,
    })

    if (!mapping) return null

    const mappedItem: TimelineItem = {
      ...subItem,
      from: mapping.mappedFrom,
      durationInFrames: mapping.mappedDuration,
      speed: (subItem.speed ?? 1) * mapping.wrapperSpeed,
    }

    if (subItem.type === 'video' || subItem.type === 'audio' || subItem.type === 'composition') {
      const childSourceFps = subItem.sourceFps ?? subCompFps
      const childSpeed = subItem.speed ?? 1
      const sourceStartDelta = timelineToSourceFrames(
        mapping.clippedStartFrames,
        childSpeed,
        subCompFps,
        childSourceFps,
      )
      const sourceEndDelta = timelineToSourceFrames(
        mapping.clippedEndFrames,
        childSpeed,
        subCompFps,
        childSourceFps,
      )
      const nextSourceStart = (subItem.sourceStart ?? 0) + sourceStartDelta

      mappedItem.sourceStart = nextSourceStart
      if (subItem.sourceEnd !== undefined) {
        mappedItem.sourceEnd = Math.max(nextSourceStart + 1, subItem.sourceEnd - sourceEndDelta)
      }
    }

    return mappedItem
  }
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import {
    AbsoluteFill,
    Sequence,
    useSequenceContext,
  } from '@/runtime/composition-runtime/deps/player'
  import type { ShapeItem } from '@/types/timeline'
  import { useCompositionsStore } from '@/runtime/composition-runtime/deps/stores'
  import { useBlobUrlVersion } from '@/infrastructure/browser/use-blob-url-version.svelte'
  import { VideoConfigProvider } from '@/runtime/composition-runtime/deps/player'
  import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
  import { hasKeyframeAnimation } from '@/runtime/composition-runtime/deps/keyframes'
  import { useVideoConfig } from '../hooks/use-player-compat.svelte'
  import { KeyframesProvider } from '../contexts/keyframes-context'
  import { useKeyframesContext } from '../contexts/keyframes-context-core'
  import { useRuntimeItemKeyframes } from './hooks/use-runtime-item-keyframes.svelte'
  import { useVisualFreezeFrame } from './hooks/use-visual-freeze-frame.svelte'
  import { useCompositionSpace } from '../contexts/composition-space-context'
  import CompositionSpaceProvider from '../contexts/composition-space-provider.svelte'
  import { useNestedMediaResolutionMode } from '../contexts/nested-media-resolution-context'
  import { clearMixerLiveGain } from '@/shared/state/mixer-live-gain'
  import { appendResolvedAudioEqSources } from '@/shared/utils/audio-eq'
  import ItemContent from './item-content.svelte'
  import CompositionContent from './composition-content.svelte'
  import type { MaskInfo, RenderCompositionContentProps } from './item-types'
  import type { CompositionContentProps } from './composition-content-types'
  import { StableVideoSequence, type StableVideoSequenceItem } from './stable-video-sequence'
  import {
    resolveActiveShapeMasksAtFrame,
    resolveItemTransformAtFrame,
  } from '@/runtime/composition-runtime/utils/frame-scene'
  import {
    EMPTY_MASK_INFOS,
    getMasksForTrackOrder,
    materializeMaskInfos,
    reuseStableMaskInfos,
  } from '../utils/mask-info'
  import {
    collectVisibleTextFontFamilies,
    resolveTrackRenderState as resolveTracks,
  } from '@/runtime/composition-runtime/utils/scene-assembly'
  import { getLinkedVideoIdsWithAudio, hasLinkedAudioCompanion } from '@/shared/utils/linked-media'
  import { loadFonts } from '@/runtime/composition-runtime/utils/fonts'
  import { applyCompositionControlOverrides } from '@/shared/utils/composition-controls'
  import { useStoreSelector } from '../../use-sync-external-store.svelte'
  import { styleToString } from '../../style-object'
  import { createMemo } from '../../memo'

  let props: CompositionContentProps = $props()

  // Compared by value, as React's memo dependencies were: a parent re-creating
  // the objects these are read from must not rebuild the derived item lists.
  const item = $derived(props.item)
  const parentMuted = $derived(props.parentMuted ?? false)
  const parentVisible = $derived(props.parentVisible ?? true)
  const renderDepth = $derived(props.renderDepth ?? 0)
  const renderMode = $derived(props.renderMode ?? 'full')
  const audioGainMultiplier = $derived(props.audioGainMultiplier ?? 1)
  const audioGainLiveItemIds = $derived(props.audioGainLiveItemIds)
  const audioEqStages = $derived(props.audioEqStages ?? EMPTY_AUDIO_EQ_STAGES)
  const audioPitchShiftSemitones = $derived(props.audioPitchShiftSemitones ?? 0)
  const crossfadeFadeInFrames = $derived(props.crossfadeFadeInFrames)
  const crossfadeFadeOutFrames = $derived(props.crossfadeFadeOutFrames)

  const itemId = $derived(item.id)
  const compositionId = $derived(item.compositionId)
  const subCompState = useStoreSelector(useCompositionsStore, (s) =>
    s.compositions.find((c) => c.id === compositionId),
  )
  const subComp = $derived(subCompState.current)
  const videoConfig = useVideoConfig()
  const renderWidth = $derived(videoConfig.width)
  const renderHeight = $derived(videoConfig.height)
  const mainFps = $derived(videoConfig.fps)
  const nestedMediaResolutionMode = useNestedMediaResolutionMode()
  const compositionSpace = useCompositionSpace()
  const projectWidth = $derived(compositionSpace.current?.projectWidth ?? renderWidth)
  const projectHeight = $derived(compositionSpace.current?.projectHeight ?? renderHeight)
  const renderScaleX = $derived(compositionSpace.current?.scaleX ?? 1)
  const renderScaleY = $derived(compositionSpace.current?.scaleY ?? 1)
  const wrapperDuration = $derived(item.durationInFrames)
  const wrapperSpeed = $derived(item.speed)
  const wrapperSourceFps = $derived(item.sourceFps)
  const wrapperSourceStart = $derived(item.sourceStart)
  const wrapperSourceEnd = $derived(item.sourceEnd)
  const wrapperTrimStart = $derived(item.trimStart)
  const wrapperWindow = $derived<CompositionWindow>({
    durationInFrames: wrapperDuration,
    speed: wrapperSpeed,
    sourceFps: wrapperSourceFps,
    sourceStart: wrapperSourceStart,
    sourceEnd: wrapperSourceEnd,
    trimStart: wrapperTrimStart,
  })

  // Re-run when blob URLs are acquired (fixes media not loading on project load)
  const blobUrlVersion = useBlobUrlVersion()
  const compositionControlOverrides = $derived(
    item.type === 'composition' ? item.compositionControlOverrides : undefined,
  )

  // Resolve media URLs for sub-comp items so they can render in preview
  const resolvedItemsMemo = createMemo<TimelineItem[]>()
  const resolvedItems = $derived.by(() => {
    const version = blobUrlVersion.current
    const comp = subComp
    const mode = nestedMediaResolutionMode.current
    const overrides = compositionControlOverrides
    const window = wrapperWindow
    const fps = mainFps
    return resolvedItemsMemo([version, comp, mode, overrides, window, fps], () => {
      if (!comp) return []
      return applyCompositionControlOverrides(
        comp.items,
        comp.compositionControls,
        compositionControlOverrides,
      )
        .map((subItem) => resolveSubCompItem(subItem, mode))
        .flatMap((subItem) => {
          const mapped = mapSubCompItemToWrapperWindow({
            subItem,
            wrapper: window,
            parentFps: fps,
            subCompFps: comp.fps,
          })
          return mapped ? [mapped] : []
        })
    })
  })

  // === Compute parent container dimensions ===
  // Replicates the same priority chain as useItemVisualState:
  // unified preview > gizmo preview > keyframes > base
  //
  // Granular selectors: extract only the values we need to avoid
  // re-running when unrelated gizmo store fields change reference.
  const activeGizmoItemId = select(useGizmoStore, (state) => state.activeGizmo?.itemId)
  const liveGizmoPreviewWidth = select(useGizmoStore, (state) => state.previewTransform?.width)
  const liveGizmoPreviewHeight = select(useGizmoStore, (state) => state.previewTransform?.height)
  const liveGizmoPreview = $derived(
    liveGizmoPreviewWidth.current === undefined && liveGizmoPreviewHeight.current === undefined
      ? undefined
      : { width: liveGizmoPreviewWidth.current, height: liveGizmoPreviewHeight.current },
  )
  const itemPreview = useStoreSelector(useGizmoStore, (s) => s.preview?.[itemId])
  const allItemPreviews = select(useGizmoStore, (state) => state.preview)

  const itemKeyframes = useRuntimeItemKeyframes(() => itemId)
  const keyframesContext = useKeyframesContext()
  const hasAnimatedKeyframes = $derived(
    !!(itemKeyframes.current && hasKeyframeAnimation(itemKeyframes.current)),
  )
  const hasAnimatedTransform = $derived(
    hasAnimatedKeyframes ||
      !!item.transformParent?.parentItemId ||
      !!item.motionModifiers?.some((modifier) => modifier.enabled),
  )

  const sequenceContext = useSequenceContext()
  const frame = $derived(sequenceContext?.localFrame ?? 0)
  const relativeFrame = $derived(
    frame - ((item as TimelineItem & { _sequenceFrameOffset?: number })._sequenceFrameOffset ?? 0),
  )
  const visualFrame = useVisualFreezeFrame(() => relativeFrame)
  const sourceOffset = $derived(item.sourceStart ?? item.trimStart ?? 0)
  const subCompFrame = $derived(
    sourceOffset +
      timelineToSourceFrames(
        relativeFrame,
        item.speed ?? 1,
        mainFps,
        item.sourceFps ?? subComp?.fps ?? mainFps,
      ),
  )

  // Only depend on the relative frame when keyframes are actually animated.
  // This prevents per-frame recomputation during playback for non-animated sub-comps.
  // During overlay playback the container transform is occluded by the GPU overlay,
  // so freeze it at the pre-playback frame (subCompFrame above stays live so the
  // nested tree keeps mounting/playing the right items for the overlay to sample).
  const keyframeFrame = $derived(hasAnimatedTransform ? visualFrame.current : 0)

  const containerDims = $derived.by(() => {
    const activeId = activeGizmoItemId.current
    const livePreview = liveGizmoPreview
    const previews = allItemPreviews.current
    const canvas = { width: projectWidth, height: projectHeight, fps: mainFps }
    const unifiedPreviewTransform = itemPreview.current?.transform
    const rootPreview =
      unifiedPreviewTransform ??
      (activeId === item.id ? (livePreview ?? undefined) : undefined)
    const resolved = resolveItemTransformAtFrame(item, {
      canvas,
      frame: item.from + keyframeFrame,
      keyframes: itemKeyframes.current ?? undefined,
      previewTransform: rootPreview,
      getItem: keyframesContext?.getItem,
      getKeyframes: keyframesContext?.getItemKeyframes,
      getPreviewTransform: (candidateId) =>
        activeId === candidateId && livePreview
          ? livePreview
          : previews?.[candidateId]?.transform,
    })

    return {
      width: resolved.width * renderScaleX,
      height: resolved.height * renderScaleY,
    }
  })

  const trackRenderState = $derived(subComp ? resolveTracks(subComp.tracks) : null)
  const sortedTracks = $derived(
    trackRenderState?.visibleTracksByOrderDesc ?? EMPTY_VISIBLE_TRACKS_BY_ORDER_DESC,
  )
  const visibleTracks = $derived(trackRenderState?.visibleTracks ?? EMPTY_VISIBLE_TRACKS)
  const visibleTextFontFamilies = $derived(collectVisibleTextFontFamilies(visibleTracks))
  const maxTrackOrder = $derived(
    sortedTracks.reduce((max, track) => Math.max(max, track.order ?? 0), 0),
  )
  const linkedVideoIdsWithOwnedAudio = $derived(getLinkedVideoIdsWithAudio(resolvedItems))
  const videoItemsMemo = createMemo<StableVideoSequenceItem[]>()
  const videoItems = $derived.by((): StableVideoSequenceItem[] =>
    videoItemsMemo(
      [
        linkedVideoIdsWithOwnedAudio,
        maxTrackOrder,
        parentMuted,
        parentVisible,
        renderMode,
        resolvedItems,
        sortedTracks,
      ],
      () => {
        if (renderMode === 'audio-only') {
          return []
        }

        return sortedTracks.flatMap((track) => {
          const trackOrder = track.order ?? 0

          return resolvedItems
            .filter(
              (subItem): subItem is TimelineItem & { type: 'video' } =>
                subItem.trackId === track.id && subItem.type === 'video',
            )
            .map((subItem) => ({
              ...subItem,
              zIndex: (maxTrackOrder - trackOrder) * 1000,
              muted: parentMuted || track.muted || linkedVideoIdsWithOwnedAudio.has(subItem.id),
              trackAudioEq: track.audioEq,
              trackOrder,
              trackVisible: parentVisible,
            }))
        })
      },
    ),
  )
  const nonVideoTrackItems = $derived(
    sortedTracks
      .map((track) => {
        const trackOrder = track.order ?? 0

        return {
          trackId: track.id,
          trackAudioEq: track.audioEq,
          trackOrder,
          trackVisible: parentVisible,
          muted: parentMuted || track.muted,
          items: resolvedItems.filter(
            (subItem) =>
              subItem.trackId === track.id &&
              subItem.type !== 'video' &&
              // Mask shapes are control items and should not render visually.
              !(subItem.type === 'shape' && subItem.isMask) &&
              (renderMode !== 'visual-only' || subItem.type !== 'audio') &&
              (renderMode !== 'audio-only' || subItem.type === 'audio'),
          ),
        }
      })
      .filter((track) => track.items.length > 0),
  )

  const trackMergedEqStages = $derived.by(() => {
    const map = new Map<string, ResolvedAudioEqSettings[]>()
    for (const track of sortedTracks) {
      map.set(track.id, appendResolvedAudioEqSources(audioEqStages, track.audioEq))
    }
    return map
  })

  const wrapperFadeMultiplier = $derived.by(() => {
    let multiplier = 1
    const hasCrossfadeIn = (crossfadeFadeInFrames ?? 0) > 0
    const hasCrossfadeOut = (crossfadeFadeOutFrames ?? 0) > 0
    if (hasCrossfadeIn && frame < (crossfadeFadeInFrames ?? 0)) {
      const progress = frame / Math.max(1, crossfadeFadeInFrames ?? 1)
      multiplier = Math.sin((progress * Math.PI) / 2)
    } else if (hasCrossfadeOut && frame >= item.durationInFrames - (crossfadeFadeOutFrames ?? 0)) {
      const fadeOutStart = item.durationInFrames - (crossfadeFadeOutFrames ?? 0)
      const progress = (frame - fadeOutStart) / Math.max(1, crossfadeFadeOutFrames ?? 1)
      multiplier = Math.cos((progress * Math.PI) / 2)
    }
    return multiplier
  })
  const effectiveAudioGainMultiplier = $derived(
    audioGainMultiplier * Math.max(0, wrapperFadeMultiplier),
  )
  const effectiveAudioGainLiveItemIds = $derived([...(audioGainLiveItemIds ?? []), itemId])
  let previousMaskInfos: MaskInfo[] = EMPTY_MASK_INFOS
  const expressionCanvas = $derived(
    subComp ? { width: subComp.width, height: subComp.height, fps: subComp.fps } : undefined,
  )

  $effect(() => {
    void audioGainMultiplier
    const id = itemId
    if (renderMode !== 'audio-only') return
    clearMixerLiveGain(id)
  })

  $effect(() => {
    const families = visibleTextFontFamilies
    if (renderMode === 'audio-only' || families.length === 0) return
    loadFonts(families)
  })

  // Resolve active sub-comp masks for the current local frame.
  // This allows masks authored inside a pre-comp to clip items when viewed
  // from the parent timeline.
  const activeMaskInfos = $derived.by((): MaskInfo[] => {
    if (!subComp) {
      previousMaskInfos = EMPTY_MASK_INFOS
      return EMPTY_MASK_INFOS
    }
    const canvas = { width: subComp.width, height: subComp.height, fps: subComp.fps }
    const keyframesById = new Map((subComp.keyframes ?? []).map((kf) => [kf.itemId, kf]))
    const activeMasks = visibleTracks.flatMap((track) =>
      resolvedItems
        .filter(
          (subItem): subItem is ShapeItem =>
            subItem.trackId === track.id && subItem.type === 'shape' && subItem.isMask === true,
        )
        .map((mask) => ({
          mask,
          trackOrder: track.order ?? 0,
        })),
    )

    const nextMaskInfos = materializeMaskInfos(
      resolveActiveShapeMasksAtFrame(activeMasks, {
        canvas,
        frame: subCompFrame,
        getKeyframes: (itemId) => keyframesById.get(itemId),
        getItem: (itemId) => resolvedItems.find((candidate) => candidate.id === itemId),
      }),
    )
    const stableMaskInfos = reuseStableMaskInfos(previousMaskInfos, nextMaskInfos)
    previousMaskInfos = stableMaskInfos
    return stableMaskInfos
  })

  // CSS scale from sub-comp native resolution to parent container dimensions
  const containerStyle = $derived.by(() => {
    if (!subComp) return ''
    const scaleX = subComp.width > 0 ? containerDims.width / subComp.width : 1
    const scaleY = subComp.height > 0 ? containerDims.height / subComp.height : 1
    return styleToString({
      width: subComp.width,
      height: subComp.height,
      transform: `scale(${scaleX}, ${scaleY})`,
      transformOrigin: '0 0',
      overflow: 'hidden',
      position: 'relative',
      visibility: parentVisible ? 'visible' : 'hidden',
    })
  })
</script>

{#snippet renderCompositionContent(props: RenderCompositionContentProps)}
  <CompositionContent {...props} />
{/snippet}

{#snippet renderVideoItem(videoItem: StableVideoSequenceItem)}
  <AbsoluteFill
    style="z-index: {videoItem.zIndex}; visibility: {videoItem.trackVisible
      ? 'visible'
      : 'hidden'};"
  >
    <ItemContent
      item={videoItem}
      muted={videoItem.muted}
      visible={videoItem.trackVisible}
      masks={getMasksForTrackOrder(activeMaskInfos, videoItem.trackOrder)}
      {renderDepth}
      {renderCompositionContent}
      audioGainMultiplier={effectiveAudioGainMultiplier}
      audioGainLiveItemIds={effectiveAudioGainLiveItemIds}
      audioEqStages={trackMergedEqStages.get(videoItem.trackId) ?? audioEqStages}
      {audioPitchShiftSemitones}
    />
  </AbsoluteFill>
{/snippet}

{#if !subComp}
  <AbsoluteFill
    style="background-color: #2a1a2a; display: flex; align-items: center; justify-content: center;"
  >
    <p style="color: #a855f7; font-size: 14px;">Composition not found</p>
  </AbsoluteFill>
{:else}
  <div style={containerStyle}>
    <CompositionSpaceProvider
      projectWidth={subComp.width}
      projectHeight={subComp.height}
      renderWidth={subComp.width}
      renderHeight={subComp.height}
    >
      <VideoConfigProvider
        width={subComp.width}
        height={subComp.height}
        fps={subComp.fps}
        durationInFrames={subComp.durationInFrames}
      >
        <KeyframesProvider keyframes={subComp.keyframes} items={resolvedItems} canvas={expressionCanvas}>
          <AbsoluteFill>
            <StableVideoSequence
              items={videoItems}
              renderItem={renderVideoItem}
              premountFor={Math.round(subComp.fps)}
            />

            {#each nonVideoTrackItems as track (track.trackId)}
              <AbsoluteFill
                style="z-index: {(maxTrackOrder - track.trackOrder) * 1000 + 100}; visibility: {track.trackVisible
                  ? 'visible'
                  : 'hidden'};"
              >
                {#each track.items as subItem (subItem.id)}
                  <Sequence from={subItem.from} durationInFrames={subItem.durationInFrames}>
                    <ItemContent
                      item={subItem}
                      muted={track.muted || linkedVideoIdsWithOwnedAudio.has(subItem.id)}
                      visible={track.trackVisible}
                      masks={getMasksForTrackOrder(activeMaskInfos, track.trackOrder)}
                      {renderDepth}
                      {renderCompositionContent}
                      compositionRenderMode={subItem.type === 'composition' &&
                      hasLinkedAudioCompanion(resolvedItems, subItem)
                        ? 'visual-only'
                        : 'full'}
                      audioGainMultiplier={effectiveAudioGainMultiplier}
                      audioGainLiveItemIds={effectiveAudioGainLiveItemIds}
                      audioEqStages={trackMergedEqStages.get(track.trackId) ?? audioEqStages}
                      {audioPitchShiftSemitones}
                    />
                  </Sequence>
                {/each}
              </AbsoluteFill>
            {/each}
          </AbsoluteFill>
        </KeyframesProvider>
      </VideoConfigProvider>
    </CompositionSpaceProvider>
  </div>
{/if}

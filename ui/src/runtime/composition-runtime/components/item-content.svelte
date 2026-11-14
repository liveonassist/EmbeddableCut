<!-- SPDX-License-Identifier: MIT -->
<!--
  Composition Item Component

  Renders the different item types:
  - Video: pooled native video for preview (export renders through Canvas + WebCodecs)
  - Audio: pitch-corrected audio with trim support
  - Image: img tag, or the GIF player for animated images
  - Text: renders text with styling
  - Shape: renders solid colors or shapes
  - Respects mute state for audio/video items
  - Supports trimStart/trimEnd for media trimming (uses trimStart as trimBefore)
-->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'
  import type { AudioPlaybackProps } from './audio-playback-props'
  import type { ResolvedAudioEqSettings } from '@/types/audio'
  import type { TimelineItem } from '@/types/timeline'

  function getLogger() {
    return createLogger('CompositionItem')
  }

  /** Safety guard against corrupted circular composition graphs. */
  const MAX_RENDER_DEPTH = 16

  function getItemAudioPlaybackProps({
    item,
    trimBefore,
    volume,
    playbackRate,
    isReversed,
    reverseSourceEnd,
    audioPitchShiftSemitones,
    sourceFps,
    muted,
    audioEqStages,
    liveGainItemIds,
    volumeMultiplier,
  }: {
    item: TimelineItem
    trimBefore: number
    volume: number
    playbackRate: number
    isReversed: boolean
    reverseSourceEnd: number
    audioPitchShiftSemitones: number
    sourceFps: number
    muted: boolean
    audioEqStages: ResolvedAudioEqSettings[]
    liveGainItemIds?: string[]
    volumeMultiplier: number
  }): AudioPlaybackProps {
    return {
      itemId: item.id,
      trimBefore,
      volume,
      playbackRate,
      isReversed,
      reverseSourceEnd,
      audioPitchSemitones: item.audioPitchSemitones,
      audioPitchCents: item.audioPitchCents,
      audioPitchShiftSemitones,
      sourceFps,
      muted,
      durationInFrames: item.durationInFrames,
      audioFadeIn: item.audioFadeIn,
      audioFadeOut: item.audioFadeOut,
      audioFadeInCurve: item.audioFadeInCurve,
      audioFadeOutCurve: item.audioFadeOutCurve,
      audioFadeInCurveX: item.audioFadeInCurveX,
      audioFadeOutCurveX: item.audioFadeOutCurveX,
      audioEqStages,
      liveGainItemIds,
      volumeMultiplier,
    }
  }
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { AbsoluteFill, useClockPlaybackRate } from '@/runtime/composition-runtime/deps/player'
  import { useDebugStore, useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
  import { useMediaLibraryStore } from '@/runtime/composition-runtime/deps/stores'
  import { isRenderableLottieSrc } from '@/infrastructure/lottie/lottie-frame-provider'
  import { getSourceDimensions } from '@/runtime/composition-runtime/utils/transform-resolver'
  import {
    timelineToSourceFrames,
    sourceToTimelineFrames,
    isValidSeekPosition,
    isWithinSourceBounds,
    getSafeTrimBefore,
    DEFAULT_SPEED,
  } from '@/runtime/composition-runtime/deps/timeline'
  import { isGifUrl, isWebpUrl } from '@/shared/utils/media-utils'
  import { appendResolvedAudioEqStage, getAudioEqSettings } from '@/shared/utils/audio-eq'
  import {
    isAudioPitchShiftActive,
    resolvePreviewAudioPitchShiftSemitones,
  } from '@/shared/utils/audio-pitch'
  import { needsCustomAudioDecoder } from '@/runtime/composition-runtime/utils/audio-codec-detection'
  import { resolveReverseConformedVideoItem } from '@/shared/utils/reverse-conform-item'
  import { shouldRenderExternalVideoAudio } from '@/runtime/composition-runtime/utils/audio-playback-routing'
  import { useVideoConfig } from '../hooks/use-player-compat.svelte'
  import { useNestedMediaResolutionMode } from '../contexts/nested-media-resolution-context'
  import { useLiveItemContentTransform } from '../contexts/live-item-transform-context.svelte'
  import { useStoreSelector } from '../../use-sync-external-store.svelte'
  import DebugOverlay from './debug-overlay.svelte'
  import { CustomDecoderAudio } from './custom-decoder-audio'
  import { PitchCorrectedAudio } from './pitch-corrected-audio'
  import { GifPlayer } from './gif-player'
  import { LottiePlayer } from './lottie-player'
  import MediaOfflinePlaceholder from './media-offline-placeholder.svelte'
  import ItemVisualWrapper from './item-visual-wrapper.svelte'
  import TextContent from './text-content.svelte'
  import SubtitleSegmentContent from './subtitle-segment-content.svelte'
  import ShapeContent from './shape-content.svelte'
  import { VideoContent } from './video-content'
  import type { CompositionWrapperItem, ItemProps } from './item-types'

  let {
    item: itemProp,
    muted = false,
    visible = true,
    masks: masksProp,
    renderDepth = 0,
    compositionRenderMode = 'full',
    audioGainMultiplier = 1,
    audioGainLiveItemIds,
    audioEqStages,
    audioPitchShiftSemitones = 0,
    renderCompositionContent,
  }: ItemProps = $props()

  const masks = $derived(masksProp ?? [])
  const liveItem = useLiveItemContentTransform(() => itemProp)
  const baseItem = $derived(liveItem.current)
  const itemId = $derived(baseItem.id)
  const mediaId = $derived(baseItem.mediaId)

  // Use muted prop directly - MainComposition already passes track.muted

  // Debug overlay toggle (always false in production via store)
  const showDebugOverlay = select(useDebugStore, (s) => s.showVideoDebugOverlay)
  const videoConfig = useVideoConfig()
  const timelineFps = $derived(videoConfig.fps)
  const clockPlaybackRate = useClockPlaybackRate()
  const isReverseShuttle = $derived(clockPlaybackRate.current < 0)
  const nestedMediaResolutionMode = useNestedMediaResolutionMode()
  const mediaItem = useStoreSelector(useMediaLibraryStore, (s) =>
    mediaId ? s.mediaById[mediaId] : undefined,
  )
  // Boolean selector (not the array) so this only re-runs when THIS item's
  // broken state flips — never per-frame during playback.
  const isMediaOffline = useStoreSelector(useMediaLibraryStore, (s) =>
    mediaId ? s.brokenMediaIds.includes(mediaId) : false,
  )
  const mediaSourceFps = $derived(mediaItem.current?.fps)
  const itemAudioEqStages = $derived(
    appendResolvedAudioEqStage(audioEqStages, getAudioEqSettings(baseItem)),
  )
  // Subscribe to this item's gizmo preview so live pitch-slider drags route the
  // video's audio through the pitch-corrected path immediately (not only after
  // commit). resolvePreviewAudioPitchShiftSemitones falls back to the committed
  // pitch fields when no preview is set.
  const itemPreviewProperties = useStoreSelector(
    useGizmoStore,
    (s) => s.preview?.[itemId]?.properties,
  )
  const itemLocalPitchShiftSemitones = $derived(
    resolvePreviewAudioPitchShiftSemitones({
      base: {
        audioPitchSemitones: baseItem.audioPitchSemitones,
        audioPitchCents: baseItem.audioPitchCents,
      },
      preview: itemPreviewProperties.current,
    }),
  )

  // Known item types; anything else is a corrupt item.
  const knownType = $derived.by(() => {
    switch (baseItem.type) {
      case 'controller':
      case 'video':
      case 'audio':
      case 'image':
      case 'lottie':
      case 'text':
      case 'shape':
      case 'composition':
      case 'adjustment':
      case 'subtitle':
        return baseItem.type
      default:
        throw new Error(`Unknown item type: ${JSON.stringify(baseItem)}`)
    }
  })

  // Everything the video branch renders, derived as React computed it per render.
  const video = $derived.by(() => {
    if (baseItem.type !== 'video') return null
    const item = resolveReverseConformedVideoItem(baseItem, timelineFps, {
      useProxy: nestedMediaResolutionMode.current === 'proxy',
    })
    const mediaSource = getSourceDimensions(item)
    // Guard against missing src (media resolution failed / media deleted)
    if (!item.src) return { item, kind: 'offline' as const }
    // Use sourceStart for trimBefore (absolute position in source)
    // Fall back to trimStart or offset for backward compatibility
    const trimBefore = item.sourceStart ?? item.trimStart ?? item.offset ?? 0
    const sourceFps = item.sourceFps ?? mediaSourceFps ?? timelineFps
    // Get playback rate from speed property (default 1x)
    const playbackRate = item.speed ?? DEFAULT_SPEED

    // Calculate source frames needed for playback using shared utility
    const sourceFramesNeeded = timelineToSourceFrames(
      item.durationInFrames,
      playbackRate,
      timelineFps,
      sourceFps,
    )
    const sourceEndPosition = trimBefore + sourceFramesNeeded
    const reverseSourceEnd = item.sourceEnd ?? sourceEndPosition
    const sourceDuration = item.sourceDuration || 0

    // Calculate the effective source segment this clip represents
    // This is more accurate than sourceDuration for rate-stretched clips
    // sourceEnd - sourceStart defines the actual source frames used
    const effectiveSourceSegment =
      item.sourceEnd !== undefined && item.sourceStart !== undefined
        ? item.sourceEnd - item.sourceStart
        : sourceDuration

    // Only validate if we have valid source duration info
    const hasValidSourceDuration = sourceDuration > 0 || effectiveSourceSegment > 0

    // Validate using shared utilities - skip if no valid duration info
    const isInvalidSeek =
      hasValidSourceDuration && !isValidSeekPosition(trimBefore, sourceDuration || undefined)
    const exceedsSource =
      hasValidSourceDuration &&
      !isWithinSourceBounds(
        trimBefore,
        item.durationInFrames,
        playbackRate,
        sourceDuration || undefined,
        2,
        timelineFps,
        sourceFps,
      )

    // Safety check: if sourceStart is unreasonably high (>1 hour) and no sourceDuration is set,
    // this indicates corrupted metadata from split/trim operations
    const MAX_REASONABLE_FRAMES = 30 * 60 * 60 // 1 hour at 30fps
    const hasCorruptedMetadata =
      sourceDuration === 0 && effectiveSourceSegment === 0 && trimBefore > MAX_REASONABLE_FRAMES

    if (hasCorruptedMetadata || isInvalidSeek) {
      getLogger().error('Invalid source position detected:', {
        itemId: item.id,
        sourceStart: item.sourceStart,
        trimBefore,
        sourceDuration,
        effectiveSourceSegment,
        hasCorruptedMetadata,
        isInvalidSeek,
      })
      return { item, kind: 'invalid' as const }
    }

    // Clamp trimBefore to valid range using shared utility
    const safeTrimBefore = getSafeTrimBefore(
      trimBefore,
      item.durationInFrames,
      playbackRate,
      sourceDuration || undefined,
      timelineFps,
      sourceFps,
    )

    // Graceful fallback for overlong clips: log and continue with clamped seek behavior.
    // We keep rendering instead of hard-failing the item.
    const effectiveDuration = sourceDuration > 0 ? sourceDuration : effectiveSourceSegment
    if (
      exceedsSource &&
      safeTrimBefore === 0 &&
      effectiveDuration > 0 &&
      sourceFramesNeeded > effectiveDuration
    ) {
      const suggestedDurationInFrames = Math.max(
        1,
        sourceToTimelineFrames(effectiveDuration, playbackRate, sourceFps, timelineFps),
      )
      getLogger().warn('Clip duration exceeds source duration (graceful clamp):', {
        itemId: item.id,
        sourceFramesNeeded,
        sourceDuration,
        effectiveSourceSegment,
        effectiveDuration,
        durationInFrames: item.durationInFrames,
        playbackRate,
        sourceFps,
        timelineFps,
        suggestedDurationInFrames,
      })
    }

    const trackVolumeDb =
      'trackVolumeDb' in item && typeof item.trackVolumeDb === 'number' ? item.trackVolumeDb : 0
    const videoAudioSrc = item.audioSrc ?? item.src
    const isReversed = item.isReversed === true
    const requiresPitchShiftedVideoAudio = isAudioPitchShiftActive(
      audioPitchShiftSemitones + itemLocalPitchShiftSemitones,
    )
    const shouldUseCustomDecodedVideoAudio =
      !muted && needsCustomAudioDecoder(mediaItem.current?.audioCodec ?? mediaItem.current?.codec)
    const renderExternalVideoAudio = shouldRenderExternalVideoAudio({
      muted,
      hasAudioSource: !!videoAudioSrc,
      authoredReversed: isReversed,
      reverseShuttle: isReverseShuttle,
      requiresPitchShift: requiresPitchShiftedVideoAudio,
      requiresCustomDecoder: shouldUseCustomDecodedVideoAudio,
    })
    const videoAudioPlaybackProps = getItemAudioPlaybackProps({
      item,
      trimBefore: safeTrimBefore,
      volume: (item.volume ?? 0) + trackVolumeDb,
      playbackRate,
      isReversed,
      reverseSourceEnd,
      audioPitchShiftSemitones,
      sourceFps,
      muted,
      audioEqStages: itemAudioEqStages,
      liveGainItemIds: audioGainLiveItemIds,
      volumeMultiplier: audioGainMultiplier,
    })
    return {
      item,
      kind: 'video' as const,
      src: item.src,
      mediaSource,
      trimBefore,
      sourceFps,
      playbackRate,
      sourceFramesNeeded,
      sourceEndPosition,
      reverseSourceEnd,
      sourceDuration,
      isInvalidSeek,
      exceedsSource,
      safeTrimBefore,
      videoAudioSrc,
      isReversed,
      shouldUseCustomDecodedVideoAudio,
      renderExternalVideoAudio,
      videoAudioPlaybackProps,
    }
  })

  // The audio branch's playback props.
  const audio = $derived.by(() => {
    const item = baseItem
    if (item.type !== 'audio' || item.compositionId || !item.src) return null
    // Use sourceStart for trimBefore (absolute position in source)
    const trimBefore = item.sourceStart ?? item.trimStart ?? item.offset ?? 0
    const sourceFps = item.sourceFps ?? mediaSourceFps ?? timelineFps
    // Get playback rate from speed property
    const playbackRate = item.speed ?? DEFAULT_SPEED
    const sourceFramesNeeded = timelineToSourceFrames(
      item.durationInFrames,
      playbackRate,
      timelineFps,
      sourceFps,
    )
    const reverseSourceEnd = item.sourceEnd ?? trimBefore + sourceFramesNeeded

    const trackVolumeDb =
      'trackVolumeDb' in item && typeof item.trackVolumeDb === 'number' ? item.trackVolumeDb : 0
    return {
      src: item.src,
      mediaId: item.mediaId,
      props: getItemAudioPlaybackProps({
        item,
        trimBefore,
        volume: (item.volume ?? 0) + trackVolumeDb,
        playbackRate,
        isReversed: item.isReversed === true,
        reverseSourceEnd,
        audioPitchShiftSemitones,
        sourceFps,
        muted,
        audioEqStages: itemAudioEqStages,
        liveGainItemIds: audioGainLiveItemIds,
        volumeMultiplier: audioGainMultiplier,
      }),
    }
  })

  // The image branch: animated images (GIF and WebP) play through the GIF
  // player, synced frame by frame to the timeline rather than relying on the
  // browser's auto-animation via <img>.
  const image = $derived.by(() => {
    const item = baseItem
    if (item.type !== 'image') return null
    const mediaSource = getSourceDimensions(item)
    if (!item.src) return { item, src: null, mediaSource, animated: null }
    const label = item.label?.toLowerCase() ?? ''
    const isAnimatedGif = isGifUrl(item.src) || label.endsWith('.gif')
    const isAnimatedWebp = isWebpUrl(item.src) || label.endsWith('.webp')
    const animated =
      (isAnimatedGif || isAnimatedWebp) && item.mediaId
        ? {
            mediaId: item.mediaId,
            playbackRate: item.speed ?? DEFAULT_SPEED,
            format: isAnimatedWebp ? ('webp' as const) : ('gif' as const),
          }
        : null
    return { item, src: item.src, mediaSource, animated }
  })

  const compositionContentProps = $derived(
    (baseItem.type === 'composition' || (baseItem.type === 'audio' && baseItem.compositionId)) &&
      renderDepth < MAX_RENDER_DEPTH
      ? {
          item: baseItem as CompositionWrapperItem,
          parentMuted: muted,
          parentVisible: visible,
          renderDepth: renderDepth + 1,
          renderMode: baseItem.type === 'audio' ? ('audio-only' as const) : compositionRenderMode,
          audioGainMultiplier,
          audioGainLiveItemIds,
          audioEqStages: itemAudioEqStages,
          audioPitchShiftSemitones: audioPitchShiftSemitones + itemLocalPitchShiftSemitones,
        }
      : null,
  )
</script>

<!--
  Null Objects participate in transform hierarchy and canvas gizmo
  interactions, but intentionally contribute no pixels of their own.
  Adjustment items render nothing visually (they apply effects to other items).
-->
{#if knownType === 'video' && video}
  {#if video.kind === 'offline'}
    <MediaOfflinePlaceholder offline={isMediaOffline.current} label={video.item.label} />
  {:else if video.kind === 'invalid'}
    <AbsoluteFill
      style="background-color: #2a1a1a; display: flex; align-items: center; justify-content: center;"
    >
      <p style="color: #ff6b6b; font-size: 14px;">Invalid source position</p>
    </AbsoluteFill>
  {:else}
    <!-- ItemVisualWrapper resolves transform defaults (fit-to-canvas) when no explicit transform is set -->
    <ItemVisualWrapper
      item={video.item}
      {masks}
      mediaContent={{
        fitMode: 'contain',
        sourceWidth: video.mediaSource?.width,
        sourceHeight: video.mediaSource?.height,
        crop: video.item.crop,
      }}
    >
      <VideoContent
        item={video.item}
        muted={muted || video.renderExternalVideoAudio}
        safeTrimBefore={video.safeTrimBefore}
        playbackRate={video.playbackRate}
        sourceFps={video.sourceFps}
        isReversed={video.isReversed}
        reverseSourceEnd={video.reverseSourceEnd}
        audioEqStages={itemAudioEqStages}
        forceCssComposite={masks.length > 0}
      />
      {#if video.renderExternalVideoAudio}
        {#if video.shouldUseCustomDecodedVideoAudio}
          <CustomDecoderAudio
            {...video.videoAudioPlaybackProps}
            src={video.videoAudioSrc}
            mediaId={video.item.mediaId ?? `legacy-src:${video.videoAudioSrc}`}
          />
        {:else}
          <PitchCorrectedAudio
            {...video.videoAudioPlaybackProps}
            src={video.videoAudioSrc}
            mediaId={video.item.mediaId}
          />
        {/if}
      {/if}
      {#if showDebugOverlay.current}
        <DebugOverlay
          id={video.item.id}
          speed={video.playbackRate}
          trimBefore={video.trimBefore}
          safeTrimBefore={video.safeTrimBefore}
          sourceStart={video.item.sourceStart}
          sourceDuration={video.sourceDuration}
          durationInFrames={video.item.durationInFrames}
          sourceFramesNeeded={video.sourceFramesNeeded}
          sourceEndPosition={video.sourceEndPosition}
          isInvalidSeek={video.isInvalidSeek}
          exceedsSource={video.exceedsSource}
          sourceFps={video.sourceFps}
        />
      {/if}
    </ItemVisualWrapper>
  {/if}
{:else if knownType === 'audio'}
  {#if baseItem.type === 'audio' && baseItem.compositionId}
    {#if compositionContentProps}
      {@render renderCompositionContent(compositionContentProps)}
    {/if}
  {:else if audio}
    <!-- Pitch-preserved playback during preview -->
    <PitchCorrectedAudio {...audio.props} src={audio.src} mediaId={audio.mediaId} />
  {/if}
  <!-- Audio can fail silently without a src -->
{:else if knownType === 'image' && image}
  {#if !image.src}
    <MediaOfflinePlaceholder offline={isMediaOffline.current} label={image.item.label} />
  {:else}
    <ItemVisualWrapper
      item={image.item}
      {masks}
      mediaContent={{
        fitMode: 'contain',
        sourceWidth: image.mediaSource?.width,
        sourceHeight: image.mediaSource?.height,
        crop: image.item.crop,
      }}
    >
      {#if image.animated}
        <GifPlayer
          mediaId={image.animated.mediaId}
          src={image.src}
          fit="fill"
          playbackRate={image.animated.playbackRate}
          loopBehavior="loop"
          format={image.animated.format}
        />
      {:else}
        <!-- Regular static images - use native img element -->
        <img src={image.src} alt="" style="width: 100%; height: 100%; object-fit: fill;" />
      {/if}
    </ItemVisualWrapper>
  {/if}
{:else if knownType === 'lottie' && baseItem.type === 'lottie'}
  <!--
    A stale `blob:` src (persisted or left over after the media was deleted)
    is treated as missing so dotlottie is never handed a dead URL to fetch.
  -->
  {#if !isRenderableLottieSrc(baseItem.src)}
    <MediaOfflinePlaceholder offline={isMediaOffline.current} label={baseItem.label} />
  {:else}
    {@const mediaSource = getSourceDimensions(baseItem)}
    <ItemVisualWrapper
      item={baseItem}
      {masks}
      mediaContent={{
        fitMode: 'contain',
        sourceWidth: mediaSource?.width,
        sourceHeight: mediaSource?.height,
        crop: baseItem.crop,
      }}
    >
      <LottiePlayer item={baseItem} />
    </ItemVisualWrapper>
  {/if}
{:else if knownType === 'text' && baseItem.type === 'text'}
  <ItemVisualWrapper item={baseItem} {masks}>
    <TextContent item={baseItem} />
  </ItemVisualWrapper>
{:else if knownType === 'shape' && baseItem.type === 'shape'}
  <!-- ShapeContent renders the appropriate shape based on shapeType -->
  <ItemVisualWrapper item={baseItem} {masks}>
    <ShapeContent item={baseItem} />
  </ItemVisualWrapper>
{:else if knownType === 'composition' && baseItem.type === 'composition'}
  <!--
    Guard against infinite recursion from circular composition references.
    Render sub-composition contents inline; pass parent muted so muting the
    track silences all sub-comp audio.
  -->
  {#if compositionContentProps}
    <ItemVisualWrapper
      item={baseItem}
      {masks}
      mediaContent={{
        fitMode: 'fill',
        sourceWidth: baseItem.compositionWidth,
        sourceHeight: baseItem.compositionHeight,
        crop: baseItem.crop,
      }}
    >
      {@render renderCompositionContent(compositionContentProps)}
    </ItemVisualWrapper>
  {/if}
{:else if knownType === 'subtitle' && baseItem.type === 'subtitle'}
  <ItemVisualWrapper item={baseItem} {masks}>
    <SubtitleSegmentContent item={baseItem} />
  </ItemVisualWrapper>
{/if}

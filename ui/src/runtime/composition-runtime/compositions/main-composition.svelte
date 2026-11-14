<!-- SPDX-License-Identifier: MIT -->
<!--
  Main Composition

  ARCHITECTURE FOR STABLE DOM (prevents re-renders on item/adjustment layer add/delete):

  MASKING:
  1. ALL content rendered through single StableMaskedGroup wrapper
  2. MaskDefinitions: SVG mask defs with OPACITY-CONTROLLED activation
  3. Mask effect toggled via SVG internal opacity, not DOM structure changes
  4. Deleting/adding masks doesn't move items between DOM parents → no remount

  ADJUSTMENT LAYER EFFECTS:
  1. ALL effects (CSS filter, glitch, halftone) applied PER-ITEM via ItemEffectWrapper
  2. Each item checks if it should have effects based on track order
  3. Only items BELOW adjustment layer (higher track order) receive effects
  4. Adding/removing adjustment layers doesn't change DOM structure
-->
<script lang="ts" module>
  import type { AudioPlaybackProps } from '../components/audio-playback-props'
  import type {
    AudioSegment,
    VideoAudioSegment,
  } from '@/runtime/composition-runtime/utils/audio-scene'

  const TRANSITION_AUDIO_PREMOUNT_SECONDS = 0.5
  const STANDALONE_AUDIO_PREMOUNT_SECONDS = 2
  // Frames the incoming video clip mounts + seeks to its in-point before it
  // becomes visible, so its pooled <video> reaches readyState >= 2 before the
  // playhead crosses the boundary (avoids the dom-video-not-ready stall at clip
  // entry). The source URL is already kept warm ~8s ahead; this only governs the
  // DOM element/decoder. Well within the pool's element cap (40) since it adds at
  // most ~1 extra mounted element per video track.
  const VIDEO_CLIP_PREMOUNT_SECONDS = 2

  /** The playback props both audio backends take for a segment. */
  function segmentAudioProps(
    segment: VideoAudioSegment | AudioSegment,
    transitionFields: boolean,
  ): AudioPlaybackProps & { src: string; mediaId: string } {
    const props: AudioPlaybackProps & { src: string; mediaId: string } = {
      src: segment.src,
      mediaId: segment.mediaId ?? `legacy-src:${segment.src}`,
      itemId: segment.itemId,
      trimBefore: segment.trimBefore,
      sourceFps: segment.sourceFps,
      volume: segment.volumeDb,
      playbackRate: segment.playbackRate,
      isReversed: segment.isReversed,
      reverseSourceEnd: segment.reverseSourceEnd,
      audioPitchSemitones: segment.audioPitchSemitones,
      audioPitchCents: segment.audioPitchCents,
      muted: segment.muted,
      durationInFrames: segment.durationInFrames,
      audioFadeIn: segment.audioFadeIn,
      audioFadeOut: segment.audioFadeOut,
      audioFadeInCurve: segment.audioFadeInCurve,
      audioFadeOutCurve: segment.audioFadeOutCurve,
      audioFadeInCurveX: segment.audioFadeInCurveX,
      audioFadeOutCurveX: segment.audioFadeOutCurveX,
      audioEqStages: segment.audioEqStages,
      clipFadeSpans: segment.clipFadeSpans,
    }
    if (transitionFields) {
      const transition = segment as VideoAudioSegment
      props.contentStartOffsetFrames = transition.contentStartOffsetFrames
      props.contentEndOffsetFrames = transition.contentEndOffsetFrames
      props.fadeInDelayFrames = transition.fadeInDelayFrames
      props.fadeOutLeadFrames = transition.fadeOutLeadFrames
      props.crossfadeFadeIn = transition.crossfadeFadeIn
      props.crossfadeFadeOut = transition.crossfadeFadeOut
    }
    return props
  }
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import {
    AbsoluteFill,
    Sequence,
    useClock,
  } from '@/runtime/composition-runtime/deps/player'
  import { timelineToSourceFrames } from '@/runtime/composition-runtime/deps/timeline'
  import { useVideoConfig } from '../hooks/use-player-compat.svelte'
  import type { CompositionInputProps } from '@/types/export'
  import CompositionContent from '../components/composition-content.svelte'
  import { PitchCorrectedAudio } from '../components/pitch-corrected-audio'
  import { CustomDecoderAudio } from '../components/custom-decoder-audio'
  import { getSharedPreviewAudioContext } from '@/runtime/composition-runtime/utils/preview-audio-graph'
  import { useMediaLibraryStore } from '@/runtime/composition-runtime/deps/stores'
  import {
    isNonNativeAudioContainer,
    needsCustomAudioDecoder,
  } from '@/runtime/composition-runtime/utils/audio-codec-detection'
  import {
    StableVideoSequence,
    type StableVideoSequenceItem,
  } from '../components/stable-video-sequence'
  import { loadFonts } from '@/runtime/composition-runtime/utils/fonts'
  import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
  import ItemEffectWrapper from '../components/item-effect-wrapper.svelte'
  import type { AdjustmentLayerWithTrackOrder } from '../components/item-effect-wrapper-types'
  import { KeyframesProvider } from '../contexts/keyframes-context'
  import CompositionSpaceProvider from '../contexts/composition-space-provider.svelte'
  import NestedMediaResolutionProvider from '../contexts/nested-media-resolution-provider.svelte'
  import type { LiveItemTransformSource } from '../contexts/live-item-transform-context.svelte'
  import LiveItemTransformProvider from '../contexts/live-item-transform-provider.svelte'
  import {
    buildCompoundAudioTransitionSegments,
    buildStandaloneAudioSegments,
    buildTransitionVideoAudioSegments,
    type CompoundAudioSegment,
  } from '@/runtime/composition-runtime/utils/audio-scene'
  import {
    deriveCompositionAudioScene,
    resolveCompositionRenderPlan,
  } from '@/runtime/composition-runtime/utils/scene-assembly'
  import {
    getManagedLinkedAudioTransitions,
    hasLinkedAudioCompanion,
  } from '@/shared/utils/linked-media'
  import {
    appendResolvedAudioEqSources,
    getAudioEqSettings,
    prependResolvedAudioEqSources,
  } from '@/shared/utils/audio-eq'
  import { getAudioPitchShiftSemitones } from '@/shared/utils/audio-pitch'
  import ActiveMasksProvider from './active-masks-provider.svelte'
  import MaskedItem from './masked-item.svelte'

  type MainCompositionProps = CompositionInputProps & {
    useProxyMedia?: boolean
    transparentBackground?: boolean
    liveItemTransformSource?: LiveItemTransformSource
  }

  let {
    tracks,
    transitions = [],
    backgroundColor = '#000000',
    keyframes,
    busAudioEq,
    width: compositionWidth,
    height: compositionHeight,
    useProxyMedia = false,
    transparentBackground = false,
    liveItemTransformSource,
  }: MainCompositionProps = $props()

  const videoConfig = useVideoConfig()
  const fps = $derived(videoConfig.fps)
  const renderWidth = $derived(videoConfig.width)
  const renderHeight = $derived(videoConfig.height)

  // Wire AudioContext as the Clock's timing ground truth.
  // When running, the Clock derives time from the hardware audio clock
  // instead of performance.now(), eliminating audio-video drift.
  const clock = useClock()
  $effect(() => {
    const ctx = getSharedPreviewAudioContext()
    clock.setAudioContext(ctx)
    return () => clock.setAudioContext(null)
  })

  const projectWidth = $derived(compositionWidth ?? renderWidth)
  const projectHeight = $derived(compositionHeight ?? renderHeight)
  const expressionCanvas = $derived({ width: projectWidth, height: projectHeight, fps })
  const canvasWidth = $derived(renderWidth)
  const canvasHeight = $derived(renderHeight)
  // Nothing here reads the frame, so the composition doesn't re-run per frame.

  // Read preview color directly from store to avoid inputProps changes during color picker drag
  // This prevents Player from seeking/refreshing when user scrubs the color picker
  const canvasBackgroundPreview = select(useGizmoStore, (s) => s.canvasBackgroundPreview)
  const effectiveBackgroundColor = $derived(
    transparentBackground ? 'transparent' : (canvasBackgroundPreview.current ?? backgroundColor),
  )

  const renderPlan = $derived(resolveCompositionRenderPlan({ tracks, transitions }))
  const expressionItems = $derived(tracks.flatMap((track) => track.items))
  const maxOrder = $derived(renderPlan.trackRenderState.maxOrder)

  const videoItems: StableVideoSequenceItem[] = $derived(renderPlan.videoItems)

  // Audio items are derived separately and rendered outside mask groups
  // This prevents audio from being affected by visual layer changes (mask add/delete, item moves)
  // Use ALL tracks for stable DOM structure, with trackVisible for conditional playback
  const audioItems = $derived(renderPlan.audioItems)

  const managedLinkedAudioTransitions = $derived(
    getManagedLinkedAudioTransitions(
      tracks.flatMap((track) => track.items),
      transitions,
    ),
  )
  const audioScene = $derived(
    deriveCompositionAudioScene({
      audioItems,
      managedLinkedAudioTransitions,
    }),
  )
  const managedCompoundAudioItemsById = $derived(
    new Map(audioScene.managedCompoundAudioItems.map((item) => [item.id, item])),
  )

  // Merge continuous split audio clips into single segments to prevent
  // audio element remount (click/gap) at split boundaries.
  // Mirrors the videoAudioSegments merging pattern.
  const audioSegments = $derived(buildStandaloneAudioSegments(audioScene.standaloneAudioItems, fps))

  // Video audio is rendered in a dedicated audio layer to decouple audio
  // from transition visual overlays and pooled video element state.
  const videoAudioItems = $derived(
    renderPlan.videoItems.filter(
      (item) => !item.embeddedAudioMuted && !hasLinkedAudioCompanion(audioItems, item),
    ),
  )

  // Build explicit audio playback segments for transition overlaps:
  // - One continuous segment per clip (decoupled from visual transitions)
  // - Segments are expanded into transition handles so both clips overlap chronologically
  const videoAudioSegments = $derived(
    buildTransitionVideoAudioSegments(videoAudioItems, transitions, fps),
  )
  const linkedAudioTransitionSegments = $derived(
    buildTransitionVideoAudioSegments(
      audioScene.managedLinkedAudioItems,
      audioScene.managedLinkedAudioTransitionDefs,
      fps,
    ),
  )
  const managedCompoundAudioSegments: CompoundAudioSegment[] = $derived(
    buildCompoundAudioTransitionSegments(
      audioScene.managedCompoundAudioItems,
      audioScene.managedCompoundAudioTransitionDefs,
      fps,
    ),
  )
  const transitionAudioSegments = $derived([...videoAudioSegments, ...linkedAudioTransitionSegments])
  const previewTransitionAudioSegments = $derived(
    transitionAudioSegments.map((segment) => ({
      ...segment,
      audioEqStages: prependResolvedAudioEqSources(segment.audioEqStages, busAudioEq),
    })),
  )
  const previewAudioSegments = $derived(
    audioSegments.map((segment) => ({
      ...segment,
      audioEqStages: prependResolvedAudioEqSources(segment.audioEqStages, busAudioEq),
    })),
  )

  // Look up which video audio segments need custom decoding (AC-3/E-AC-3)
  const mediaItems = select(useMediaLibraryStore, (s) => s.mediaItems)
  const mediaById = $derived.by(() => {
    const map = new Map<string, (typeof mediaItems.current)[number]>()
    for (const media of mediaItems.current) {
      map.set(media.id, media)
    }
    return map
  })

  function shouldUseCustomDecoder(segment: VideoAudioSegment | AudioSegment): boolean {
    if (!segment.mediaId) {
      // Legacy clips without media linkage: safest fallback is custom decode.
      return true
    }

    const media = mediaById.get(segment.mediaId)
    if (!media) {
      // Orphaned media metadata; native audio path can be silent for AC-3/E-AC-3.
      return true
    }

    // Containers the browser can't natively demux (e.g. Matroska/.mkv) must
    // go through mediabunny even when the audio codec is browser-friendly,
    // otherwise the native element opens nothing and the clip plays silently.
    if (isNonNativeAudioContainer(media.mimeType, media.fileName)) return true

    // Video assets usually expose audio codec in media.audioCodec.
    // Audio-only assets persist their codec in media.codec.
    return needsCustomAudioDecoder(media.audioCodec ?? media.codec)
  }

  // Collect adjustment layers from VISIBLE tracks (for effect application)
  // Effects from hidden tracks should not be applied
  const visibleAdjustmentLayers = $derived(
    renderPlan.visibleAdjustmentLayers as AdjustmentLayerWithTrackOrder[],
  )

  // Use ALL tracks for stable DOM structure, with visibility flag for CSS-based hiding
  const nonMediaByTrack = $derived(renderPlan.stableDomTracks)
  const visibleShapeMasks = $derived(renderPlan.visibleShapeMasks)

  // NOTE: DOM structure is fully stable regardless of adjustment layer changes.
  // ALL items stay in the same DOM location with per-item effect application
  // via ItemEffectWrapper. This prevents remounts when adjustment layers are added/removed.

  $effect(() => {
    const fontFamilies = renderPlan.visibleTextFontFamilies
    if (fontFamilies.length > 0) loadFonts(fontFamilies)
  })
</script>

<!--
  Render function for video items. Uses CSS visibility for hidden tracks to
  avoid DOM changes, and ItemEffectWrapper for per-item adjustment effects (no
  DOM restructuring).
-->
{#snippet renderVideoItem(item: StableVideoSequenceItem)}
  <!--
    The parent Sequence's `from` for local-to-global frame conversion. For
    shared Sequences (split clips), _sequenceFrameOffset is the offset from
    group.minFrom to item.from, so sequenceFrom = item.from - offset = group.minFrom.
  -->
  <AbsoluteFill
    style="z-index: {item.zIndex}; visibility: {item.trackVisible
      ? 'visible'
      : 'hidden'}; transform: translateZ(0); backface-visibility: hidden;"
  >
    <ItemEffectWrapper
      itemTrackOrder={item.trackOrder}
      adjustmentLayers={visibleAdjustmentLayers}
      sequenceFrom={item.from - (item._sequenceFrameOffset ?? 0)}
    >
      <MaskedItem {item} muted={true} itemTrackOrder={item.trackOrder} />
    </ItemEffectWrapper>
  </AbsoluteFill>
{/snippet}

{#snippet segmentAudio(segment: VideoAudioSegment | AudioSegment, transitionFields: boolean)}
  {@const props = segmentAudioProps(segment, transitionFields)}
  {#if shouldUseCustomDecoder(segment)}
    <CustomDecoderAudio {...props} />
  {:else}
    <PitchCorrectedAudio {...props} />
  {/if}
{/snippet}

<LiveItemTransformProvider source={liveItemTransformSource}>
  <NestedMediaResolutionProvider value={useProxyMedia ? 'proxy' : 'source'}>
    <KeyframesProvider {keyframes} items={expressionItems} canvas={expressionCanvas}>
      <CompositionSpaceProvider {projectWidth} {projectHeight} {renderWidth} {renderHeight}>
        <AbsoluteFill>
          <!-- BACKGROUND LAYER -->
          <AbsoluteFill style="background-color: {effectiveBackgroundColor}; z-index: -1;" />

          <!-- AUDIO LAYER - rendered outside visual layers to prevent re-renders from mask/visual changes -->
          <!-- Video audio is decoupled from visual video elements for transition stability -->
          <!-- Custom-decoded segments (AC-3/E-AC-3, Vorbis, PCM endian variants) use mediabunny instead of native <audio>. -->
          {#each previewTransitionAudioSegments as segment (segment.key)}
            <Sequence
              from={segment.from}
              durationInFrames={segment.durationInFrames}
              premountFor={Math.round(fps * TRANSITION_AUDIO_PREMOUNT_SECONDS)}
            >
              {@render segmentAudio(segment, true)}
            </Sequence>
          {/each}

          <!-- Standalone audio items - merged across split boundaries for stable playback -->
          {#each previewAudioSegments as segment (segment.key)}
            <Sequence
              from={segment.from}
              durationInFrames={segment.durationInFrames}
              premountFor={Math.round(fps * STANDALONE_AUDIO_PREMOUNT_SECONDS)}
            >
              {@render segmentAudio(segment, false)}
            </Sequence>
          {/each}

          {#each managedCompoundAudioSegments as segment (segment.key)}
            {@const compoundItem = managedCompoundAudioItemsById.get(segment.itemId)}
            {#if compoundItem}
              <Sequence
                from={segment.from}
                durationInFrames={segment.durationInFrames}
                premountFor={Math.round(fps * TRANSITION_AUDIO_PREMOUNT_SECONDS)}
              >
                <CompositionContent
                  item={{
                    ...compoundItem,
                    from: segment.from,
                    durationInFrames: segment.durationInFrames,
                    sourceStart: segment.trimBefore,
                    sourceEnd:
                      segment.trimBefore +
                      timelineToSourceFrames(
                        segment.durationInFrames,
                        segment.playbackRate ?? 1,
                        fps,
                        segment.sourceFps ?? fps,
                      ),
                    speed: segment.playbackRate,
                  }}
                  parentMuted={segment.muted}
                  renderMode="audio-only"
                  audioGainMultiplier={Math.pow(10, segment.volumeDb / 20)}
                  audioEqStages={appendResolvedAudioEqSources(
                    undefined,
                    busAudioEq,
                    compoundItem.trackAudioEq,
                    getAudioEqSettings(compoundItem),
                  )}
                  audioPitchShiftSemitones={segment.audioPitchShiftSemitones}
                  crossfadeFadeInFrames={segment.crossfadeFadeIn}
                  crossfadeFadeOutFrames={segment.crossfadeFadeOut}
                />
              </Sequence>
            {/if}
          {/each}

          {#each audioScene.standaloneCompoundAudioItems as item (`compound-audio-${item.id}`)}
            <Sequence
              from={item.from}
              durationInFrames={item.durationInFrames}
              premountFor={Math.round(fps * STANDALONE_AUDIO_PREMOUNT_SECONDS)}
            >
              <CompositionContent
                {item}
                parentMuted={item.muted || !item.trackVisible}
                renderMode="audio-only"
                audioGainMultiplier={Math.pow(10, ((item.volume ?? 0) + (item.trackVolumeDb ?? 0)) / 20)}
                audioEqStages={appendResolvedAudioEqSources(
                  undefined,
                  busAudioEq,
                  item.trackAudioEq,
                  getAudioEqSettings(item),
                )}
                audioPitchShiftSemitones={getAudioPitchShiftSemitones(item)}
              />
            </Sequence>
          {/each}

          <!-- ALL VISUAL LAYERS - videos and non-media in SINGLE wrapper for proper z-index stacking -->
          <!-- This ensures items from different tracks respect z-index across all types -->
          <ActiveMasksProvider masks={visibleShapeMasks} {canvasWidth} {canvasHeight}>
            <AbsoluteFill>
              <!-- VIDEO LAYER - all videos rendered via StableVideoSequence -->
              <!-- ALL effects (CSS, glitch, halftone) applied per-item via ItemEffectWrapper -->
              <StableVideoSequence
                items={videoItems}
                transitionWindows={renderPlan.transitionWindows}
                premountFor={Math.round(fps * VIDEO_CLIP_PREMOUNT_SECONDS)}
                renderItem={renderVideoItem}
              />

              <!-- NON-MEDIA LAYERS - text, shapes, etc. with per-item effects via ItemEffectWrapper -->
              <!-- No above/below split - items never move between DOM parents -->
              {#each nonMediaByTrack.filter((track) => track.items.length > 0) as track (track.id)}
                {@const trackOrder = track.order ?? 0}
                <!-- Non-media z-index: base + 100 (videos use base, transitions use base + 200) -->
                <AbsoluteFill
                  style="z-index: {(maxOrder - trackOrder) * 1000 + 100}; visibility: {track.trackVisible
                    ? 'visible'
                    : 'hidden'};"
                >
                  {#each track.items as item (item.id)}
                    {@const hasLinkedAudio =
                      item.type === 'composition' && hasLinkedAudioCompanion(audioItems, item)}
                    <Sequence from={item.from} durationInFrames={item.durationInFrames}>
                      <ItemEffectWrapper
                        itemTrackOrder={trackOrder}
                        adjustmentLayers={visibleAdjustmentLayers}
                        sequenceFrom={item.from}
                      >
                        <MaskedItem
                          {item}
                          muted={track.muted || !track.trackVisible || hasLinkedAudio}
                          visible={track.trackVisible}
                          itemTrackOrder={trackOrder}
                          compositionRenderMode={hasLinkedAudio ? 'visual-only' : 'full'}
                        />
                      </ItemEffectWrapper>
                    </Sequence>
                  {/each}
                </AbsoluteFill>
              {/each}
            </AbsoluteFill>
          </ActiveMasksProvider>
        </AbsoluteFill>
      </CompositionSpaceProvider>
    </KeyframesProvider>
  </NestedMediaResolutionProvider>
</LiveItemTransformProvider>

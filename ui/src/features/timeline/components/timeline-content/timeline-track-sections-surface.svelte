<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { applyTimelineLiveGeometry } from '@/features/timeline/utils/timeline-live-geometry'
  import { forwardContextMenuToNearestTrack } from '@/features/timeline/utils/forward-track-context-menu'
  import type { TimelineTrack as TimelineTrackType } from '@/types/timeline'
  import TimelineTrack from '../timeline-track.svelte'
  import { TimelineMediaDropZone } from '../timeline-media-drop-zone'
  import { FirstTrackRowFrame, TrackRowFrame, TrackSectionDivider } from '../track-row-frame'

  interface TimelineTrackSectionsSurfaceProps {
    tracksContainer?: HTMLDivElement | null
    fps: number
    actualDuration: number
    containerWidth: number
    initialTimelineWidth: number
    hasTrackSections: boolean
    videoTracks: TimelineTrackType[]
    audioTracks: TimelineTrackType[]
    singleSectionTracks: TimelineTrackType[]
    singleSectionKind: 'video' | 'audio'
    videoPaneHeight: number
    audioPaneHeight: number
    singleSectionHeight: number
    videoZoneHeight: number
    audioZoneHeight: number
    singleSectionZoneHeight: number
    topZoneAnchorTrackId: string | null
    bottomZoneAnchorTrackId: string | null
    singleSectionAnchorTrackId: string | null
    onSectionDividerMouseDown?: (event: MouseEvent) => void
    allTracksScroll?: HTMLDivElement | null
    videoTracksScroll?: HTMLDivElement | null
    audioTracksScroll?: HTMLDivElement | null
    children?: Snippet
  }

  let {
    tracksContainer = $bindable(null),
    fps,
    actualDuration,
    containerWidth,
    initialTimelineWidth,
    hasTrackSections,
    videoTracks,
    audioTracks,
    singleSectionTracks,
    singleSectionKind,
    videoPaneHeight,
    audioPaneHeight,
    singleSectionHeight,
    videoZoneHeight,
    audioZoneHeight,
    singleSectionZoneHeight,
    topZoneAnchorTrackId,
    bottomZoneAnchorTrackId,
    singleSectionAnchorTrackId,
    onSectionDividerMouseDown,
    allTracksScroll = $bindable(null),
    videoTracksScroll = $bindable(null),
    audioTracksScroll = $bindable(null),
    children,
  }: TimelineTrackSectionsSurfaceProps = $props()

  let committedSurface = $state<HTMLDivElement | null>(null)

  function applyTrackSurfaceZoom() {
    const outer = tracksContainer
    const surface = committedSurface
    if (!outer || !surface) {
      return
    }

    const { pixelsPerSecond } = useZoomStore.getState()
    applyTimelineLiveGeometry({
      outer,
      surface,
      duration: actualDuration,
      viewportWidth: containerWidth,
      livePixelsPerSecond: pixelsPerSecond,
      fps,
    })
  }

  $effect(() => {
    // The width attributes above are re-applied when the committed width changes;
    // live geometry must win again afterwards.
    void [actualDuration, containerWidth, fps, initialTimelineWidth, tracksContainer, committedSurface]
    untrack(applyTrackSurfaceZoom)
  })

  $effect(() =>
    useZoomStore.subscribe((state, previousState) => {
      if (state.pixelsPerSecond === previousState.pixelsPerSecond) {
        return
      }
      applyTrackSurfaceZoom()
    }),
  )

  const attachAllTracksScroll = (node: HTMLDivElement) => {
    allTracksScroll = node
    return () => {
      allTracksScroll = null
    }
  }
  const attachVideoTracksScroll = (node: HTMLDivElement) => {
    videoTracksScroll = node
    return () => {
      videoTracksScroll = null
    }
  }
  const attachAudioTracksScroll = (node: HTMLDivElement) => {
    audioTracksScroll = node
    return () => {
      audioTracksScroll = null
    }
  }
</script>

{#snippet trackSection(
  sectionTracks: TimelineTrackType[],
  options: {
    section: 'video' | 'audio'
    height: number
    zoneHeight: number
    anchorTrackId: string | null
    firstTrackFrame: 'with-top-divider' | 'regular'
    attachScroll: (node: HTMLDivElement) => () => void
  },
)}
  <div
    {@attach options.attachScroll}
    data-track-section-scroll={options.section}
    class="min-h-0 overflow-y-auto overflow-x-hidden"
    style:height="var(--timeline-{options.section}-pane-height, {options.height}px)"
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="relative min-h-full" oncontextmenu={forwardContextMenuToNearestTrack}>
      {#if options.section === 'video' && options.anchorTrackId}
        <TimelineMediaDropZone
          height={options.zoneHeight}
          zone="video"
          anchorTrackId={options.anchorTrackId}
        />
      {/if}
      {#if options.section === 'video' && !options.anchorTrackId}
        <div
          aria-hidden="true"
          style:height="var(--timeline-video-zone-height, {options.zoneHeight}px)"
        ></div>
      {/if}

      {#each sectionTracks as track, index (track.id)}
        {@const RowFrame =
          options.firstTrackFrame === 'with-top-divider' && index === 0
            ? FirstTrackRowFrame
            : TrackRowFrame}
        <RowFrame>
          <TimelineTrack {track} />
        </RowFrame>
      {/each}

      {#if options.section === 'audio' && options.anchorTrackId}
        <TimelineMediaDropZone
          height={options.zoneHeight}
          zone="audio"
          anchorTrackId={options.anchorTrackId}
        />
      {/if}
      {#if options.section === 'audio' && !options.anchorTrackId}
        <div
          aria-hidden="true"
          style:height="var(--timeline-audio-zone-height, {options.zoneHeight}px)"
        ></div>
      {/if}
    </div>
  </div>
{/snippet}

<div
  id="timeline-track-sections"
  bind:this={tracksContainer}
  class="relative timeline-tracks flex flex-1 min-h-0 flex-col"
  style:width="{initialTimelineWidth}px"
  style:contain="layout style paint"
>
  <div
    bind:this={committedSurface}
    data-timeline-committed-surface="tracks"
    class="absolute inset-y-0 left-0 flex min-h-0 flex-col"
    style:width="{initialTimelineWidth}px"
    style:contain="layout style paint"
    style:--timeline-percent-per-frame={actualDuration > 0 && fps > 0
      ? `${100 / (actualDuration * fps)}%`
      : '0%'}
    style:--timeline-percent-per-second={actualDuration > 0 ? `${100 / actualDuration}%` : '0%'}
  >
    {#if hasTrackSections}
      {@render trackSection(videoTracks, {
        section: 'video',
        height: videoPaneHeight,
        zoneHeight: videoZoneHeight,
        anchorTrackId: topZoneAnchorTrackId,
        firstTrackFrame: 'with-top-divider',
        attachScroll: attachVideoTracksScroll,
      })}
      <TrackSectionDivider onMouseDown={onSectionDividerMouseDown} />
      {@render trackSection(audioTracks, {
        section: 'audio',
        height: audioPaneHeight,
        zoneHeight: audioZoneHeight,
        anchorTrackId: bottomZoneAnchorTrackId,
        firstTrackFrame: 'regular',
        attachScroll: attachAudioTracksScroll,
      })}
    {:else}
      {@render trackSection(singleSectionTracks, {
        section: singleSectionKind,
        height: singleSectionHeight,
        zoneHeight: singleSectionZoneHeight,
        anchorTrackId: singleSectionAnchorTrackId,
        firstTrackFrame: 'with-top-divider',
        attachScroll: attachAllTracksScroll,
      })}
    {/if}
  </div>
  {@render children?.()}
</div>

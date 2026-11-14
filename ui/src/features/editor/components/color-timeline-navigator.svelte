<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem, TimelineTrack } from '@/types/timeline'
  import {
    MINI_FILM_TILE_STRIP_HEIGHT,
    MINI_TIMELINE_IO_LANE_HEIGHT,
    MINI_TIMELINE_RULER_HEIGHT,
  } from './mini-timeline'

  const STRIP_HEIGHT = 212
  // filmstrip (92) + IO lane (14) + ruler (20) + track area = STRIP_HEIGHT, so
  // every extra pixel goes to the track rows.
  const TRACK_AREA_HEIGHT =
    STRIP_HEIGHT - MINI_FILM_TILE_STRIP_HEIGHT - MINI_TIMELINE_IO_LANE_HEIGHT - MINI_TIMELINE_RULER_HEIGHT
  const VIDEO_TRACK_NAME_REGEX = /^V\d+$/i

  function isVisualNavigatorItem(item: TimelineItem): boolean {
    return item.type !== 'audio' && item.type !== 'subtitle'
  }

  function isNavigatorVideoTrack(track: TimelineTrack): boolean {
    if (track.isGroup) return false
    if (track.kind === 'audio') return false
    if (track.kind === 'video') return true
    return VIDEO_TRACK_NAME_REGEX.test(track.name)
  }

  function getNavigatorLabel(item: TimelineItem): string {
    const label = item.label.trim()
    if (label) return label
    return item.type === 'adjustment' ? 'Grade' : item.type
  }

  function getThumbnailUrl(item: TimelineItem): string | undefined {
    return 'thumbnailUrl' in item ? item.thumbnailUrl : undefined
  }
</script>

<script lang="ts">
  import { select, shallow } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import {
    useItemsStore,
    useMarkersStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useGizmoStore } from '@/features/editor/deps/preview'
  import {
    buildTimelineAnnotationModel,
    type TimelineAnnotationMarker,
  } from '@/shared/timeline/timeline-annotations'
  import { resolveColorGradeThumbnailTreatment } from '@/features/editor/utils/color-grade-thumbnail-treatment'
  import {
    MiniTimelineAnnotations,
    MiniTimelineIoLane,
    MiniTimelinePlayhead,
    MiniTimelineRuler,
    MiniTimelineTrackLanes,
    resolveMiniTimelineMaxFrame,
    useMediaPosterUrls,
    useMiniTimelineScrub,
    MINI_FILM_TILE_SCROLLBAR_GUTTER,
    MINI_TIMELINE_LABEL_WIDTH,
    type MiniTimelineClip,
  } from './mini-timeline'
  import ColorFilmTile from './color-film-tile.svelte'
  import {
    COLOR_TIMELINE_TEST_ID_PREFIX as TEST_ID_PREFIX,
    type ColorTimelineClip,
  } from './color-timeline-navigator-types'

  /**
   * Color workspace timeline navigator: a film-tile clip row over the shared mini
   * timeline (IO bar + annotations + ruler + track lanes + self-tracking
   * playhead). Clicking a tile or mini-clip seeks to + selects that clip; the
   * playhead is pinned while dragging the IO bar so it doesn't chase the markers.
   */
  const timeline = select(useItemsStore, (s) => ({ items: s.items, tracks: s.tracks }), shallow)
  const markerState = select(
    useMarkersStore,
    (s) => ({ markers: s.markers, inPoint: s.inPoint, outPoint: s.outPoint }),
    shallow,
  )
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const selectedMarkerId = select(useSelectionStore, (s) => s.selectedMarkerId)
  const livePreviewEdits = select(useGizmoStore, (s) => s.preview)
  // Set while an IO drag is active so the playhead stops chasing the preview
  // frame (the preview canvas itself keeps updating).
  const suppressPlayheadPreviewRef = { current: false }

  const selectedItemIdSet = $derived(new Set(selectedItemIds.current))
  const videoTrackRows = $derived(
    timeline.current.tracks.filter(isNavigatorVideoTrack).sort((a, b) => a.order - b.order),
  )
  const trackNameById = $derived(
    new Map(timeline.current.tracks.map((track) => [track.id, track.name || track.id])),
  )
  const filmClips: ColorTimelineClip[] = $derived.by(() => {
    const previews = livePreviewEdits.current
    const projectFps = fps.current
    return timeline.current.items
      .filter(isVisualNavigatorItem)
      .map((item) => ({
        id: item.id,
        type: item.type,
        label: getNavigatorLabel(item),
        trackName: trackNameById.get(item.trackId) ?? 'V1',
        mediaId: item.mediaId,
        from: item.from,
        durationInFrames: item.durationInFrames,
        sourceStartFrames: Math.max(0, item.sourceStart ?? 0),
        sourceDurationFrames: Math.max(1, item.sourceDuration ?? item.durationInFrames),
        sourceFps: item.sourceFps && item.sourceFps > 0 ? item.sourceFps : projectFps,
        trimStartFrames: item.trimStart ?? 0,
        thumbnailUrl: getThumbnailUrl(item),
        // Mini-clip lanes key off trackId; films tiles don't, but carrying it
        // keeps the two clip lists derived from one pass.
        trackId: item.trackId,
        effects: previews?.[item.id]?.effects ?? item.effects ?? [],
        gradeThumbnail: resolveColorGradeThumbnailTreatment(
          previews?.[item.id]?.effects ?? item.effects,
        ),
      }))
      .sort((a, b) => a.from - b.from || a.trackId.localeCompare(b.trackId))
  })
  const miniClips: MiniTimelineClip[] = $derived(
    filmClips.map((clip) => ({
      id: clip.id,
      trackId: clip.trackId,
      from: clip.from,
      durationInFrames: clip.durationInFrames,
      label: clip.label,
    })),
  )
  const posterMediaIds = $derived(
    Array.from(new Set(filmClips.map((clip) => clip.mediaId).filter((id): id is string => Boolean(id)))),
  )
  const posterUrls = useMediaPosterUrls(() => posterMediaIds)
  const timelineMaxFrame = $derived(
    resolveMiniTimelineMaxFrame({
      items: timeline.current.items,
      markers: markerState.current.markers,
      inPoint: markerState.current.inPoint,
      outPoint: markerState.current.outPoint,
    }),
  )
  const annotationModel = $derived(
    buildTimelineAnnotationModel({
      markers: markerState.current.markers,
      inPoint: markerState.current.inPoint,
      outPoint: markerState.current.outPoint,
      maxFrame: timelineMaxFrame,
    }),
  )

  const scrubHandlers = useMiniTimelineScrub(() => ({
    maxFrame: timelineMaxFrame,
    fps: fps.current,
    labelWidth: MINI_TIMELINE_LABEL_WIDTH,
  }))

  function seekToClip(clip: { id: string; from: number }) {
    const playback = usePlaybackStore.getState()
    playback.pause()
    playback.setPreviewFrame(null)
    playback.setCurrentFrame(clip.from)
    useSelectionStore.getState().selectItems([clip.id])
  }

  function seekToMarker(marker: TimelineAnnotationMarker) {
    const playback = usePlaybackStore.getState()
    playback.pause()
    playback.setPreviewFrame(null)
    playback.setCurrentFrame(marker.frame)
    useSelectionStore.getState().selectMarker(marker.id)
  }
</script>

<section
  class="panel-bg shrink-0 overflow-hidden border-y border-border bg-strip"
  aria-label={t('editor.colorTimeline.label')}
  data-testid="color-timeline-navigator"
  style:height="{STRIP_HEIGHT}px"
>
  <div class="flex h-full flex-col">
    <div
      class="flex shrink-0 gap-1 overflow-x-auto overflow-y-hidden border-b border-black/40 px-1 pt-1"
      data-testid="color-timeline-filmstrip-scroll"
      style:height="{MINI_FILM_TILE_STRIP_HEIGHT}px"
      style:padding-bottom="{MINI_FILM_TILE_SCROLLBAR_GUTTER}px"
    >
      {#if filmClips.length > 0}
        {#each filmClips as clip, index (`${clip.id}-film-tile`)}
          <ColorFilmTile
            {clip}
            {index}
            selected={selectedItemIdSet.has(clip.id)}
            fps={fps.current}
            posterUrl={clip.mediaId ? posterUrls.current.get(clip.mediaId) : undefined}
            onSelect={seekToClip}
          />
        {/each}
      {:else}
        <div class="flex h-full items-center px-2 text-[10px] font-medium text-zinc-500">
          {t('editor.colorTimeline.noClip')}
        </div>
      {/if}
    </div>

    <div
      class="relative flex min-h-0 flex-1 cursor-ew-resize flex-col bg-[#1d1e23]"
      data-testid="color-timeline-scrub-surface"
      {...scrubHandlers}
    >
      <div
        class="relative shrink-0 border-b border-black/40 bg-strip-muted"
        style:height="{MINI_TIMELINE_IO_LANE_HEIGHT}px"
      >
        <MiniTimelineIoLane
          model={annotationModel}
          {timelineMaxFrame}
          labelWidth={MINI_TIMELINE_LABEL_WIDTH}
          {suppressPlayheadPreviewRef}
          testIdPrefix={TEST_ID_PREFIX}
        />
      </div>
      <div class="relative flex min-h-0 flex-1 flex-col">
        <MiniTimelineAnnotations
          model={annotationModel}
          selectedMarkerId={selectedMarkerId.current}
          onMarkerPress={seekToMarker}
          labelWidth={MINI_TIMELINE_LABEL_WIDTH}
          testIdPrefix={TEST_ID_PREFIX}
        />
        <MiniTimelineRuler labelWidth={MINI_TIMELINE_LABEL_WIDTH} maxFrame={timelineMaxFrame} fps={fps.current} />
        <MiniTimelineTrackLanes
          tracks={videoTrackRows}
          clips={miniClips}
          selectedIds={selectedItemIdSet}
          maxFrame={timelineMaxFrame}
          trackAreaHeight={TRACK_AREA_HEIGHT}
          labelWidth={MINI_TIMELINE_LABEL_WIDTH}
          onSelectClip={seekToClip}
          fallbackLabelPrefix="V"
          clipTestId="color-timeline-mini-clip"
        />
        <MiniTimelinePlayhead
          labelWidth={MINI_TIMELINE_LABEL_WIDTH}
          maxFrame={timelineMaxFrame}
          handle="flag"
          pointer
          suppressPreviewRef={suppressPlayheadPreviewRef}
          testId="color-timeline-playhead"
        />
      </div>
    </div>
  </div>
</section>

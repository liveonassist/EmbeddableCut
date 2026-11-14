<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { AudioEqSettings } from '@/types/audio'
  import type { AudioMeterEstimate, AudioMeterWaveform } from './audio-meter-utils'
  import {
    captureSnapshot,
    useItemsStore,
  } from '@/features/editor/deps/timeline-store'

  type PanelMode = 'meter' | 'mixer'
  type EqPanelTarget = { kind: 'track'; trackId: string } | { kind: 'bus' }
  type EqPanelDescriptor =
    | {
        title: string
        targetLabel: string
        trackId: string
        trackEq: AudioEqSettings | undefined
        eqEnabled: boolean
      }
    | {
        title: string
        targetLabel: string
        busEq: AudioEqSettings | undefined
        eqEnabled: boolean
      }
  const MUTE_SOLO_LIVE_GAIN_LAYER_ID = 'track-mute-solo'

  function toWaveformSnapshot(
    waveform:
      | { peaks: Float32Array; sampleRate: number; channels?: number; stereo?: boolean }
      | null
      | undefined,
  ): AudioMeterWaveform | null {
    if (!waveform) {
      return null
    }

    return {
      peaks: waveform.peaks,
      sampleRate: waveform.sampleRate,
      channels: waveform.stereo ? 2 : (waveform.channels ?? 1),
    }
  }

  function animateChannel(
    channel: { displayPercent: number; peakPercent: number; peakHoldSeconds: number },
    targetPercent: number,
    deltaSeconds: number,
  ): void {
    if (targetPercent >= channel.displayPercent) {
      const attackFactor = 1 - Math.exp(-28 * deltaSeconds)
      channel.displayPercent += (targetPercent - channel.displayPercent) * attackFactor
    } else {
      channel.displayPercent = Math.max(targetPercent, channel.displayPercent - 76 * deltaSeconds)
    }

    if (channel.displayPercent >= channel.peakPercent) {
      channel.peakPercent = channel.displayPercent
      channel.peakHoldSeconds = 0.22
    } else if (channel.peakHoldSeconds > 0) {
      channel.peakHoldSeconds = Math.max(0, channel.peakHoldSeconds - deltaSeconds)
    } else {
      channel.peakPercent = Math.max(channel.displayPercent, channel.peakPercent - 54 * deltaSeconds)
    }
  }

  const EMPTY_PER_TRACK_LEVELS = new Map<string, AudioMeterEstimate>()

  const FLOATING_MIXER_STORAGE_KEY = 'editor:floatingMixerBounds'
  const FLOATING_MIXER_DEFAULT_BOUNDS = { x: -1, y: -1, width: 420, height: 500 }
  const DETACHED_EQ_STORAGE_KEY = 'editor:detachedEqPos'
  const DETACHED_EQ_DEFAULT_BOUNDS = {
    width: 780,
    height: 660,
  }
  const importAudioMixerView = () => import('./audio-mixer-view.svelte')

  function getTrackEditContext(trackId: string) {
    const itemsState = useItemsStore.getState()
    const currentTracks = itemsState.tracks
    const targetTrack = currentTracks.find((track) => track.id === trackId)
    if (!targetTrack) return null

    const snapshot = captureSnapshot()
    return {
      itemsState,
      currentTracks,
      targetTrack,
      beforeSnapshot: {
        ...snapshot,
        tracks: snapshot.tracks.map((track) => ({ ...track })),
      },
    }
  }

  // Segmented LED mask — matches the mixer view segments
  const segmentMask =
    'repeating-linear-gradient(to top, black 0px, black 3px, transparent 3px, transparent 4px)'
  const unlitLedBg =
    'repeating-linear-gradient(to top, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 3px, transparent 3px, transparent 4px)'
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { createSubscriber } from 'svelte/reactivity'
  import Check from 'lucide-svelte/icons/check'
  import MoreHorizontal from 'lucide-svelte/icons/ellipsis'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import {
    markDirty,
    selectAudioGraphItems,
    useCompositionsStore,
    useTimelineCommandStore,
    useTransitionsStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { importWaveformCache } from '@/features/editor/deps/timeline-cache'
  import { useGizmoStore, useThrottledFrame } from '@/features/editor/deps/preview'
  import { importMediaLibraryService } from '@/features/editor/deps/media-library'
  import { getResolvedPlaybackFrame, usePlaybackStore } from '@/shared/state/playback'
  import {
    getAudioSkimMeterLevel,
    subscribeAudioSkimMeterLevel,
  } from '@/shared/state/audio-skim-meter'
  import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
  import { useEditorStore } from '@/shared/state/editor/store'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { FloatingPanel } from '@/components/ui/floating-panel'
  import { WindowPortal } from '@/components/ui/window-portal'
  import {
    AUDIO_METER_SCALE_MARKS,
    compileAudioMeterGraph,
    dbMarkToPercent,
    estimateAudioMeterLevel,
    estimatePerTrackLevels,
    formatMeterDb,
    isAudioMixerTrack,
    linearLevelToPercent,
    getLiveBusVolumeOverride,
    subscribeLiveOverrideVersion,
    resolveCompiledAudioMeterSources,
    type AudioMeterCompositionLookup,
  } from './audio-meter-utils'
  import type { AudioMixerTrack } from './audio-mixer-view/types'
  import type { AudioEqPatch } from './properties-sidebar/clip-panel/audio-eq-curve-editor/types'
  import AudioEqPanelSurface from './audio-meter-panel/audio-eq-panel-surface.svelte'
  import { getSparseAudioEqSettings } from '@/shared/utils/audio-eq'
  import { clearMixerLiveGainLayer, setMixerLiveGainLayer } from '@/shared/state/mixer-live-gain'

  let panelMode: PanelMode = $state('meter')
  let eqPanelTarget: EqPanelTarget | null = $state.raw(null)
  const mixerFloating = select(useEditorStore, (s) => s.mixerFloating)
  let trackSnapshotVersion = $state(0)
  let eqDetachedWindow: Window | null = $state.raw(null)

  const tracks = select(useItemsStore, (s) => s.tracks)
  const transitions = select(useTransitionsStore, (s) => s.transitions)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const audioSkimmingEnabled = select(useTimelineSettingsStore, (s) => s.audioSkimmingEnabled)
  // Purely visual layers cannot contribute audio. Keep them out of this
  // subscription so moving text/shapes does not rebuild the complete mixer
  // graph on gizmo release.
  const audioGraphItems = select(useItemsStore, selectAudioGraphItems)
  const itemsByTrackId = $derived.by(() => {
    const grouped: Record<string, typeof audioGraphItems.current> = {}
    for (const item of audioGraphItems.current) {
      ;(grouped[item.trackId] ??= []).push(item)
    }
    return grouped
  })
  const compositions = select(useCompositionsStore, (s) => s.compositions)

  const isPlaying = select(usePlaybackStore, (s) => s.isPlaying)
  // The meter's visible bars animate via rAF + CSS variables (see runMeterAnimation),
  // so it doesn't need a 30/60Hz re-render per playback frame. Throttle the frame
  // inputs to ~15Hz while playing (the rAF animation smooths between target
  // updates); keep immediate updates when paused/scrubbing. displayedFrame is
  // ignored while playing (getResolvedPlaybackFrame returns currentFrame), so
  // it isn't read — and its per-frame churn isn't subscribed to — then.
  const currentFrame = useThrottledFrame(() => ({ updateDuringPlayback: true, throttleMs: 66 }))
  const bridgeDisplayedFrame = select(usePreviewBridgeStore, (s) => s.displayedFrame)
  const displayedFrame = $derived(isPlaying.current ? null : bridgeDisplayedFrame.current)
  const previewFrame = select(usePlaybackStore, (s) => s.previewFrame)
  const masterBusDb = select(usePlaybackStore, (s) => s.masterBusDb)
  // Monitor (per-device) values — used only to post-multiply meter readings
  // so the display matches what the user actually hears. Does not affect
  // the master fader (which drives the project-scoped masterBusDb).
  const monitorVolume = select(usePlaybackStore, (s) => s.volume)
  const muted = select(usePlaybackStore, (s) => s.muted)
  const busAudioEq = select(usePlaybackStore, (s) => s.busAudioEq)

  const trackAudioSkimMeter = createSubscriber((update) => subscribeAudioSkimMeterLevel(update))
  const audioSkimMeterLevel = $derived.by(() => {
    trackAudioSkimMeter()
    return getAudioSkimMeterLevel()
  })

  let waveformsByMediaId: Map<string, AudioMeterWaveform | null> = $state.raw(new Map())
  let meterVisualRoot: HTMLDivElement | null = $state(null)
  let targetPercent = { left: 0, right: 0 }
  let isMeterActiveForAnimation = false
  let animationFrame: number | null = null
  const meterAnimation = {
    left: { displayPercent: 0, peakPercent: 0, peakHoldSeconds: 0 },
    right: { displayPercent: 0, peakPercent: 0, peakHoldSeconds: 0 },
    lastTimestamp: 0,
  }

  const effectiveFrame = $derived(
    getResolvedPlaybackFrame({
      currentFrame: currentFrame.current,
      currentFrameEpoch: usePlaybackStore.getState().currentFrameEpoch,
      previewFrame: previewFrame.current,
      previewFrameEpoch: usePlaybackStore.getState().previewFrameEpoch,
      isPlaying: isPlaying.current,
      displayedFrame,
    }),
  )
  const combinedTracks = $derived.by(() => {
    void trackSnapshotVersion
    return tracks.current
      .filter((track) => !track.isGroup)
      .map((track) => ({
        ...track,
        items: itemsByTrackId[track.id] ?? [],
      }))
  })
  const combinedCompositionsById = $derived.by<AudioMeterCompositionLookup>(() => {
    const next: AudioMeterCompositionLookup = {}

    for (const composition of compositions.current) {
      const compositionItemsByTrackId: Record<string, typeof composition.items> = {}
      for (const item of composition.items) {
        ;(compositionItemsByTrackId[item.trackId] ??= []).push(item)
      }

      next[composition.id] = {
        id: composition.id,
        fps: composition.fps,
        transitions: composition.transitions ?? [],
        tracks: composition.tracks
          .filter((track) => !track.isGroup)
          .map((track) => ({
            ...track,
            items: compositionItemsByTrackId[track.id] ?? [],
          })),
      }
    }

    return next
  })

  const compiledGraph = $derived(
    compileAudioMeterGraph({
      tracks: combinedTracks,
      transitions: transitions.current,
      fps: fps.current,
      compositionsById: combinedCompositionsById,
    }),
  )

  // Re-resolve sources when live fader overrides change (fader drag in progress).
  const trackLiveOverrides = createSubscriber((update) => subscribeLiveOverrideVersion(update))

  // Read the bus override behind the same subscription so playbackGain
  // recomputes whenever the bus fader moves.
  const liveBusOverrideDb = $derived.by(() => {
    trackLiveOverrides()
    return getLiveBusVolumeOverride()
  })
  // Meter readings reflect what the user hears: project master bus (or live
  // drag override) × per-device monitor volume. Fader drags bypass the
  // stored masterBusDb via liveBusOverrideDb for no-lag feedback.
  const effectiveMasterGain = $derived(
    liveBusOverrideDb !== null
      ? Math.pow(10, liveBusOverrideDb / 20)
      : Math.pow(10, masterBusDb.current / 20),
  )
  const isAudioSkimMeterActive = $derived(
    audioSkimmingEnabled.current && audioSkimMeterLevel !== null && !isPlaying.current,
  )
  const isMeterActive = $derived(isPlaying.current || isAudioSkimMeterActive)
  const playbackGain = $derived(
    isMeterActive && !muted.current ? effectiveMasterGain * monitorVolume.current : 0,
  )

  const preloadSources = $derived.by(() => {
    trackLiveOverrides()
    return resolveCompiledAudioMeterSources({
      graph: compiledGraph,
      frame: effectiveFrame,
      masterGain: 1,
    })
  })

  // Per-track sources include track volume but not master/bus volume.
  const perTrackSources = $derived(!isMeterActive || muted.current ? [] : preloadSources)

  // Bus/master sources include both track volume and master volume.
  const sources = $derived.by(() => {
    if (playbackGain <= 0.0001) {
      return []
    }

    return preloadSources.map((source) => ({
      ...source,
      gain: source.gain * playbackGain,
    }))
  })

  const activeMediaIds = $derived(
    [...new Set(preloadSources.map((source) => source.mediaId))].sort(),
  )
  // Keyed by content, so the waveform subscriptions below only restart when the
  // set of active media changes, not on every frame's new array.
  const activeMediaIdsKey = $derived(activeMediaIds.join('|'))

  $effect(() => {
    void activeMediaIdsKey
    const stableActiveMediaIds = untrack(() => activeMediaIds)
    if (stableActiveMediaIds.length === 0) {
      waveformsByMediaId = new Map()
      return
    }

    let cancelled = false
    const unsubscribeFns: Array<() => void> = []

    void Promise.all([importWaveformCache(), importMediaLibraryService()]).then(
      ([waveformModule, mediaLibraryModule]) => {
        if (cancelled) {
          return
        }

        const { waveformCache } = waveformModule
        const { mediaLibraryService } = mediaLibraryModule

        const initial = new Map<string, AudioMeterWaveform | null>()
        for (const mediaId of stableActiveMediaIds) {
          initial.set(mediaId, toWaveformSnapshot(waveformCache.getFromMemoryCacheSync(mediaId)))
        }
        waveformsByMediaId = initial

        for (const mediaId of stableActiveMediaIds) {
          unsubscribeFns.push(
            waveformCache.subscribe(mediaId, (updated) => {
              if (cancelled) {
                return
              }

              const next = new Map(waveformsByMediaId)
              next.set(mediaId, toWaveformSnapshot(updated))
              waveformsByMediaId = next
            }),
          )

          const cached = waveformCache.getFromMemoryCacheSync(mediaId)
          if (cached?.isComplete) {
            continue
          }

          void mediaLibraryService
            .getMediaBlobUrl(mediaId)
            .then(async (blobUrl) => {
              if (!blobUrl) {
                return
              }

              try {
                await waveformCache.getWaveform(mediaId, blobUrl)
              } finally {
                URL.revokeObjectURL(blobUrl)
              }
            })
            .catch(() => {
              // Best-effort meter loading only.
            })
        }
      },
    )

    return () => {
      cancelled = true
      for (const unsubscribe of unsubscribeFns) {
        unsubscribe()
      }
    }
  })

  const waveformEstimate = $derived(
    estimateAudioMeterLevel({
      sources,
      waveformsByMediaId,
    }),
  )
  const skimFallbackEstimate = $derived(
    audioSkimMeterLevel
      ? {
          left: audioSkimMeterLevel.left,
          right: audioSkimMeterLevel.right,
          resolvedSourceCount: 1,
          unresolvedSourceCount: 0,
        }
      : null,
  )
  const estimate = $derived(
    isAudioSkimMeterActive && waveformEstimate.resolvedSourceCount === 0 && skimFallbackEstimate
      ? skimFallbackEstimate
      : waveformEstimate,
  )
  const maxLevel = $derived(Math.max(estimate.left, estimate.right))
  const statusLabel = $derived(
    !isMeterActive
      ? 'Idle'
      : estimate.unresolvedSourceCount > 0 && estimate.resolvedSourceCount === 0
        ? 'Scanning'
        : isAudioSkimMeterActive
          ? 'Skim'
          : formatMeterDb(maxLevel),
  )
  const scanFallbackPercent = $derived(
    isMeterActive && estimate.unresolvedSourceCount > 0 && estimate.resolvedSourceCount === 0
      ? 18
      : 0,
  )

  // ---------------------------------------------------------------------------
  // Meter animation (only active in meter mode, but state kept alive)
  // ---------------------------------------------------------------------------

  function applyMeterVisuals(
    leftDisplay: number,
    leftPeak: number,
    rightDisplay: number,
    rightPeak: number,
  ) {
    const el = meterVisualRoot
    if (el) {
      el.style.setProperty('--meter-l', `${leftDisplay}%`)
      el.style.setProperty('--meter-l-peak', `${leftPeak}%`)
      el.style.setProperty('--meter-r', `${rightDisplay}%`)
      el.style.setProperty('--meter-r-peak', `${rightPeak}%`)
    }
  }

  function runMeterAnimation(timestamp: number) {
    const state = meterAnimation
    const deltaSeconds =
      state.lastTimestamp > 0 ? Math.min(0.05, (timestamp - state.lastTimestamp) / 1000) : 1 / 60
    state.lastTimestamp = timestamp

    const { left: targetLeft, right: targetRight } = targetPercent
    animateChannel(state.left, targetLeft, deltaSeconds)
    animateChannel(state.right, targetRight, deltaSeconds)

    applyMeterVisuals(
      state.left.displayPercent,
      state.left.peakPercent,
      state.right.displayPercent,
      state.right.peakPercent,
    )

    const shouldContinue =
      isMeterActiveForAnimation ||
      targetLeft > 0.1 ||
      targetRight > 0.1 ||
      state.left.displayPercent > 0.1 ||
      state.right.displayPercent > 0.1 ||
      state.left.peakPercent > 0.1 ||
      state.right.peakPercent > 0.1

    if (shouldContinue) {
      animationFrame = requestAnimationFrame(runMeterAnimation)
      return
    }

    animationFrame = null
    state.lastTimestamp = 0
  }

  function ensureMeterAnimation() {
    if (animationFrame !== null) {
      return
    }
    animationFrame = requestAnimationFrame(runMeterAnimation)
  }

  $effect(() => {
    isMeterActiveForAnimation = isMeterActive
    targetPercent = {
      left: Math.max(linearLevelToPercent(estimate.left), scanFallbackPercent),
      right: Math.max(linearLevelToPercent(estimate.right), scanFallbackPercent),
    }
    untrack(ensureMeterAnimation)
  })

  $effect(() => {
    untrack(() => applyMeterVisuals(0, 0, 0, 0))
    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame)
        animationFrame = null
      }
      const anim = meterAnimation
      anim.left.displayPercent = 0
      anim.left.peakPercent = 0
      anim.left.peakHoldSeconds = 0
      anim.right.displayPercent = 0
      anim.right.peakPercent = 0
      anim.right.peakHoldSeconds = 0
      anim.lastTimestamp = 0
    }
  })

  // ---------------------------------------------------------------------------
  // Mixer-mode data
  // ---------------------------------------------------------------------------

  const mixerSourceTracks = $derived(combinedTracks.filter((track) => isAudioMixerTrack(track)))

  const mixerTracks = $derived<AudioMixerTrack[]>(
    mixerSourceTracks.map((track) => ({
      id: track.id,
      name: track.name,
      kind: track.kind,
      color: track.color,
      muted: track.muted,
      solo: track.solo,
      volume: track.volume || 0,
      eqEnabled: !!track.audioEq && track.audioEq.enabled !== false,
      itemIds: track.items.map((item) => item.id),
    })),
  )

  const perTrackLevels = $derived.by(() => {
    if ((panelMode !== 'mixer' && !mixerFloating.current) || perTrackSources.length === 0)
      return EMPTY_PER_TRACK_LEVELS
    return estimatePerTrackLevels({
      tracks: combinedTracks,
      sources: perTrackSources,
      waveformsByMediaId,
      targetTrackIds: mixerSourceTracks.map((track) => track.id),
    })
  })

  const eqPanelDescriptor = $derived.by<EqPanelDescriptor | null>(() => {
    const target = eqPanelTarget
    if (!target) return null

    if (target.kind === 'track') {
      const track = mixerSourceTracks.find((entry) => entry.id === target.trackId)
      if (!track) return null
      return {
        title: track.name,
        targetLabel: track.name,
        trackId: track.id,
        trackEq: track.audioEq,
        eqEnabled: track.audioEq?.enabled !== false,
      }
    }

    return {
      title: 'Bus 1',
      targetLabel: 'Bus 1',
      busEq: busAudioEq.current,
      eqEnabled: busAudioEq.current?.enabled !== false,
    }
  })

  $effect(() => {
    if (eqPanelTarget && !eqPanelDescriptor) {
      eqPanelTarget = null
    }
  })

  // Commit track volume in place to avoid preview playback stalls during active playback.
  // Undo remains correct because we add an explicit pre-mutation snapshot entry.
  // Local version state forces the mixer UI to pick up the mutated track value.
  function handleTrackVolumeChange(trackId: string, volumeDb: number) {
    if (!Number.isFinite(volumeDb)) return
    const edit = getTrackEditContext(trackId)
    if (!edit) return
    const { beforeSnapshot, currentTracks, targetTrack } = edit

    let didChange = false
    const safeTargetVolume =
      typeof targetTrack.volume === 'number' && Number.isFinite(targetTrack.volume)
        ? targetTrack.volume
        : 0
    if (Math.abs(safeTargetVolume - volumeDb) > 0.0001) {
      didChange = true
    }

    for (const track of currentTracks) {
      if (track.id === trackId) {
        ;(track as { volume: number }).volume = volumeDb
        continue
      }
      if (!Number.isFinite(track.volume)) {
        ;(track as { volume: number }).volume = 0
        didChange = true
      }
    }

    if (!didChange) {
      return
    }

    markDirty()
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'UPDATE_TRACK_VOLUME', payload: { id: trackId } }, beforeSnapshot)
    trackSnapshotVersion += 1
  }

  function handleTrackEqChange(trackId: string, patch: AudioEqPatch) {
    const edit = getTrackEditContext(trackId)
    if (!edit) return
    const { beforeSnapshot, currentTracks, itemsState, targetTrack } = edit
    const eqPatch = getSparseAudioEqSettings(patch)
    const nextTrackEq = { ...targetTrack.audioEq, ...eqPatch, midGainDb: 0 }
    const nextTracks = currentTracks.map((track) =>
      track.id === trackId ? { ...track, audioEq: nextTrackEq } : track,
    )
    itemsState.setTracks(nextTracks)
    const trackItemIds = (itemsState.itemsByTrackId[trackId] ?? []).map((item) => item.id)
    if (trackItemIds.length > 0) {
      useGizmoStore.getState().clearPreviewForItems(trackItemIds)
    }
    markDirty()
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'UPDATE_TRACK_EQ', payload: { id: trackId } }, beforeSnapshot)
    trackSnapshotVersion += 1
  }

  function handleTrackEqEnabledChange(trackId: string, enabled: boolean) {
    const edit = getTrackEditContext(trackId)
    if (!edit) return
    const { beforeSnapshot, currentTracks, itemsState } = edit
    const nextTracks = currentTracks.map((track) =>
      track.id === trackId ? { ...track, audioEq: { ...(track.audioEq ?? {}), enabled } } : track,
    )
    itemsState.setTracks(nextTracks)
    const trackItemIds = (itemsState.itemsByTrackId[trackId] ?? []).map((item) => item.id)
    if (trackItemIds.length > 0) {
      useGizmoStore.getState().clearPreviewForItems(trackItemIds)
    }
    markDirty()
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'UPDATE_TRACK_EQ_ENABLED', payload: { id: trackId } }, beforeSnapshot)
    trackSnapshotVersion += 1
  }

  function handleBusEqChange(patch: AudioEqPatch) {
    const snapshot = captureSnapshot()
    const eqPatch = getSparseAudioEqSettings(patch)
    const current = usePlaybackStore.getState().busAudioEq
    usePlaybackStore.getState().setBusAudioEq({ ...current, ...eqPatch, midGainDb: 0 })
    markDirty()
    useTimelineCommandStore.getState().addUndoEntry({ type: 'UPDATE_BUS_EQ', payload: {} }, snapshot)
  }

  function handleBusEqEnabledChange(enabled: boolean) {
    const snapshot = captureSnapshot()
    const current = usePlaybackStore.getState().busAudioEq
    usePlaybackStore.getState().setBusAudioEq({ ...(current ?? {}), enabled })
    markDirty()
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'UPDATE_BUS_EQ_ENABLED', payload: {} }, snapshot)
  }

  function ensureDetachedEqWindow() {
    const existingWindow = eqDetachedWindow
    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus()
      return true
    }

    // Size is fixed from DETACHED_EQ_DEFAULT_BOUNDS; position is a hint —
    // WindowPortal will apply the persisted position and force correct size
    // via resizeTo on mount.
    const nextWindow = window.open(
      '',
      '',
      [
        `width=${DETACHED_EQ_DEFAULT_BOUNDS.width}`,
        `height=${DETACHED_EQ_DEFAULT_BOUNDS.height}`,
        `left=${window.screenX + 120}`,
        `top=${window.screenY + 80}`,
        'menubar=no',
        'toolbar=no',
        'location=no',
        'status=no',
      ].join(','),
    )

    if (!nextWindow) {
      return false
    }

    eqDetachedWindow = nextWindow
    return true
  }

  // Collect all item IDs for a track (needed for live gain bridging)
  function getTrackItemIds(trackId: string): string[] {
    const items = useItemsStore.getState().itemsByTrackId[trackId]
    return items ? items.map((item) => item.id) : []
  }

  // Apply live gains to reflect current mute/solo state across all mixer tracks.
  // Called after in-place mutation so the audio path picks up changes immediately
  // without waiting for a full composition re-render.
  function applyMuteSoloLiveGains() {
    const currentTracks = useItemsStore.getState().tracks
    const currentItemsByTrackId = useItemsStore.getState().itemsByTrackId
    const audioTracks = currentTracks
      .filter((t) => !t.isGroup)
      .map((track) => ({
        ...track,
        items: currentItemsByTrackId[track.id] ?? [],
      }))
      .filter((track) => isAudioMixerTrack(track))
    if (audioTracks.length === 0) {
      clearMixerLiveGainLayer(MUTE_SOLO_LIVE_GAIN_LAYER_ID)
      return
    }
    const anySoloed = audioTracks.some((t) => t.solo)
    const liveGainEntries: Array<{ itemId: string; gain: number }> = []

    for (const t of audioTracks) {
      const shouldMute = t.muted || (anySoloed && !t.solo)
      const gain = shouldMute ? 0 : 1
      for (const itemId of getTrackItemIds(t.id)) {
        liveGainEntries.push({ itemId, gain })
      }
    }

    if (liveGainEntries.length > 0) {
      setMixerLiveGainLayer(MUTE_SOLO_LIVE_GAIN_LAYER_ID, liveGainEntries)
    } else {
      clearMixerLiveGainLayer(MUTE_SOLO_LIVE_GAIN_LAYER_ID)
    }
  }

  // In-place mutation for mute/solo — same pattern as volume change.
  // setTracks() triggers full composition re-render which stalls playback.
  // Live gains bridge the gap so audio responds immediately.
  function handleTrackMuteToggle(trackId: string) {
    const currentTracks = useItemsStore.getState().tracks
    const track = currentTracks.find((t) => t.id === trackId)
    if (!track) return
    const snapshot = captureSnapshot()
    const beforeSnapshot = {
      ...snapshot,
      tracks: snapshot.tracks.map((t) => ({ ...t })),
    }
    ;(track as { muted: boolean }).muted = !track.muted
    applyMuteSoloLiveGains()
    markDirty()
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'UPDATE_TRACK_MUTE', payload: { id: trackId } }, beforeSnapshot)
    trackSnapshotVersion += 1
  }

  function handleTrackSoloToggle(trackId: string) {
    const currentTracks = useItemsStore.getState().tracks
    const track = currentTracks.find((t) => t.id === trackId)
    if (!track) return
    const snapshot = captureSnapshot()
    const beforeSnapshot = {
      ...snapshot,
      tracks: snapshot.tracks.map((t) => ({ ...t })),
    }
    ;(track as { solo: boolean }).solo = !track.solo
    applyMuteSoloLiveGains()
    markDirty()
    useTimelineCommandStore
      .getState()
      .addUndoEntry({ type: 'UPDATE_TRACK_SOLO', payload: { id: trackId } }, beforeSnapshot)
    trackSnapshotVersion += 1
  }

  function handleTrackEqToggle(trackId: string) {
    if (eqPanelTarget?.kind === 'track' && eqPanelTarget.trackId === trackId) {
      eqPanelTarget = null
      return
    }

    if (!ensureDetachedEqWindow()) {
      return
    }

    const targetTrack = useItemsStore.getState().tracks.find((track) => track.id === trackId)
    if (targetTrack && !targetTrack.audioEq) {
      handleTrackEqEnabledChange(trackId, true)
    }

    eqPanelTarget = { kind: 'track', trackId }
  }

  function handleBusEqToggle() {
    if (eqPanelTarget?.kind === 'bus') {
      eqPanelTarget = null
      return
    }

    if (!ensureDetachedEqWindow()) {
      return
    }

    if (!usePlaybackStore.getState().busAudioEq) {
      handleBusEqEnabledChange(true)
    }

    eqPanelTarget = { kind: 'bus' }
  }

  // ---------------------------------------------------------------------------
  // Master bus fader — drives the project-scoped masterBusDb. This affects
  // both preview and export and is saved with the project. The per-device
  // monitor slider near the playback controls is a separate post-bus gain.
  // ---------------------------------------------------------------------------

  const masterVolumeDb = $derived(Math.max(-60, Math.min(12, masterBusDb.current)))

  function handleMasterVolumeChange(db: number) {
    usePlaybackStore.getState().setMasterBusDb(db)
  }

  function toggleMute() {
    usePlaybackStore.getState().toggleMute()
  }

  const eqPanelContentProps = $derived.by(() => {
    const descriptor = eqPanelDescriptor
    if (!descriptor) return null

    return {
      targetLabel: descriptor.targetLabel,
      trackEq:
        'trackEq' in descriptor
          ? descriptor.trackEq
          : 'busEq' in descriptor
            ? descriptor.busEq
            : undefined,
      enabled: descriptor.eqEnabled,
      onTrackEqChange:
        'trackId' in descriptor
          ? (patch: AudioEqPatch) => handleTrackEqChange(descriptor.trackId, patch)
          : 'busEq' in descriptor
            ? handleBusEqChange
            : undefined,
      onEnabledChange:
        'trackId' in descriptor
          ? (enabled: boolean) => handleTrackEqEnabledChange(descriptor.trackId, enabled)
          : 'busEq' in descriptor
            ? handleBusEqEnabledChange
            : undefined,
    }
  })

  function closeDetachedEq() {
    eqDetachedWindow = null
    eqPanelTarget = null
  }

  const busEqEnabled = $derived(!!busAudioEq.current && busAudioEq.current.enabled !== false)
  const isScanningMeter = $derived(
    estimate.unresolvedSourceCount > 0 && estimate.resolvedSourceCount === 0,
  )
</script>

<!-- Mode dropdown (shared across both views) -->
{#snippet modeDropdown()}
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <button
          {...props}
          class="h-5 w-5 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label={t('editor.audioMeters.panelMode')}
        >
          <MoreHorizontal size={14} />
        </button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-[120px]">
      <DropdownMenuItem onSelect={() => (panelMode = 'meter')}>
        <span class="w-4 inline-flex items-center justify-start">
          {#if panelMode === 'meter'}<Check class="h-3.5 w-3.5" />{/if}
        </span>
        {t('editor.audioMeters.meters')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => (panelMode = 'mixer')}>
        <span class="w-4 inline-flex items-center justify-start">
          {#if panelMode === 'mixer'}<Check class="h-3.5 w-3.5" />{/if}
        </span>
        {t('editor.audioMeters.mixer')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          const floating = useEditorStore.getState().mixerFloating
          if (!floating) panelMode = 'mixer'
          useEditorStore.getState().setMixerFloating(!floating)
        }}
      >
        <span class="w-4 inline-flex items-center justify-start">
          {#if mixerFloating.current}<Check class="h-3.5 w-3.5" />{/if}
        </span>
        {t('editor.audioMeters.floatMixer')}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
{/snippet}

{#snippet mixerView(docked: boolean)}
  {#await importAudioMixerView() then { default: AudioMixerView }}
    <AudioMixerView
      tracks={mixerTracks}
      {perTrackLevels}
      masterEstimate={estimate}
      isPlaying={isMeterActive}
      {masterVolumeDb}
      masterMuted={muted.current}
      onMasterVolumeChange={handleMasterVolumeChange}
      onMasterMuteToggle={toggleMute}
      onTrackVolumeChange={handleTrackVolumeChange}
      onTrackMuteToggle={handleTrackMuteToggle}
      onTrackSoloToggle={handleTrackSoloToggle}
      onTrackEqToggle={handleTrackEqToggle}
      onBusEqToggle={handleBusEqToggle}
      {busEqEnabled}
      headerExtra={docked ? modeDropdown : undefined}
      expanded={!docked}
    />
  {/await}
{/snippet}

<!-- Detached EQ window -->
{#if eqPanelDescriptor && eqPanelContentProps}
  <WindowPortal
    title={`Equalizer - ${eqPanelDescriptor.title}`}
    width={DETACHED_EQ_DEFAULT_BOUNDS.width}
    height={DETACHED_EQ_DEFAULT_BOUNDS.height}
    storageKey={DETACHED_EQ_STORAGE_KEY}
    externalWindow={eqDetachedWindow}
    autoHeight
    onBlocked={closeDetachedEq}
    onClose={closeDetachedEq}
  >
    <AudioEqPanelSurface layoutMode="floating" {...eqPanelContentProps} />
  </WindowPortal>
{/if}

{#if panelMode === 'mixer' && !mixerFloating.current}
  <!-- Mixer mode (docked) -->
  {@render mixerView(true)}
{:else}
  <!-- Meter mode (default) — also shows floating mixer if enabled -->
  {#if mixerFloating.current}
    <FloatingPanel
      title={t('editor.audioMeters.mixer')}
      defaultBounds={FLOATING_MIXER_DEFAULT_BOUNDS}
      minWidth={200}
      minHeight={280}
      storageKey={FLOATING_MIXER_STORAGE_KEY}
      onClose={() => useEditorStore.getState().setMixerFloating(false)}
      headerExtra={modeDropdown}
      autoWidth
    >
      {@render mixerView(false)}
    </FloatingPanel>
  {/if}
  <aside
    class="panel-bg border-l border-border flex h-full flex-col overflow-hidden"
    style:width={EDITOR_LAYOUT_CSS_VALUES.timelineMeterWidth}
    aria-label={t('editor.audioMeters.audioMeter')}
  >
    <div
      class="flex min-w-0 items-center justify-between gap-1 border-b border-border bg-secondary/20 px-1.5"
      style:height={EDITOR_LAYOUT_CSS_VALUES.timelineTracksHeaderHeight}
    >
      <span class="min-w-0 text-xs text-muted-foreground font-mono uppercase tracking-[0.12em]">
        {t('editor.audioMeters.meters')}
      </span>
      {@render modeDropdown()}
    </div>

    <div class="flex-1 px-2 py-3 min-h-0">
      <div
        class="h-full rounded-md border border-border/50 bg-black/30 px-2 py-3 shadow-[inset_0_1px_4px_rgba(0,0,0,0.4)]"
      >
        <div class="mb-3 text-center text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-mono">
          Master
        </div>

        <div class="flex h-[calc(100%-2.75rem)] items-stretch gap-3">
          <!-- Scale marks -->
          <div class="relative flex-1 min-w-0">
            {#each AUDIO_METER_SCALE_MARKS as mark (mark)}
              <div class="absolute inset-x-0" style:bottom="{dbMarkToPercent(mark)}%">
                <div class="absolute left-0 right-5 h-px bg-border/30"></div>
                <span class="absolute right-0 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">
                  {mark}
                </span>
              </div>
            {/each}
          </div>

          <!-- Segmented stereo meters -->
          <div class="flex flex-col items-center">
            <div bind:this={meterVisualRoot} class="flex flex-1 gap-[3px]">
              {#each ['l', 'r'] as channel (channel)}
                <div
                  class="relative w-[14px] rounded-[2px] border border-border/50 bg-[#08090b] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] overflow-hidden"
                >
                  <!-- Unlit LED backdrop -->
                  <div class="absolute inset-0 pointer-events-none" style:background={unlitLedBg}></div>
                  <!-- Active fill with segment mask -->
                  <div
                    class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1be255] via-[#f5e146] to-[#ff6633] transition-[height] duration-75 ease-out {isScanningMeter
                      ? 'opacity-50'
                      : ''}"
                    style:height="var(--meter-{channel}, 0%)"
                    style:mask-image={segmentMask}
                    style:-webkit-mask-image={segmentMask}
                  ></div>
                  <!-- Peak hold — single bright segment -->
                  <div
                    class="absolute inset-x-0 h-[3px] bg-white/85 shadow-[0_0_5px_rgba(255,255,255,0.5)] transition-[bottom] duration-100 ease-out"
                    style:bottom="calc(var(--meter-{channel}-peak, 0%) - 1px)"
                    style:mask-image={segmentMask}
                    style:-webkit-mask-image={segmentMask}
                  ></div>
                </div>
              {/each}
            </div>
            <div class="mt-1 flex gap-[3px] text-[8px] font-mono text-muted-foreground justify-center">
              <span class="w-[14px] text-center">L</span>
              <span class="w-[14px] text-center">R</span>
            </div>
          </div>
        </div>

        <!-- Peak dB readout -->
        <div class="mt-3 text-center text-[10px] font-mono text-muted-foreground">
          {statusLabel}
        </div>
      </div>
    </div>
  </aside>
{/if}

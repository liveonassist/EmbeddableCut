<!-- SPDX-License-Identifier: MIT -->
<!--
  The editor's composition in a player, and nothing else: what `mountPreview`
  shows. The engine's playback store drives it as it drives FreeCut's preview
  (play/pause, seeks, hover previews, transport rate), and the player reports
  its frames back while playing.
-->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { select, shallow } from '$lib/store.svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useTransitionsStore } from '@/features/timeline/stores/transitions-store'
  import { useKeyframesStore } from '@/features/timeline/stores/keyframes-store'
  import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store'
  import { useProjectStore } from '@/features/projects/stores/project-store'
  import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager'
  import { resolveMediaUrl } from '@/features/media-library/utils/media-resolver'
  import { createLogger } from '@/shared/logging/logger'
  import {
    planCurrentFrameSyncCommand,
    planPlaybackStateCommand,
    planPreviewFrameSyncCommand,
    type PlayerCommand,
  } from '@/features/preview/utils/player-command-planner'
  import { resolvePreviewTransitionFromPlaybackStates } from '@/features/preview/utils/preview-state-coordinator'
  import { HeadlessPlayer, type PlayerRef } from '@/features/preview/deps/player-core'
  import { MainComposition } from '@/features/preview/deps/composition-runtime-ui'
  import { useBlobUrlVersion } from '@/infrastructure/browser/use-blob-url-version.svelte'
  import { buildPreviewInput } from './preview-input'

  const log = createLogger('MountedPreview')

  const tracks = select(useItemsStore, (s) => s.tracks)
  const items = select(useItemsStore, (s) => s.items)
  const itemsByTrackId = select(useItemsStore, (s) => s.itemsByTrackId)
  const transitions = select(useTransitionsStore, (s) => s.transitions)
  const keyframes = select(useKeyframesStore, (s) => s.keyframes)
  const busAudioEq = select(usePlaybackStore, (s) => s.busAudioEq)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const project = select(
    useProjectStore,
    (s) => ({
      width: s.currentProject?.metadata.width ?? 1920,
      height: s.currentProject?.metadata.height ?? 1080,
      backgroundColor: s.currentProject?.metadata.backgroundColor,
    }),
    shallow,
  )
  const blobUrlVersion = useBlobUrlVersion()

  // URLs resolved here for media that has no blob URL yet (workspace files
  // being read, remote media).
  let resolvedUrls = $state.raw(new Map<string, string>())
  const pendingMediaIds = new Set<string>()
  const mediaIds = $derived.by(() => {
    const ids = new Set<string>()
    for (const item of items.current) if (item.mediaId) ids.add(item.mediaId)
    return ids
  })
  let disposed = false
  $effect(() => {
    void blobUrlVersion.current
    for (const mediaId of mediaIds) {
      if (pendingMediaIds.has(mediaId) || blobUrlManager.get(mediaId)) continue
      if (untrack(() => resolvedUrls.has(mediaId))) continue
      pendingMediaIds.add(mediaId)
      resolveMediaUrl(mediaId)
        .then((url) => {
          if (disposed) return
          resolvedUrls = new Map(resolvedUrls).set(mediaId, url)
        })
        .catch((error) => log.warn('Failed to resolve preview media', { mediaId, error }))
        .finally(() => pendingMediaIds.delete(mediaId))
    }
  })

  const preview = $derived.by(() => {
    void blobUrlVersion.current
    const urls = resolvedUrls
    return buildPreviewInput({
      tracks: tracks.current,
      itemsByTrackId: itemsByTrackId.current,
      items: items.current,
      transitions: transitions.current,
      keyframes: keyframes.current,
      busAudioEq: busAudioEq.current,
      fps: fps.current,
      project: project.current,
      getMediaUrl: (mediaId) => blobUrlManager.get(mediaId) ?? urls.get(mediaId) ?? null,
    })
  })

  let player = $state<PlayerRef | null>(null)
  // Frames the player reports while settling on a seek it was given are not
  // the user's: ignore them until the next frame.
  let ignorePlayerUpdates = false
  let lastSyncedFrame = untrack(() => usePlaybackStore.getState().currentFrame)
  let lastSeekTarget: number | null = null
  const backwardScrubState: { lastSeekAtMs: number; lastSeekFrame: number | null } = {
    lastSeekAtMs: 0,
    lastSeekFrame: null,
  }

  function playerFrame(): number | null {
    const frame = player?.getCurrentFrame()
    return frame !== undefined && Number.isFinite(frame) ? Math.round(frame) : null
  }

  function seekPlayer(targetFrame: number, holdIgnore = false, forceReplay = false) {
    if (!player) return
    if (playerFrame() === targetFrame) {
      lastSyncedFrame = targetFrame
      lastSeekTarget = targetFrame
      return
    }
    if (!forceReplay && lastSeekTarget === targetFrame && ignorePlayerUpdates) return
    ignorePlayerUpdates = true
    player.seekTo(targetFrame)
    lastSyncedFrame = targetFrame
    lastSeekTarget = targetFrame
    if (!holdIgnore) {
      requestAnimationFrame(() => {
        ignorePlayerUpdates = false
      })
    }
  }

  function execute(command: PlayerCommand) {
    if (!player) return
    switch (command.type) {
      case 'pause':
        player.pause()
        return
      case 'play':
        player.play()
        return
      case 'seek':
        seekPlayer(command.targetFrame)
        return
      case 'seek_and_play':
        seekPlayer(command.targetFrame, true, true)
        if (usePlaybackStore.getState().isPlaying) player.play()
        ignorePlayerUpdates = false
        return
      default:
        return
    }
  }

  // A preview mounting mid-playback starts paused at the store's frame, as
  // FreeCut's does after a remount.
  untrack(() => {
    const playback = usePlaybackStore.getState()
    if (playback.isPlaying) playback.pause()
  })

  const playbackRate = select(usePlaybackStore, (s) => s.playbackRate)
  $effect(() => {
    const rate = playbackRate.current
    player?.setPlaybackRate(rate)
  })

  // Store → player: transport, playhead and hover previews.
  $effect(() => {
    if (!player) return
    seekPlayer(usePlaybackStore.getState().currentFrame)
    return usePlaybackStore.subscribe((state, prev) => {
      if (!player) return
      if (state.isPlaying !== prev.isPlaying) {
        const plan = planPlaybackStateCommand({
          wasPlaying: prev.isPlaying,
          isPlaying: state.isPlaying,
          currentFrame: state.currentFrame,
          playerFrame: playerFrame(),
        })
        if (plan.clearPreviewFrame) state.setPreviewFrame(null)
        execute(plan.command)
      }
      const transition = resolvePreviewTransitionFromPlaybackStates({
        prev,
        next: state,
        isGizmoInteracting: false,
      })
      const framePlan = planCurrentFrameSyncCommand({
        transition,
        currentFrame: state.currentFrame,
        lastSyncedFrame,
        playerFrame: playerFrame(),
      })
      if (framePlan.acknowledgedFrame !== null) lastSyncedFrame = framePlan.acknowledgedFrame
      if (framePlan.command.type === 'seek') {
        seekPlayer(framePlan.command.targetFrame)
        return
      }
      const previewPlan = planPreviewFrameSyncCommand({
        transition,
        currentFrame: state.currentFrame,
        previewFrame: state.previewFrame,
        currentFrameEpoch: state.currentFrameEpoch,
        previewFrameEpoch: state.previewFrameEpoch,
        bypassPreviewSeek: false,
        preferPlayerForStyledTextScrub: true,
        nowMs: performance.now(),
        backwardScrubState,
      })
      backwardScrubState.lastSeekAtMs = previewPlan.backwardScrubState.lastSeekAtMs
      backwardScrubState.lastSeekFrame = previewPlan.backwardScrubState.lastSeekFrame
      if (previewPlan.command.type === 'seek') seekPlayer(previewPlan.command.targetFrame)
    })
  })

  // Player → store: the playhead advances while playing.
  function handleFrameChange(frame: number) {
    const nextFrame = Math.round(frame)
    if (ignorePlayerUpdates) return
    const playback = usePlaybackStore.getState()
    if (!playback.isPlaying || playback.currentFrame === nextFrame) return
    lastSyncedFrame = nextFrame
    playback.setCurrentFrame(nextFrame)
  }

  // The player stops by itself at the end of the composition.
  function handlePlayStateChange(playing: boolean) {
    if (!playing && usePlaybackStore.getState().isPlaying) {
      usePlaybackStore.getState().pause()
    }
  }

  onDestroy(() => {
    disposed = true
  })
</script>

<div class="relative h-full w-full overflow-hidden bg-black" data-embedded-preview>
  <HeadlessPlayer
    bind:ref={player}
    durationInFrames={preview.totalFrames}
    fps={preview.inputProps.fps}
    initialFrame={untrack(() => usePlaybackStore.getState().currentFrame)}
    width={preview.renderSize.width}
    height={preview.renderSize.height}
    autoPlay={false}
    loop={false}
    style="width: 100%; height: 100%"
    onFrameChange={handleFrameChange}
    onPlayStateChange={handlePlayStateChange}
  >
    <MainComposition {...preview.inputProps} liveItemTransformSource={useItemsStore} />
  </HeadlessPlayer>
</div>

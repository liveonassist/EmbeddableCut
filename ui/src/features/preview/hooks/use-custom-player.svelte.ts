// SPDX-License-Identifier: MIT

import { untrack } from 'svelte'
import { select } from '$lib/store.svelte'
import { usePlaybackStore } from '@/shared/state/playback'
import { useTimelineSettingsStore } from '@/features/preview/deps/timeline-store'
import { resolvePreviewTransitionFromPlaybackStates } from '@/features/preview/utils/preview-state-coordinator'
import {
  type PlayerCommand,
  planCurrentFrameSyncCommand,
  planPlaybackStateCommand,
  planPreviewFrameSyncCommand,
} from '@/features/preview/utils/player-command-planner'
import { createLogger } from '@/shared/logging/logger'

const logger = createLogger('useCustomPlayer')

const BACKGROUND_PREVIEW_WARM_SEEK_THROTTLE_MS = 50

export function useCustomPlayer(
  getPlayerRef: () => {
    current: {
      seekTo: (frame: number) => void
      play: () => void
      pause: () => void
      getCurrentFrame: () => number
      isPlaying: () => boolean
      setPlaybackRate: (rate: number) => void
    } | null
  },
  getBypassPreviewSeekRef: () => { current: boolean } | undefined = () => undefined,
  getPreferPlayerForStyledTextScrubRef: () => { current: boolean } | undefined = () => undefined,
  getIsGizmoInteractingRef: () => { current: boolean } | undefined = () => undefined,
  getOnPlayerSeek: () => ((targetFrame: number) => void) | undefined = () => undefined,
) {
  const playerRef = $derived(getPlayerRef())
  const bypassPreviewSeekRef = $derived(getBypassPreviewSeekRef())
  const preferPlayerForStyledTextScrubRef = $derived(getPreferPlayerForStyledTextScrubRef())
  const isGizmoInteractingRef = $derived(getIsGizmoInteractingRef())
  const onPlayerSeek = $derived(getOnPlayerSeek())
  const isPlaying = select(usePlaybackStore, (s) => s.isPlaying)
  const playbackRate = select(usePlaybackStore, (s) => s.playbackRate)

  let playerReady = $state.raw(false)
  const setPlayerReady = (
    next: typeof playerReady | ((prev: typeof playerReady) => typeof playerReady),
  ) => {
    playerReady =
      typeof next === 'function'
        ? (next as (prev: typeof playerReady) => typeof playerReady)(untrack(() => playerReady))
        : next
  }
  const lastSyncedFrameRef: { current: number } = { current: 0 }
  const lastSeekTargetRef: { current: number | null } = { current: null }
  const lastBackwardScrubSeekAtRef = { current: 0 }
  const lastBackwardScrubSeekFrameRef: { current: number | null } = { current: null }
  const ignorePlayerUpdatesRef: { current: boolean } = { current: false }
  const wasPlayingRef = { current: isPlaying.current }
  const pendingPreviewWarmSeekTargetRef: { current: number | null } = { current: null }
  const previewWarmSeekTimerRef: { current: ReturnType<typeof setTimeout> | null } = {
    current: null,
  }
  const lastPreviewWarmSeekAtRef: { current: number } = { current: 0 }

  const getPlayerFrame = () => {
    const frame = playerRef.current?.getCurrentFrame()
    return Number.isFinite(frame) ? Math.round(frame!) : null
  }

  const seekPlayerToFrame = (
    targetFrame: number,
    holdIgnoreUntilReleased = false,
    forceSameTargetReplay = false,
  ) => {
    if (!playerRef.current) return
    const playerFrame = getPlayerFrame()
    if (playerFrame !== null && playerFrame === targetFrame) {
      lastSyncedFrameRef.current = targetFrame
      lastSeekTargetRef.current = targetFrame
      return
    }
    if (
      !forceSameTargetReplay &&
      lastSeekTargetRef.current === targetFrame &&
      ignorePlayerUpdatesRef.current
    ) {
      return
    }

    ignorePlayerUpdatesRef.current = true
    try {
      onPlayerSeek?.(targetFrame)
      playerRef.current.seekTo(targetFrame)
      lastSyncedFrameRef.current = targetFrame
      lastSeekTargetRef.current = targetFrame
    } catch (error) {
      logger.error('Failed to seek Player:', error)
    }

    if (!holdIgnoreUntilReleased) {
      requestAnimationFrame(() => {
        ignorePlayerUpdatesRef.current = false
      })
    }
  }

  const clearScheduledPreviewWarmSeek = () => {
    pendingPreviewWarmSeekTargetRef.current = null
    if (previewWarmSeekTimerRef.current !== null) {
      clearTimeout(previewWarmSeekTimerRef.current)
      previewWarmSeekTimerRef.current = null
    }
  }

  const flushPreviewWarmSeek = () => {
    const targetFrame = pendingPreviewWarmSeekTargetRef.current
    clearScheduledPreviewWarmSeek()
    if (targetFrame === null) {
      return
    }
    lastPreviewWarmSeekAtRef.current = performance.now()
    seekPlayerToFrame(targetFrame)
  }

  const schedulePreviewWarmSeek = (targetFrame: number) => {
    pendingPreviewWarmSeekTargetRef.current = targetFrame

    const nowMs = performance.now()
    const elapsedMs = nowMs - lastPreviewWarmSeekAtRef.current
    const delayMs = Math.max(0, BACKGROUND_PREVIEW_WARM_SEEK_THROTTLE_MS - elapsedMs)

    if (delayMs === 0 && previewWarmSeekTimerRef.current === null) {
      flushPreviewWarmSeek()
      return
    }

    if (previewWarmSeekTimerRef.current !== null) {
      return
    }

    previewWarmSeekTimerRef.current = setTimeout(() => {
      previewWarmSeekTimerRef.current = null
      flushPreviewWarmSeek()
    }, delayMs)
  }

  const executePlayerCommand = (command: PlayerCommand) => {
    if (!playerRef.current) return

    switch (command.type) {
      case 'noop':
        return
      case 'pause':
        playerRef.current.pause()
        return
      case 'play':
        playerRef.current.play()
        return
      case 'seek':
        seekPlayerToFrame(command.targetFrame)
        return
      case 'seek_and_play':
        seekPlayerToFrame(command.targetFrame, true, true)
        if (!usePlaybackStore.getState().isPlaying) {
          ignorePlayerUpdatesRef.current = false
          return
        }
        playerRef.current.play()
        ignorePlayerUpdatesRef.current = false
        return
      default:
        return
    }
  }

  // Pause playback when this hook mounts while already playing. That only
  // happens on a mid-playback remount of the preview — e.g. switching to/from
  // the Color workspace swaps VideoPreview<->ColorVideoPreview, remounting the
  // Player. The fresh player starts paused at the preserved frame (via the
  // Player's initialFrame), so keeping the store's `isPlaying` true would show
  // a "playing" transport that never advances. Pausing keeps the transport
  // consistent and the playhead where it was. (On the initial editor load the
  // store is never playing, so this is a no-op.)
  $effect(() =>
    untrack(() => {
      const playback = usePlaybackStore.getState()
      if (playback.isPlaying) {
        playback.pause()
      }
      // Mount-only: intentionally no deps.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }),
  )

  // Detect when Player becomes ready
  $effect(() => {
    if (playerRef.current && !playerReady) {
      setPlayerReady(true)
    }
    const checkReady = setInterval(() => {
      if (playerRef.current && !playerReady) {
        setPlayerReady(true)
        clearInterval(checkReady)
      }
    }, 50)

    const timeout = setTimeout(() => clearInterval(checkReady), 1000)

    return () => {
      clearInterval(checkReady)
      clearTimeout(timeout)
    }
  })

  // Timeline → Player: Sync play/pause state
  // The store rate is a transient transport multiplier. Wiring it here changes
  // the global Clock without mutating any authored item speed.
  $effect(() => {
    if (!playerReady) return
    playerRef.current?.setPlaybackRate(playbackRate.current)
  })

  $effect(() => {
    if (!playerRef.current) return

    const wasPlaying = wasPlayingRef.current
    wasPlayingRef.current = isPlaying.current
    const { currentFrame, setPreviewFrame } = usePlaybackStore.getState()
    const playbackPlan = planPlaybackStateCommand({
      wasPlaying,
      isPlaying: isPlaying.current,
      currentFrame,
      playerFrame: getPlayerFrame(),
    })

    try {
      if (isPlaying.current && !wasPlaying) {
        flushPreviewWarmSeek()
      }
      if (playbackPlan.clearPreviewFrame) {
        setPreviewFrame(null)
      }
      executePlayerCommand(playbackPlan.command)
    } catch (error) {
      logger.error('Failed to control playback:', error)
    }
  })

  // Wait for timeline to finish loading before syncing frame position.
  // Without this, the Player would seek to frame 0 (the default) before
  // loadTimeline() restores the saved currentFrame from IndexedDB.
  const isTimelineLoading = select(useTimelineSettingsStore, (s) => s.isTimelineLoading)

  // Timeline → Player: Sync frame position
  $effect(() => {
    if (!playerReady || !playerRef.current || isTimelineLoading.current) return

    const initialFrame = usePlaybackStore.getState().currentFrame
    const playerFrame = getPlayerFrame()
    lastSyncedFrameRef.current = initialFrame
    lastSeekTargetRef.current = initialFrame
    if (playerFrame !== initialFrame) {
      onPlayerSeek?.(initialFrame)
    }
    playerRef.current.seekTo(initialFrame)

    const unsubscribe = usePlaybackStore.subscribe((state, prevState) => {
      if (!playerRef.current) return

      const transition = resolvePreviewTransitionFromPlaybackStates({
        prev: prevState,
        next: state,
        isGizmoInteracting: isGizmoInteractingRef?.current === true,
      })
      const plan = planCurrentFrameSyncCommand({
        transition,
        currentFrame: state.currentFrame,
        lastSyncedFrame: lastSyncedFrameRef.current,
        playerFrame: getPlayerFrame(),
      })

      if (plan.acknowledgedFrame !== null) {
        lastSyncedFrameRef.current = plan.acknowledgedFrame
      }
      if (plan.command.type === 'seek') {
        clearScheduledPreviewWarmSeek()
        seekPlayerToFrame(plan.command.targetFrame)
      }
    })

    return unsubscribe
  })

  // Preview frame seeking: seek to hovered position on timeline
  $effect(() => {
    if (!playerReady || !playerRef.current) return

    return usePlaybackStore.subscribe((state, prev) => {
      if (!playerRef.current) return
      if (prev.previewFrame !== null && state.previewFrame === null) {
        flushPreviewWarmSeek()
      }
      const transition = resolvePreviewTransitionFromPlaybackStates({
        prev,
        next: state,
        isGizmoInteracting: isGizmoInteractingRef?.current === true,
      })
      const plan = planPreviewFrameSyncCommand({
        transition,
        currentFrame: state.currentFrame,
        previewFrame: state.previewFrame,
        currentFrameEpoch: state.currentFrameEpoch,
        previewFrameEpoch: state.previewFrameEpoch,
        bypassPreviewSeek: bypassPreviewSeekRef?.current === true,
        preferPlayerForStyledTextScrub: preferPlayerForStyledTextScrubRef?.current === true,
        nowMs: performance.now(),
        backwardScrubState: {
          lastSeekAtMs: lastBackwardScrubSeekAtRef.current,
          lastSeekFrame: lastBackwardScrubSeekFrameRef.current,
        },
      })

      lastBackwardScrubSeekAtRef.current = plan.backwardScrubState.lastSeekAtMs
      lastBackwardScrubSeekFrameRef.current = plan.backwardScrubState.lastSeekFrame

      if (plan.command.type === 'seek') {
        if (plan.useBackgroundWarmSeek) {
          schedulePreviewWarmSeek(plan.command.targetFrame)
          return
        }
        clearScheduledPreviewWarmSeek()
        seekPlayerToFrame(plan.command.targetFrame)
        return
      }

      if (!plan.useBackgroundWarmSeek) {
        clearScheduledPreviewWarmSeek()
      }
    })
  })

  $effect(() => {
    return () => {
      clearScheduledPreviewWarmSeek()
    }
  })

  return {
    ignorePlayerUpdatesRef,
  }
}

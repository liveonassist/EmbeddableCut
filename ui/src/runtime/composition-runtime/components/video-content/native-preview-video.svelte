<!-- SPDX-License-Identifier: MIT -->
<!--
  Native HTML5 video component for preview mode using VideoSourcePool.
  Uses pooled video elements instead of creating new ones per clip.
  Split clips from the same source share video elements for efficiency.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import {
    useClock,
    useClockPlaybackRate,
    useSequenceContext,
    useVideoSourcePool,
    isVideoPoolAbortError,
  } from '@/runtime/composition-runtime/deps/player'
  import { usePlaybackStore } from '@/runtime/composition-runtime/deps/stores'
  import { useGizmoStore } from '@/runtime/composition-runtime/deps/stores'
  import type { ResolvedAudioEqSettings } from '@/types/audio'
  import { useVideoConfig, useIsPlaying } from '../../hooks/use-player-compat.svelte'
  import { getVideoTargetTimeSeconds } from '@/runtime/composition-runtime/utils/video-timing'
  import {
    getVideoSyncTargetContext,
    isVideoSyncTargetDiscontinuity,
    planLayoutVideoSync,
    planPausedVideoFrameSync,
    planPlayingVideoDriftCorrection,
    planPlayingVideoInitialSync,
    planPremountedVideoSync,
    planVideoFrameCallbackCorrection,
    shouldIssueCoalescedReverseVideoSeek,
    shouldReactOwnPlaybackRate,
    shouldUpdateVideoPlaybackRate,
  } from '@/runtime/composition-runtime/utils/video-sync-plan'
  import {
    registerDomVideoElement,
    unregisterDomVideoElement,
  } from '@/runtime/composition-runtime/utils/dom-video-element-registry'
  import { subscribeToWarmupActivity } from '@/runtime/composition-runtime/utils/activity-rewarm'
  import {
    applyVideoElementAudioState,
    connectedVideoElements,
    videoAudioContexts,
    ensureAudioContextResumed,
  } from '../video-audio-context.svelte'
  import { getBrowserMediaPlaybackRate } from '@/shared/state/playback/shuttle'
  import { POOL_RELEASE_STICKY_MS, supportsRVFC, videoLog } from './video-content-shared'

  let props: {
    poolClipId: string
    itemId: string
    src: string
    safeTrimBefore: number
    sequenceFrameOffset?: number
    sourceFps: number
    playbackRate: number
    isReversed?: boolean
    reverseSourceEnd?: number
    audioVolume: number
    audioEqStages: ReadonlyArray<ResolvedAudioEqSettings>
    onError: (error: Error) => void
    fitMode?: 'contain' | 'fill'
    forceCssComposite?: boolean
    sharedTransitionSync?: boolean
  } = $props()

  // Effects below re-run when these values change, as React's dependency
  // lists compared them, not whenever a parent re-creates the prop objects.
  const poolClipId = $derived(props.poolClipId)
  const itemId = $derived(props.itemId)
  const src = $derived(props.src)
  const safeTrimBefore = $derived(props.safeTrimBefore)
  const sequenceFrameOffset = $derived(props.sequenceFrameOffset ?? 0)
  const sourceFps = $derived(props.sourceFps)
  const playbackRate = $derived(props.playbackRate)
  const isReversed = $derived(props.isReversed ?? false)
  const reverseSourceEnd = $derived(props.reverseSourceEnd)
  const audioVolume = $derived(props.audioVolume)
  const audioEqStages = $derived(props.audioEqStages)
  const fitMode = $derived(props.fitMode ?? 'contain')
  const forceCssComposite = $derived(props.forceCssComposite ?? false)
  const sharedTransitionSync = $derived(props.sharedTransitionSync ?? false)

  // Get local frame from Sequence context (not global frame from Clock)
  // The Sequence provides localFrame which is 0-based within this sequence
  const sequenceContext = useSequenceContext()
  const frame = $derived(sequenceContext?.localFrame ?? 0)
  const sequenceFrom = $derived(sequenceContext?.from ?? 0)
  const videoConfig = useVideoConfig()
  const fps = $derived(videoConfig.fps)
  const pool = useVideoSourcePool()
  let containerElement = $state<HTMLDivElement | null>(null)
  const elementRef: { current: HTMLVideoElement | null } = { current: null }
  const preWarmTimerRef: { current: number | null } = { current: null }
  const preWarmInFlightRef = { current: false }
  const itemIdRef = { current: untrack(() => itemId) }

  // Brief muted play/pause that fills the decode buffer and re-acquires the
  // browser's media pipeline, so a subsequent play() starts in ~2 frames
  // instead of stalling 200-300ms on pipeline re-init. Debounced so repeated
  // warm-up signals collapse into one play/pause cycle.
  const schedulePreWarm = () => {
    // play() itself can emit canplay. Ignore that re-entrant warm request or
    // it can supersede the cycle that owns the pause and position reset.
    if (preWarmInFlightRef.current) return
    if (preWarmTimerRef.current !== null) {
      clearTimeout(preWarmTimerRef.current)
    }
    preWarmTimerRef.current = window.setTimeout(() => {
      preWarmTimerRef.current = null
      const v = elementRef.current
      if (v && v.paused && v.readyState >= 2 && !usePlaybackStore.getState().isPlaying) {
        const style = window.getComputedStyle(v)
        const isVisiblyPresented =
          v.isConnected &&
          v.getClientRects().length > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        // A play/pause warm can present decoded-ahead frames even when its
        // source time is restored afterward. Never warm the visible paused
        // program-monitor element; hidden pool/transition lanes can still use
        // the latency optimization without changing what the user sees.
        if (isVisiblyPresented) return

        const wasMuted = v.muted
        const warmStartTime = v.currentTime
        const warmStartItemId = itemIdRef.current
        const warmStartPlayback = usePlaybackStore.getState()
        const warmStartFrame = warmStartPlayback.currentFrame
        const warmStartPreviewFrame = warmStartPlayback.previewFrame
        v.muted = true
        preWarmInFlightRef.current = true
        v.play()
          .catch(() => {
            // Best-effort decoder warm-up.
          })
          .finally(() => {
            const playback = usePlaybackStore.getState()
            if (!playback.isPlaying) {
              v.pause()
              // Warm-up is allowed to decode ahead, but a paused preview must
              // still show its requested source time. Avoid restoring a stale
              // position if the playhead or mounted item changed meanwhile.
              if (
                elementRef.current === v &&
                itemIdRef.current === warmStartItemId &&
                playback.currentFrame === warmStartFrame &&
                playback.previewFrame === warmStartPreviewFrame &&
                Math.abs(v.currentTime - warmStartTime) > 0.001
              ) {
                try {
                  v.currentTime = warmStartTime
                } catch {
                  // The pooled element may be settling or have been released.
                }
              }
            }
            v.muted = wasMuted
            preWarmInFlightRef.current = false
          })
      }
    }, 50)
  }
  const audioVolumeRef = { current: untrack(() => audioVolume) }
  const audioEqStagesRef = { current: untrack(() => audioEqStages) }
  const onErrorRef = { current: untrack(() => props.onError) }
  const lastSyncTimeRef = { current: Date.now() }
  const needsInitialSyncRef = { current: true }
  const lastFrameRef = { current: -1 }
  const reverseSeekInFlightRef = { current: false }
  const latestReverseSeekTargetRef: { current: number | null } = { current: null }
  const pausedSeekInFlightRef = { current: false }
  const latestPausedSeekTargetRef: { current: number | null } = { current: null }
  const registeredElementRef: { current: HTMLVideoElement | null } = { current: null }
  const registeredItemIdRef: { current: string | null } = { current: null }
  const forceCssCompositeRef = { current: untrack(() => forceCssComposite) }

  // Clock instance for imperative access in rVFC callback
  const clock = useClock()
  const clockPlaybackRate = useClockPlaybackRate()
  const transportPlaybackRate = $derived(clockPlaybackRate.current)
  const isReverseShuttle = $derived(transportPlaybackRate < 0)
  const mediaPlaybackRate = $derived(
    getBrowserMediaPlaybackRate(playbackRate, transportPlaybackRate),
  )
  const sequenceFromRef = { current: 0 }
  // Stable refs for rVFC callback (avoids stale closures)
  const safeTrimBeforeRef = { current: untrack(() => safeTrimBefore) }
  const sourceFpsRef = { current: untrack(() => sourceFps) }
  const playbackRateRef = { current: untrack(() => playbackRate) }
  const transportPlaybackRateRef = { current: untrack(() => transportPlaybackRate) }
  const mediaPlaybackRateRef = { current: untrack(() => mediaPlaybackRate) }
  const isReversedRef = { current: untrack(() => isReversed) }
  const reverseSourceEndRef = { current: untrack(() => reverseSourceEnd) }
  const fpsRef = { current: untrack(() => fps) }
  const sequenceFrameOffsetRef = { current: untrack(() => sequenceFrameOffset) }

  // Get playing state from our clock
  const isPlayingState = useIsPlaying()
  const isPlaying = $derived(isPlayingState.current)

  // Calculate target time in the source video
  // safeTrimBefore is in SOURCE frames (where playback starts in the source)
  // frame is in TIMELINE frames (current position within the Sequence)
  // For seeking, convert source start to seconds using source FPS.
  const targetTime = $derived(
    getVideoTargetTimeSeconds(
      safeTrimBefore,
      sourceFps,
      frame,
      playbackRate,
      fps,
      sequenceFrameOffset,
      isReversed,
      reverseSourceEnd,
    ),
  )
  const frameRef = { current: untrack(() => frame) }

  // React assigned these refs during render, ahead of every effect.
  $effect.pre(() => {
    itemIdRef.current = itemId
    audioVolumeRef.current = audioVolume
    audioEqStagesRef.current = audioEqStages
    onErrorRef.current = props.onError
    forceCssCompositeRef.current = forceCssComposite
    safeTrimBeforeRef.current = safeTrimBefore
    sourceFpsRef.current = sourceFps
    playbackRateRef.current = playbackRate
    transportPlaybackRateRef.current = transportPlaybackRate
    mediaPlaybackRateRef.current = mediaPlaybackRate
    isReversedRef.current = isReversed
    reverseSourceEndRef.current = reverseSourceEnd
    fpsRef.current = fps
    sequenceFrameOffsetRef.current = sequenceFrameOffset
    frameRef.current = frame
  })

  const shortId = $derived(poolClipId?.slice(0, 8) ?? 'no-id')

  // Segment boundary resync:
  // With stable pool identities, split clips no longer remount/reacquire.
  // When the active segment switches (itemId changes), source mapping can jump
  // discontinuously (especially around transition overlaps), so force an
  // immediate sync on the next playback tick.
  $effect(() => {
    void itemId
    needsInitialSyncRef.current = true
    lastSyncTimeRef.current = 0
  })

  const syncRegisteredVideoElement = (nextItemId: string, nextElement: HTMLVideoElement | null) => {
    const prevElement = registeredElementRef.current
    const prevItemId = registeredItemIdRef.current

    if (prevElement && prevItemId && (prevElement !== nextElement || prevItemId !== nextItemId)) {
      unregisterDomVideoElement(prevItemId, prevElement)
    }

    if (nextElement && (prevElement !== nextElement || prevItemId !== nextItemId)) {
      registerDomVideoElement(nextItemId, nextElement)
    }

    registeredElementRef.current = nextElement
    registeredItemIdRef.current = nextElement ? nextItemId : null
  }

  const clearRegisteredVideoElement = () => {
    const prevElement = registeredElementRef.current
    const prevItemId = registeredItemIdRef.current
    if (prevElement && prevItemId) {
      unregisterDomVideoElement(prevItemId, prevElement)
    }
    registeredElementRef.current = null
    registeredItemIdRef.current = null
  }

  $effect.pre(() => {
    syncRegisteredVideoElement(itemId, elementRef.current)
  })

  // Acquire element from pool on mount
  $effect(() => {
    void fitMode
    // The cleanup releases the lane this run acquired, as React's closure did.
    const releaseClipId = poolClipId
    const releaseShortId = shortId
    // Read once per lane/source, as React read its container ref.
    const container = untrack(() => containerElement)
    // Guard: poolClipId and src are required
    if (!poolClipId || !src) {
      videoLog.error('Missing poolClipId or src')
      return
    }

    let cancelled = false

    // Reset sync state for the new clip. The component doesn't unmount when
    // crossing split boundaries (it is reused with new props), so refs
    // retain stale values from the previous clip. Without this reset, the
    // sync effect skips the initial seek for the new clip because it thinks
    // initial sync already happened.
    needsInitialSyncRef.current = true
    lastSyncTimeRef.current = 0

    videoLog.debug(`[${shortId}] acquiring element for:`, src)

    // Ensure source is preloaded
    pool.preloadSource(src).catch((error) => {
      if (cancelled || isVideoPoolAbortError(error)) {
        return
      }
      videoLog.warn(`Failed to preload ${src}:`, error)
    })

    // Acquire element for this clip
    const element = pool.acquireForClip(poolClipId, src)
    if (!element) {
      videoLog.error(`Failed to acquire element for ${poolClipId}`)
      return
    }

    videoLog.debug(`[${shortId}] acquired:`, element.readyState)

    // CRITICAL: Unmute video element immediately after acquisition
    // Pool creates elements muted, and we need audio to work.
    // Item-id-only handoffs reuse the same acquired element and are handled
    // by registration/sync effects below, so this only runs when the actual
    // pool lane/source changes.
    element.muted = false

    // Also resume AudioContext if this element was previously connected
    // (e.g., when crossing split boundary and reusing the same video element)
    if (connectedVideoElements.has(element)) {
      const audioContext = videoAudioContexts.get(element)
      if (audioContext?.state === 'suspended') {
        audioContext.resume()
      }
    }

    // Check if this is a split boundary crossing during playback.
    // The pool may return the same element that was just released by cleanup.
    // If the element is already near the correct position, keep it playing
    // to avoid a decode restart stutter.
    const initialSafeTrimBefore = safeTrimBeforeRef.current
    const initialSourceFps = sourceFpsRef.current
    const initialFrame = frameRef.current
    const initialPlaybackRate = playbackRateRef.current
    const initialMediaPlaybackRate = mediaPlaybackRateRef.current
    const initialIsReversed = isReversedRef.current
    const initialRequiresVisualSeek = initialIsReversed || transportPlaybackRateRef.current < 0
    const initialReverseSourceEnd = reverseSourceEndRef.current
    const initialFps = fpsRef.current
    const initialSequenceFrameOffset = sequenceFrameOffsetRef.current
    const initialTargetTime = getVideoTargetTimeSeconds(
      initialSafeTrimBefore,
      initialSourceFps,
      initialFrame,
      initialPlaybackRate,
      initialFps,
      initialSequenceFrameOffset,
      initialIsReversed,
      initialReverseSourceEnd,
    )
    const clampedInitial = Math.min(initialTargetTime, (element.duration || Infinity) - 0.1)
    const currentlyPlaying = usePlaybackStore.getState().isPlaying
    const isNearTarget = Math.abs(element.currentTime - clampedInitial) < 0.2
    const isContinuousPlayback =
      !initialRequiresVisualSeek && currentlyPlaying && isNearTarget && element.readyState >= 2

    elementRef.current = element
    syncRegisteredVideoElement(itemIdRef.current, element)
    applyVideoElementAudioState(element, audioVolumeRef.current, audioEqStagesRef.current)

    if (initialRequiresVisualSeek) {
      element.pause()
      element.playbackRate = 1
      element.currentTime = clampedInitial
      needsInitialSyncRef.current = false
    } else if (isContinuousPlayback) {
      // Split boundary during playback: element was just paused by cleanup
      // but is at the right position. Resume immediately to minimize the
      // decode pipeline interruption (pause→play in same synchronous batch).
      element.playbackRate = initialMediaPlaybackRate
      element.play().catch(() => {})
      needsInitialSyncRef.current = false
    } else if (currentlyPlaying) {
      // Playback is active but element isn’t at position (transition mount,
      // shadow mount, or resume near a boundary). Seek and play immediately
      // instead of pausing and waiting for the sync effect next frame.
      // This eliminates ~16-50ms of effect scheduling + readyState gate delay.
      element.playbackRate = initialMediaPlaybackRate
      element.currentTime = clampedInitial
      if (element.readyState >= 2) {
        element.play().catch(() => {})
      }
      needsInitialSyncRef.current = false
    } else {
      // Not playing (scrubbing, paused) — pause and seek
      element.pause()
    }

    // Set up event listeners
    const syncCanPlayTarget = () => {
      const liveTargetTime = getVideoTargetTimeSeconds(
        safeTrimBeforeRef.current,
        sourceFpsRef.current,
        frameRef.current,
        playbackRateRef.current,
        fpsRef.current,
        sequenceFrameOffsetRef.current,
        isReversedRef.current,
        reverseSourceEndRef.current,
      )
      const clampedLiveTargetTime = Math.min(
        Math.max(0, liveTargetTime),
        (element.duration || Infinity) - 0.05,
      )
      if (Math.abs(element.currentTime - clampedLiveTargetTime) <= 0.016) return
      try {
        element.currentTime = clampedLiveTargetTime
      } catch {
        // Seek failed - element may still be stabilizing.
      }
    }
    const applyCanPlayTransport = () => {
      if (isReversedRef.current || transportPlaybackRateRef.current < 0) {
        element.pause()
        element.playbackRate = 1
        return
      }
      element.playbackRate = mediaPlaybackRateRef.current
      element.play().catch(() => {})
    }
    const handleCanPlay = () => {
      videoLog.debug(`[${shortId}] canplay:`, element.readyState)
      if (usePlaybackStore.getState().isPlaying && element.paused && element.readyState >= 2) {
        syncCanPlayTarget()
        applyCanPlayTransport()
        needsInitialSyncRef.current = false
      } else if (!usePlaybackStore.getState().isPlaying) {
        // The first warm can run before HAVE_CURRENT_DATA and return. Re-arm
        // as soon as the paused current source becomes decodable.
        schedulePreWarm()
      }
    }
    const handleSeeked = () => {
      reverseSeekInFlightRef.current = false
      pausedSeekInFlightRef.current = false
      const latestPausedTarget = latestPausedSeekTargetRef.current
      if (
        !usePlaybackStore.getState().isPlaying &&
        latestPausedTarget !== null &&
        Math.abs(element.currentTime - latestPausedTarget) > 0.001
      ) {
        try {
          element.currentTime = latestPausedTarget
          pausedSeekInFlightRef.current = true
        } catch {
          // The latest skim target remains queued for the next sync pass.
        }
      }
      videoLog.debug(`[${shortId}] seeked:`, element.currentTime)
    }
    const handleError = () => {
      const error = new Error(`Video error: ${element.error?.message || 'Unknown'}`)
      onErrorRef.current(error)
    }
    // Prevent black frames when video reaches its natural end
    // Seek back slightly to show the last frame
    const handleEnded = () => {
      videoLog.debug(`[${shortId}] ended, seeking to last frame`)
      if (element.duration && element.duration > 0.1) {
        element.currentTime = element.duration - 0.05
      }
    }

    element.addEventListener('canplay', handleCanPlay)
    element.addEventListener('seeked', handleSeeked)
    element.addEventListener('error', handleError)
    element.addEventListener('ended', handleEnded)

    // Mount element into container
    if (container && element.parentElement !== container) {
      element.style.width = '100%'
      element.style.height = '100%'
      element.style.objectFit = fitMode
      element.style.display = 'block'
      element.style.position = 'absolute'
      element.style.top = '0'
      element.style.left = '0'
      if (forceCssCompositeRef.current) {
        element.style.transform = 'translateZ(0)'
        element.style.backfaceVisibility = 'hidden'
        element.style.willChange = 'transform, opacity'
      } else {
        element.style.transform = ''
        element.style.backfaceVisibility = ''
        element.style.willChange = ''
      }
      element.id = `pooled-video-${poolClipId}`
      container.appendChild(element)

      videoLog.debug(`[${shortId}] mounted to container`)
    }

    // Seek to initial position (skip for continuous playback - already at position)
    if (!isContinuousPlayback) {
      videoLog.debug(
        `[${shortId}] initial seek to:`,
        clampedInitial.toFixed(3),
        'safeTrimBefore:',
        initialSafeTrimBefore,
        'frame:',
        initialFrame,
        'playbackRate:',
        initialPlaybackRate,
        'fps:',
        initialFps,
        'videoDuration:',
        element.duration?.toFixed(3),
        'seekPastEnd:',
        initialTargetTime > element.duration,
      )
      element.currentTime = clampedInitial
    } else {
      videoLog.debug(
        `[${shortId}] continuous playback, skipping seek (drift: ${(element.currentTime - clampedInitial).toFixed(3)}s)`,
      )
    }

    // Warm the paused current source so the next Play keeps its decoder hot.
    // Only when NOT playing — during playback, the sync effect handles play()
    // and this timeout’s play→pause sequence would race with it.
    if (!currentlyPlaying) {
      schedulePreWarm()
    }

    // Stall watchdog: if the element is stuck at readyState 0 for too long
    // (e.g., slow OPFS read, browser decoder init, broken file), retry load.
    // For stale blob URLs after inactivity, the visibilitychange handler in
    // video-preview.tsx refreshes all proxy/source URLs and triggers a full
    // re-render with fresh src props, which remounts this component.
    let stallTimerId: number | null = null
    if (element.readyState === 0) {
      stallTimerId = window.setTimeout(() => {
        stallTimerId = null
        if (elementRef.current === element && element.readyState === 0) {
          videoLog.warn(`Video stalled at readyState 0 for ${shortId}, retrying load`)
          try {
            element.load()
          } catch {
            // load() can throw if element is in a bad state
          }
        }
      }, 3000)
    }

    return () => {
      cancelled = true
      element.removeEventListener('canplay', handleCanPlay)
      element.removeEventListener('seeked', handleSeeked)
      element.removeEventListener('error', handleError)
      element.removeEventListener('ended', handleEnded)

      // Pause and remove from DOM
      element.pause()
      if (preWarmTimerRef.current !== null) {
        clearTimeout(preWarmTimerRef.current)
        preWarmTimerRef.current = null
      }
      preWarmInFlightRef.current = false
      reverseSeekInFlightRef.current = false
      latestReverseSeekTargetRef.current = null
      pausedSeekInFlightRef.current = false
      latestPausedSeekTargetRef.current = null
      if (stallTimerId !== null) {
        clearTimeout(stallTimerId)
        stallTimerId = null
      }
      if (element.parentElement) {
        element.parentElement.removeChild(element)
      }

      // Release back to pool
      clearRegisteredVideoElement()
      pool.releaseClip(releaseClipId, { delayMs: POOL_RELEASE_STICKY_MS })
      elementRef.current = null

      videoLog.debug(`[${releaseShortId}] released`)
    }
    // Note: frame, fps, targetTime intentionally NOT read here - we only want to acquire once per lane/source
    // Ongoing seeking is handled by the separate sync effect, and itemId-only
    // handoffs are handled by the registration + sync refs without tearing down
    // the element across split-boundary transitions.
  })

  $effect(() => {
    const composite = forceCssComposite
    const element = elementRef.current
    if (!element) return
    if (composite) {
      element.style.transform = 'translateZ(0)'
      element.style.backfaceVisibility = 'hidden'
      element.style.willChange = 'transform, opacity'
      return
    }
    element.style.transform = ''
    element.style.backfaceVisibility = ''
    element.style.willChange = ''
  })

  // Sync video playback with timeline
  // Layout pass handles immediate seeks before paint to avoid one-frame stale
  // content during segment/transition boundary handoffs.
  $effect.pre(() => {
    void [
      frame,
      isPlaying,
      isReversed,
      mediaPlaybackRate,
      playbackRate,
      reverseSourceEnd,
      safeTrimBefore,
      sharedTransitionSync,
      sourceFps,
      targetTime,
      sequenceFrameOffset,
    ]
    const video = elementRef.current
    if (!video) return

    if (
      shouldReactOwnPlaybackRate({
        isPlaying,
        supportsRequestVideoFrameCallback: supportsRVFC,
        sharedTransitionSync,
      })
    ) {
      video.playbackRate = mediaPlaybackRate
    }

    const syncContext = getVideoSyncTargetContext({
      frame,
      sequenceFrameOffset,
      safeTrimBefore,
      sourceFps,
      targetTime,
      readyState: video.readyState,
      videoDuration: video.duration || Infinity,
      currentTime: video.currentTime,
    })
    const layoutPlan = planLayoutVideoSync({
      isPremounted: syncContext.isPremounted,
      isTransitionHeld: video.dataset.transitionHold === '1',
      isTransitionPrearmed: video.dataset.transitionPrearm === '1',
      canSeek: syncContext.canSeek,
      currentTime: video.currentTime,
      targetTime: syncContext.clampedTargetTime,
      isPlaying,
      needsInitialSync: needsInitialSyncRef.current,
    })

    if (layoutPlan.shouldPause && !video.paused) {
      video.pause()
    }

    const applyLayoutSeek = (seekTo: number) => {
      try {
        if (!isPlaying) {
          latestPausedSeekTargetRef.current = seekTo
          if (
            shouldIssueCoalescedReverseVideoSeek({
              seeking: video.seeking,
              seekInFlight: pausedSeekInFlightRef.current,
              currentTime: video.currentTime,
              targetTime: seekTo,
            })
          ) {
            video.currentTime = seekTo
            pausedSeekInFlightRef.current = true
          }
        } else {
          video.currentTime = seekTo
        }
        if (video.currentTime === seekTo || isPlaying) {
          lastSyncTimeRef.current = Date.now()
          if (layoutPlan.shouldMarkInitialSyncComplete) {
            needsInitialSyncRef.current = false
          }
        }
      } catch {
        // Seek failed - element may still be initializing
      }
    }
    if (layoutPlan.seekTo !== null) applyLayoutSeek(layoutPlan.seekTo)
  })

  // Runtime playback control + drift correction
  $effect(() => {
    void [
      frame,
      fps,
      isPlaying,
      isReversed,
      isReverseShuttle,
      mediaPlaybackRate,
      playbackRate,
      reverseSourceEnd,
      safeTrimBefore,
      sharedTransitionSync,
      sourceFps,
      targetTime,
      sequenceFrameOffset,
      shortId,
      sequenceFrom,
    ]
    const video = elementRef.current
    if (!video) return

    if (
      shouldReactOwnPlaybackRate({
        isPlaying,
        supportsRequestVideoFrameCallback: supportsRVFC,
        sharedTransitionSync,
      })
    ) {
      video.playbackRate = mediaPlaybackRate
    }

    // Update sequenceFrom for rVFC callback.
    // Use the SequenceContext's `from` (the absolute global frame where this
    // Sequence starts) directly, rather than reconstructing it as
    // `clock.currentFrame - frame`. The subtraction reads the clock imperatively
    // while `frame` was captured earlier, and propagation through nested
    // sequence contexts can make those two values inconsistent. For deeply
    // nested compositions, the stale delta encoded a nonzero offset that caused
    // rVFC drift correction to seek the video to a wrong target (10s+) every
    // frame, producing black flashes.
    sequenceFromRef.current = sequenceFrom

    // Detect if frame actually changed (for scrub detection)
    const frameChanged = frame !== lastFrameRef.current
    lastFrameRef.current = frame
    const syncContext = getVideoSyncTargetContext({
      frame,
      sequenceFrameOffset,
      safeTrimBefore,
      sourceFps,
      targetTime,
      readyState: video.readyState,
      videoDuration: video.duration || Infinity,
      currentTime: video.currentTime,
    })

    if (targetTime > syncContext.videoDuration - 1) {
      videoLog.debug(`[${shortId}] NEAR END:`, {
        targetTime: targetTime.toFixed(2),
        videoDuration: syncContext.videoDuration.toFixed(2),
        clampedTargetTime: syncContext.clampedTargetTime.toFixed(2),
        frame,
        playbackRate,
        safeTrimBefore,
        fps,
      })
    }

    if ((isReversed || isReverseShuttle) && isPlaying) {
      if (!video.paused) {
        video.pause()
      }
      video.playbackRate = 1
      latestReverseSeekTargetRef.current = syncContext.clampedTargetTime
      if (
        syncContext.canSeek &&
        shouldIssueCoalescedReverseVideoSeek({
          seeking: video.seeking,
          seekInFlight: reverseSeekInFlightRef.current,
          currentTime: video.currentTime,
          targetTime: latestReverseSeekTargetRef.current,
        })
      ) {
        try {
          video.currentTime = latestReverseSeekTargetRef.current
          reverseSeekInFlightRef.current = true
          lastSyncTimeRef.current = Date.now()
          needsInitialSyncRef.current = false
        } catch {
          // Seek failed - video may not be ready yet
        }
      }
      return
    }
    reverseSeekInFlightRef.current = false
    latestReverseSeekTargetRef.current = null
    pausedSeekInFlightRef.current = false
    latestPausedSeekTargetRef.current = null

    // During premount, always pause - don't play until clip is actually visible.
    // Exception: if the element is held by a transition session (marked via
    // data-transition-hold), the canvas overlay needs it playing for zero-copy
    // frame reads. Pausing it would cause a play/pause fight every frame that
    // disrupts Chrome's video decode pipeline and produces visible judder.
    if (syncContext.isPremounted) {
      const premountPlan = planPremountedVideoSync({
        isTransitionHeld: video.dataset.transitionHold === '1',
        isTransitionPrearmed: video.dataset.transitionPrearm === '1',
        canSeek: syncContext.canSeek,
        currentTime: video.currentTime,
        targetTime: syncContext.clampedTargetTime,
        seekToleranceSeconds: 0.1,
      })
      if (premountPlan.shouldPause && !video.paused) {
        video.pause()
      }
      if (premountPlan.seekTo !== null) {
        video.currentTime = premountPlan.seekTo
      }
      return
    }

    if (isPlaying) {
      // Cancel any pending pre-warm since we're about to play
      if (preWarmTimerRef.current !== null) {
        clearTimeout(preWarmTimerRef.current)
        preWarmTimerRef.current = null
      }
      // Initial sync on first play after mount/seek.
      // Skip the seek if element is already at the target (avoids readyState
      // drop from redundant seeks, which delays play start by 100-300ms).
      const initialSyncPlan = planPlayingVideoInitialSync({
        needsInitialSync: needsInitialSyncRef.current,
        canSeek: syncContext.canSeek,
        currentTime: video.currentTime,
        targetTime: syncContext.clampedTargetTime,
      })
      if (initialSyncPlan.seekTo !== null) {
        try {
          video.currentTime = initialSyncPlan.seekTo
        } catch {
          // Seek failed - video may not be ready yet
        }
      }
      if (initialSyncPlan.shouldUpdateLastSyncTime) {
        lastSyncTimeRef.current = Date.now()
      }
      if (initialSyncPlan.shouldMarkInitialSyncComplete) {
        needsInitialSyncRef.current = false
      }

      // Drift correction: only run from this effect when rVFC is NOT available.
      // When rVFC is supported, the callback below handles drift correction
      // directly from the video's presentation callback, avoiding per-frame
      // effect scheduling overhead.
      if (!supportsRVFC && !sharedTransitionSync) {
        const driftCorrectionPlan = planPlayingVideoDriftCorrection({
          canSeek: syncContext.canSeek,
          currentTime: video.currentTime,
          targetTime: syncContext.clampedTargetTime,
          lastSyncTimeMs: lastSyncTimeRef.current,
          nowMs: Date.now(),
        })
        if (driftCorrectionPlan.seekTo !== null) {
          try {
            video.currentTime = driftCorrectionPlan.seekTo
            lastSyncTimeRef.current = Date.now()
          } catch {
            // Seek failed - video may not be ready yet
          }
        }
      }

      // Play if paused and video has current frame data (HAVE_CURRENT_DATA).
      // >= 2 is sufficient — the browser buffers ahead during playback.
      // Previous >= 3 gate added 100-300ms of unnecessary cold start delay
      // waiting for HAVE_FUTURE_DATA after every seek.
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {
          // Autoplay might be blocked - this is fine
        })
      }
    } else {
      // Pause video when not playing
      if (!video.paused) {
        video.pause()
      }
      const playbackState = usePlaybackStore.getState()
      const isPreviewScrubbing =
        !playbackState.isPlaying &&
        playbackState.previewFrame !== null &&
        useGizmoStore.getState().activeGizmo === null
      // Only seek when paused if frame actually changed (user is scrubbing)
      if (frameChanged && syncContext.canSeek) {
        // Layout sync already applies seeks before paint; skip duplicate runtime seek
        // unless the element still has meaningful drift.
        const pausedSyncPlan = planPausedVideoFrameSync({
          frameChanged,
          canSeek: syncContext.canSeek,
          currentTime: video.currentTime,
          targetTime: syncContext.clampedTargetTime,
        })
        if (pausedSyncPlan.seekTo !== null) {
          try {
            latestPausedSeekTargetRef.current = pausedSyncPlan.seekTo
            if (
              shouldIssueCoalescedReverseVideoSeek({
                seeking: video.seeking,
                seekInFlight: pausedSeekInFlightRef.current,
                currentTime: video.currentTime,
                targetTime: pausedSyncPlan.seekTo,
              })
            ) {
              video.currentTime = pausedSyncPlan.seekTo
              pausedSeekInFlightRef.current = true
            }
          } catch {
            // Seek failed - video may not be ready yet
          }
        }

        // Pre-warm decoder at the new position (debounced). Short debounce
        // avoids thrashing during rapid scrubbing while keeping warm-up fast.
        if (!isPreviewScrubbing) {
          schedulePreWarm()
        }
      }
    }
  })

  // Chrome suspends paused/backgrounded media pipelines after inactivity; the
  // next play() then stalls 200-300ms re-initializing the decoder, during
  // which the compositor produces no frames at all. Re-warm on the activity
  // that naturally precedes a play press — the first input after an idle
  // stretch, or the tab becoming visible again — so playback starts hot.
  $effect(() => {
    const playing = isPlaying
    if (playing) return
    return subscribeToWarmupActivity(schedulePreWarm)
  })

  // requestVideoFrameCallback-based drift correction.
  // Runs outside the reactive graph — the browser calls us exactly when a
  // video frame is presented. Uses rate-based correction for small drifts
  // (adjusts playbackRate ±2-5% to smoothly converge) and hard seeks only
  // for large drifts (>200ms). This eliminates the visible “drift then jump”
  // jitter pattern that hard-seek-only correction causes.
  $effect(() => {
    void [clock, poolClipId]
    const playing = isPlaying
    const reversed = isReversed
    const reverseShuttle = isReverseShuttle
    const sharedSync = sharedTransitionSync
    const video = elementRef.current
    if (
      !video ||
      !playing ||
      reversed ||
      reverseShuttle ||
      !supportsRVFC ||
      sharedSync
    )
      return

    // Pre-resume AudioContext so audio starts immediately with video.
    // Without this, suspended AudioContext adds 50-100ms audio delay on cold resume.
    ensureAudioContextResumed()

    // Set initial playbackRate when RVFC takes over
    video.playbackRate = mediaPlaybackRateRef.current

    let handle: number
    let previousTargetTime: number | null = null
    let previousCallbackTimeMs = Date.now()
    const onVideoFrame = () => {
      const v = elementRef.current
      if (!v) return

      // Read current clock frame imperatively (no reactive work needed)
      const globalFrame = clock.currentFrame
      const localFrame = globalFrame - sequenceFromRef.current
      const relativeFrame = localFrame - sequenceFrameOffsetRef.current

      // During premount, just keep listening
      if (relativeFrame < 0) {
        handle = v.requestVideoFrameCallback(onVideoFrame)
        return
      }

      const nominalRate = mediaPlaybackRateRef.current
      const timelineFps = fpsRef.current
      const clipSourceFps = sourceFpsRef.current
      const trim = safeTrimBeforeRef.current
      const target = getVideoTargetTimeSeconds(
        trim,
        clipSourceFps,
        localFrame,
        playbackRateRef.current,
        timelineFps,
        sequenceFrameOffsetRef.current,
        isReversedRef.current,
        reverseSourceEndRef.current,
      )
      const dur = v.duration || Infinity
      const clamped = Math.min(Math.max(0, target), dur - 0.05)
      const callbackTimeMs = Date.now()
      const targetDiscontinuity = isVideoSyncTargetDiscontinuity({
        previousTargetTime,
        targetTime: clamped,
        elapsedMs: callbackTimeMs - previousCallbackTimeMs,
        nominalRate,
      })
      previousTargetTime = clamped
      previousCallbackTimeMs = callbackTimeMs
      const correctionPlan = planVideoFrameCallbackCorrection({
        currentTime: v.currentTime,
        targetTime: clamped,
        nominalRate,
        readyState: v.readyState,
        targetDiscontinuity,
      })

      if (correctionPlan.kind === 'seek') {
        try {
          v.currentTime = correctionPlan.seekTo
          if (correctionPlan.shouldUpdateLastSyncTime) {
            lastSyncTimeRef.current = Date.now()
          }
        } catch {
          // Seek may fail if element isn't fully loaded
        }
      }
      if (shouldUpdateVideoPlaybackRate(v.playbackRate, correctionPlan.playbackRate)) {
        v.playbackRate = correctionPlan.playbackRate
      }

      handle = v.requestVideoFrameCallback(onVideoFrame)
    }

    handle = video.requestVideoFrameCallback(onVideoFrame)
    return () => {
      video.cancelVideoFrameCallback(handle)
      // Reset to nominal rate when RVFC stops managing
      if (elementRef.current) {
        elementRef.current.playbackRate = mediaPlaybackRateRef.current
      }
    }
  })

  // Keep volume/gain in sync for pooled element.
  $effect(() => {
    const volume = audioVolume
    const stages = audioEqStages
    const video = elementRef.current
    if (!video) return
    applyVideoElementAudioState(video, volume, stages)
  })

  // When premounted, frame will be negative. Hide the video until it's visible.
  // In shared Sequences, local frame is offset by _sequenceFrameOffset.
  const isVisible = $derived(frame - sequenceFrameOffset >= 0)
</script>

<!-- Guard: itemId is required for rendering -->
{#if !itemId}
  <div style="width: 100%; height: 100%; background-color: #1a1a1a;"></div>
{:else}
  <!-- DEBUG: Give container a unique ID so we can verify in DOM -->
  <div
    bind:this={containerElement}
    id="video-container-{itemId}"
    data-item-id={itemId}
    style:width="100%"
    style:height="100%"
    style:position="relative"
    style:visibility={isVisible ? undefined : 'hidden'}
    style:transform={forceCssComposite ? 'translateZ(0)' : undefined}
    style:backface-visibility={forceCssComposite ? 'hidden' : undefined}
    style:will-change={forceCssComposite ? 'transform, opacity' : undefined}
    style:contain={forceCssComposite ? 'paint' : undefined}
  >
    <!-- Video element is mounted here by the acquire effect -->
  </div>
{/if}

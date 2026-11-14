<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { getTrackKind } from '@/features/preview/deps/timeline-source-edit'
  import type { TimelineTrack } from '@/types/timeline'


  // Height of the IO lane strip (matches the `h-2.5` container below).
  const SOURCE_IO_LANE_HEIGHT = 10

  function isPatchDestinationTrack(
    track: TimelineTrack | null,
    kind: 'video' | 'audio',
  ): track is TimelineTrack {
    if (!track || track.locked || track.isGroup) {
      return false
    }

    const trackKind = getTrackKind(track)
    return trackKind === kind || trackKind === null
  }

  function getPatchDestinationOptions(
    tracks: TimelineTrack[],
    kind: 'video' | 'audio',
  ): TimelineTrack[] {
    return [...tracks]
      .filter((track) => isPatchDestinationTrack(track, kind))
      .sort((a, b) => a.order - b.order)
  }
</script>

<script lang="ts">
  import { performInsertEdit, performOverwriteEdit, resolveSourceEditTrackTargets } from '@/features/preview/deps/timeline-source-edit'
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'
  import Play from 'lucide-svelte/icons/play'
  import Pause from 'lucide-svelte/icons/pause'
  import SkipBack from 'lucide-svelte/icons/skip-back'
  import SkipForward from 'lucide-svelte/icons/skip-forward'
  import ChevronLeft from 'lucide-svelte/icons/chevron-left'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import Repeat from 'lucide-svelte/icons/repeat'
  import ArrowLeftToLine from 'lucide-svelte/icons/arrow-left-to-line'
  import ArrowRightToLine from 'lucide-svelte/icons/arrow-right-to-line'
  import XCircle from 'lucide-svelte/icons/circle-x'
  import ArrowDownToLine from 'lucide-svelte/icons/arrow-down-to-line'
  import Replace from 'lucide-svelte/icons/replace'
  import { Button } from '@/components/ui/button'
  import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
  import { useClock, useClockIsPlaying, useClockPlaybackRate, usePlayer } from '@/features/preview/deps/player-context'
  import ShuttleIndicator from '@/shared/ui/shuttle-indicator.svelte'
  import { clampDraggedSourceInPoint, clampDraggedSourceOutPoint, getExclusiveSourceOutPoint, getSourcePointPercent, getSourceStripPointFromRatio, shiftSourceIoRange } from '@/features/preview/utils/source-io'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  import { useEditorStore } from '@/shared/state/editor'
  import { useSourcePlayerStore } from '@/shared/state/source-player'
  import { getNextShuttleRate } from '@/shared/state/playback/shuttle'
  import { useSelectionStore } from '@/shared/state/selection'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { createScrubThrottleState, shouldCommitScrubFrame } from '@/features/preview/deps/timeline-utils'
  import { beginIoPointerDrag, IoRangeHandles, IoRangeStrip, useMeasuredWidth } from '@/shared/timeline/io-range'
  import { formatTimecodeCompact } from '@/shared/utils/time-utils'
  import SourcePatchDestinationPicker from './source-patch-destination-picker.svelte'
  let { durationInFrames, fps, mediaType, hasAudio, interactive, seekFrame }: {
    durationInFrames: number
    fps: number
    mediaType: 'video' | 'audio' | 'image' | 'lottie'
    hasAudio: boolean
    interactive: boolean
    seekFrame: number | null
  } = $props()
  const clock = useClock()
  const player = usePlayer(() => durationInFrames)
  const playing = useClockIsPlaying()
  const playbackRate = useClockPlaybackRate()
  const shuttleActiveRef = { current: false }
  const lastFrame = $derived(Math.max(0, durationInFrames - 1))
  const tracks = select(useItemsStore, (s) => s.tracks)
  const activeTrackId = select(useSelectionStore, (s) => s.activeTrackId)
  const sourcePatchVideoEnabled = select(useEditorStore, (s) => s.sourcePatchVideoEnabled)
  const sourcePatchAudioEnabled = select(useEditorStore, (s) => s.sourcePatchAudioEnabled)
  const sourcePatchVideoTrackId = select(useEditorStore, (s) => s.sourcePatchVideoTrackId)
  const sourcePatchAudioTrackId = select(useEditorStore, (s) => s.sourcePatchAudioTrackId)
  const setSourcePatchVideoTrackId = useEditorStore.getState().setSourcePatchVideoTrackId
  const setSourcePatchAudioTrackId = useEditorStore.getState().setSourcePatchAudioTrackId
  const toggleSourcePatchVideoEnabled = useEditorStore.getState().toggleSourcePatchVideoEnabled
  const toggleSourcePatchAudioEnabled = useEditorStore.getState().toggleSourcePatchAudioEnabled
  const currentFrameRef = { current: clock.currentFrame }
  const progressRef: { current: HTMLDivElement | null } = { current: null }
  const currentTimeRef: { current: HTMLSpanElement | null } = { current: null }
  const outPointRef: { current: number | null } = { current: useSourcePlayerStore.getState().outPoint }
  let showFrames = $state.raw(false)
  const setShowFrames = (next: typeof showFrames | ((prev: typeof showFrames) => typeof showFrames)) => {
    showFrames = typeof next === 'function' ? (next as (prev: typeof showFrames) => typeof showFrames)(untrack(() => showFrames)) : next
  }
  const showFramesRef = { current: showFrames }
  $effect.pre(() => {
    showFramesRef.current = showFrames
  })

  const frameDigits = $derived(Math.max(durationInFrames.toString().length, 1))

  const formatFrameNumber = (f: number) => f.toString().padStart(frameDigits, '0')

  const formatTime = (f: number) => (showFramesRef.current ? formatFrameNumber(f) : formatTimecodeCompact(f, fps))

  const clearPreviewSourceFrame = () => {
    if (interactive) {
      useSourcePlayerStore.getState().setPreviewSourceFrame(null)
    }
  }

  const updateFrameDisplay = (frame: number) => {
      currentFrameRef.current = frame
      if (interactive) {
        useSourcePlayerStore.getState().setCurrentSourceFrame(frame)
      }
      if (progressRef.current) {
        const progress = lastFrame > 0 ? (frame / lastFrame) * 100 : 0
        progressRef.current.style.width = `${progress}%`
      }
      if (currentTimeRef.current) {
        currentTimeRef.current.textContent = showFramesRef.current
          ? formatFrameNumber(frame)
          : formatTimecodeCompact(frame, fps)
      }
    }

  const commitSourceSeek = (frame: number) => {
      clearPreviewSourceFrame()
      updateFrameDisplay(frame)
      player.seek(frame)
    }

  // Bridge player methods into the source player store for keyboard shortcuts
  $effect(() => {
    if (!interactive) return
    const setPlayerMethods = useSourcePlayerStore.getState().setPlayerMethods
    setPlayerMethods({
      toggle: () => {
        shuttleActiveRef.current = false
        const previewFrame = useSourcePlayerStore.getState().previewSourceFrame
        if (previewFrame !== null) {
          commitSourceSeek(previewFrame)
        }
        if (player.isPlaying()) {
          player.pause()
        } else {
          player.setPlaybackRate(1)
          player.play()
        }
      },
      pause: () => {
        shuttleActiveRef.current = false
        player.pause()
        player.setPlaybackRate(1)
      },
      isPlaying: () => player.isPlaying(),
      shuttleForward: () => {
        shuttleActiveRef.current = true
        const nextRate = player.isPlaying() ? getNextShuttleRate(player.getPlaybackRate(), 1) : 1
        player.setPlaybackRate(nextRate)
        player.play()
      },
      shuttleReverse: () => {
        shuttleActiveRef.current = true
        const nextRate = player.isPlaying() ? getNextShuttleRate(player.getPlaybackRate(), -1) : -1
        player.setPlaybackRate(nextRate)
        player.play()
      },
      seek: (frame) => {
        commitSourceSeek(frame)
      },
      frameBack: (frames) => {
        clearPreviewSourceFrame()
        player.frameBack(frames)
      },
      frameForward: (frames) => {
        clearPreviewSourceFrame()
        player.frameForward(frames)
      },
      getDurationInFrames: () => durationInFrames,
    })
    return () => {
      useSourcePlayerStore.getState().setPlayerMethods(null)
    }
  })

  $effect(() => {
    updateFrameDisplay(clock.currentFrame)
    return clock.onFrameChange((frame) => {
      updateFrameDisplay(frame)

      if (
        replayingRef.current &&
        clock.isPlaying &&
        outPointRef.current !== null &&
        frame >= outPointRef.current
      ) {
        player.pause()
        replayingRef.current = false
      }
    })
  })

  // Consume pending seek. Always pause → seek → (optionally) play so
  // switching scenes lands a clean transition: no `player.play()` short-
  // circuiting because the previous scene was still playing (the ref
  // `imperativePlaying.current` blocks a second play), and the video
  // element isn't decoding the old frame while the seek is in flight.
  const pendingSeekFrame = select(useSourcePlayerStore, (s) => s.pendingSeekFrame)
  $effect(() => {
    if (!interactive) return
    if (pendingSeekFrame.current !== null) {
      player.pause()
      commitSourceSeek(pendingSeekFrame.current)
      const store = useSourcePlayerStore.getState()
      store.setPendingSeekFrame(null)
      const shouldPlay = store.pendingPlay
      store.setPendingPlay(false)
      if (shouldPlay) {
        shuttleActiveRef.current = false
        player.setPlaybackRate(1)
        player.play()
      }
    }
  })

  $effect(() => {
    if (seekFrame === null) return
    commitSourceSeek(seekFrame)
  })

  // Read I/O points from store
  const inPoint = select(useSourcePlayerStore, (s) => s.inPoint)
  const outPoint = select(useSourcePlayerStore, (s) => s.outPoint)
  $effect(() => {
    outPointRef.current = outPoint.current
  })

  // Progress bar with drag support
  const barRef: { current: HTMLDivElement | null } = { current: null }
  const draggingRef = { current: false }
  const onMoveRef: { current: ((ev: MouseEvent) => void) | null } = { current: null }
  const onUpRef: { current: (() => void) | null } = { current: null }
  const pendingBarSeekFrameRef: { current: number | null } = { current: null }
  const pendingBarPointerXRef: { current: number | null } = { current: null }
  const barSeekRafRef: { current: number | null } = { current: null }
  const lastIssuedBarSeekFrameRef: { current: number | null } = { current: null }
  const scrubThrottleStateRef = { current: createScrubThrottleState({
      frame: clock.currentFrame,
      nowMs: performance.now(),
    }) }

  const frameFromBarX = (clientX: number) => {
      const bar = barRef.current
      if (!bar) return null
      const rect = bar.getBoundingClientRect()
      if (rect.width <= 0) {
        return 0
      }
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return Math.round(pct * lastFrame)
    }

  const flushBarSeekFrame = (frame: number) => {
      lastIssuedBarSeekFrameRef.current = frame
      commitSourceSeek(frame)
    }

  const getBarPixelsPerSecond = () => {
    const bar = barRef.current
    if (!bar || durationInFrames <= 0 || fps <= 0) {
      return 0
    }

    return (bar.clientWidth * fps) / durationInFrames
  }

  const previewBarSeekFrame = (frame: number) => {
      pendingBarSeekFrameRef.current = frame

      if (interactive) {
        useSourcePlayerStore.getState().setPreviewSourceFrame(frame)
      }
      if (currentFrameRef.current !== frame) {
        updateFrameDisplay(frame)
      }
    }

  const scheduleBarSeekFrame = (frame: number, pointerX: number, force = false) => {
      pendingBarSeekFrameRef.current = frame
      pendingBarPointerXRef.current = pointerX

      if (force) {
        previewBarSeekFrame(frame)
        return
      }

      if (barSeekRafRef.current !== null) {
        return
      }

      barSeekRafRef.current = requestAnimationFrame(() => {
        barSeekRafRef.current = null
        const pendingFrame = pendingBarSeekFrameRef.current
        const pendingPointerX = pendingBarPointerXRef.current
        if (pendingFrame === null || pendingPointerX === null) {
          return
        }

        if (
          shouldCommitScrubFrame({
            state: scrubThrottleStateRef.current,
            pointerX: pendingPointerX,
            targetFrame: pendingFrame,
            pixelsPerSecond: getBarPixelsPerSecond(),
            nowMs: performance.now(),
          })
        ) {
          previewBarSeekFrame(pendingFrame)
        }
      })
    }

  const handleBarMouseDown = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = true
      if (playing.current) {
        player.pause()
        replayingRef.current = false
      }
      const initialFrame = frameFromBarX(e.clientX)
      if (initialFrame !== null) {
        scrubThrottleStateRef.current = createScrubThrottleState({
          pointerX: e.clientX,
          frame: initialFrame,
          nowMs: performance.now(),
        })
        scheduleBarSeekFrame(initialFrame, e.clientX, true)
      }
      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return
        const nextFrame = frameFromBarX(ev.clientX)
        if (nextFrame !== null) {
          scheduleBarSeekFrame(nextFrame, ev.clientX)
        }
      }
      const onUp = () => {
        const pendingFrame = pendingBarSeekFrameRef.current
        draggingRef.current = false
        pendingBarSeekFrameRef.current = null
        pendingBarPointerXRef.current = null
        if (barSeekRafRef.current !== null) {
          cancelAnimationFrame(barSeekRafRef.current)
          barSeekRafRef.current = null
        }
        if (pendingFrame !== null) {
          flushBarSeekFrame(pendingFrame)
        }
        if (onMoveRef.current) {
          document.removeEventListener('mousemove', onMoveRef.current)
          onMoveRef.current = null
        }
        if (onUpRef.current) {
          document.removeEventListener('mouseup', onUpRef.current)
          onUpRef.current = null
        }
      }
      onMoveRef.current = onMove
      onUpRef.current = onUp
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

  // Clean up document listeners on unmount
  $effect(() => untrack(() => {
    return () => {
      pendingBarSeekFrameRef.current = null
      pendingBarPointerXRef.current = null
      lastIssuedBarSeekFrameRef.current = null
      if (barSeekRafRef.current !== null) {
        cancelAnimationFrame(barSeekRafRef.current)
        barSeekRafRef.current = null
      }
      if (onMoveRef.current) {
        document.removeEventListener('mousemove', onMoveRef.current)
        onMoveRef.current = null
      }
      if (onUpRef.current) {
        document.removeEventListener('mouseup', onUpRef.current)
        onUpRef.current = null
      }
      draggingRef.current = false
    }
  }))

  // I/O marker positions as percentages
  const inPct = $derived(interactive ? getSourcePointPercent(inPoint.current, durationInFrames) : null)
  const outPct = $derived(interactive ? getSourcePointPercent(outPoint.current, durationInFrames) : null)

  // Draggable I/O handles + range
  const ioStripRef: { current: HTMLDivElement | null } = { current: null }
  // Strip pixel width — handles position via `%` but need the px span to stay
  // collapse-safe (they'd otherwise overlap into a block on a short range). The
  // strip mounts late (only once an in/out point exists), so measure via the
  // callback ref to catch that mount.
  const measuredWidth = useMeasuredWidth(ioStripRef)
  const ioStripWidth = $derived(measuredWidth.width)
  const ioDragCleanupRef: { current: (() => void) | null } = { current: null }

  const pointFromStripX = (clientX: number) => {
      const strip = ioStripRef.current
      if (!strip) return 0
      const rect = strip.getBoundingClientRect()
      if (rect.width <= 0) return 0
      return getSourceStripPointFromRatio((clientX - rect.left) / rect.width, durationInFrames)
    }

  const handleIODragStart = (e: PointerEvent, type: 'in' | 'out') => {
      const store = useSourcePlayerStore.getState
      const originalCursor = document.body.style.cursor
      const cleanup = beginIoPointerDrag(
        e,
        (clientX) => {
          const point = pointFromStripX(clientX)
          if (type === 'in') {
            const nextIn = clampDraggedSourceInPoint(point, store().outPoint, lastFrame)
            store().setInPoint(nextIn)
            store().setPreviewSourceFrame(nextIn)
            return formatTime(nextIn)
          }
          const nextOut = clampDraggedSourceOutPoint(point, store().inPoint, durationInFrames)
          store().setOutPoint(nextOut)
          // Out is exclusive — skim to the last included frame (out - 1).
          store().setPreviewSourceFrame(Math.max(0, nextOut - 1))
          return formatTime(nextOut)
        },
        () => {
          document.body.style.cursor = originalCursor
          store().setPreviewSourceFrame(null)
          ioDragCleanupRef.current = null
        },
      )
      if (!cleanup) return
      document.body.style.cursor = 'col-resize'
      ioDragCleanupRef.current = cleanup
    }

  const handleIORangeDragStart = (e: PointerEvent) => {
      const store = useSourcePlayerStore.getState
      const startIn = store().inPoint
      const startOut = store().outPoint
      if (startIn === null || startOut === null) return
      const startPoint = pointFromStripX(e.clientX)
      const originalCursor = document.body.style.cursor
      const cleanup = beginIoPointerDrag(
        e,
        (clientX) => {
          const delta = pointFromStripX(clientX) - startPoint
          const nextRange = shiftSourceIoRange(startIn, startOut, delta, durationInFrames)
          store().setInPoint(nextRange.inPoint)
          store().setOutPoint(nextRange.outPoint)
          // Skim the preview to the range's leading (in) edge as it slides.
          store().setPreviewSourceFrame(nextRange.inPoint)
          return `${formatTime(nextRange.inPoint)} → ${formatTime(nextRange.outPoint)}`
        },
        () => {
          document.body.style.cursor = originalCursor
          store().setPreviewSourceFrame(null)
          ioDragCleanupRef.current = null
        },
      )
      if (!cleanup) return
      document.body.style.cursor = 'grabbing'
      ioDragCleanupRef.current = cleanup
    }

  $effect(() => untrack(() => {
    return () => ioDragCleanupRef.current?.()
  }))

  // Duration display when both I/O are set
  const ioDuration = $derived(interactive && inPoint.current !== null && outPoint.current !== null ? formatTime(outPoint.current - inPoint.current) : null)

  const handleMarkIn = () => {
    useSourcePlayerStore.getState().setInPoint(currentFrameRef.current)
  }

  const handleMarkOut = () => {
    useSourcePlayerStore
      .getState()
      .setOutPoint(getExclusiveSourceOutPoint(currentFrameRef.current, durationInFrames))
  }

  const handleClearIO = () => {
    useSourcePlayerStore.getState().clearInOutPoints()
  }

  // Auto-stop playback at out point
  const replayingRef = { current: false }

  $effect(() => {
    if (!playing.current) {
      replayingRef.current = false
    }
  })

  const handleReplaySegment = () => {
    const { inPoint: ip, outPoint: op } = useSourcePlayerStore.getState()
    if (ip === null && op === null) return
    shuttleActiveRef.current = false
    player.setPlaybackRate(1)
    replayingRef.current = true
    commitSourceSeek(ip ?? 0)
    player.play()
  }

  const handleGoToStart = () => {
    commitSourceSeek(0)
  }

  const handleStepBack = () => {
    clearPreviewSourceFrame()
    player.frameBack(1)
  }

  const handleTogglePlayback = () => {
    shuttleActiveRef.current = false
    const previewFrame = useSourcePlayerStore.getState().previewSourceFrame
    if (previewFrame !== null) {
      commitSourceSeek(previewFrame)
    }
    if (player.isPlaying()) {
      player.pause()
      player.setPlaybackRate(1)
    } else {
      player.setPlaybackRate(1)
      player.play()
    }
  }

  const handleStepForward = () => {
    clearPreviewSourceFrame()
    player.frameForward(1)
  }

  const handleGoToEnd = () => {
    commitSourceSeek(lastFrame)
  }

  const activeTrack = $derived.by(() => (activeTrackId.current ? (tracks.current.find((track) => track.id === activeTrackId.current) ?? null) : null))
  const selectedVideoTrack = $derived.by(() =>
      sourcePatchVideoTrackId.current
        ? (tracks.current.find((track) => track.id === sourcePatchVideoTrackId.current) ?? null)
        : null)
  const selectedAudioTrack = $derived.by(() =>
      sourcePatchAudioTrackId.current
        ? (tracks.current.find((track) => track.id === sourcePatchAudioTrackId.current) ?? null)
        : null)
  const videoDestinationOptions = $derived.by(() => getPatchDestinationOptions(tracks.current, 'video'))
  const audioDestinationOptions = $derived.by(() => getPatchDestinationOptions(tracks.current, 'audio'))

  $effect(() => {
    if (!interactive || !activeTrackId.current || !activeTrack || activeTrack.locked) {
      return
    }

    const currentState = useEditorStore.getState()
    const hasVideoDestination = isPatchDestinationTrack(
      tracks.current.find((track) => track.id === currentState.sourcePatchVideoTrackId) ?? null,
      'video',
    )
    const hasAudioDestination = isPatchDestinationTrack(
      tracks.current.find((track) => track.id === currentState.sourcePatchAudioTrackId) ?? null,
      'audio',
    )
    const activeTrackKind = getTrackKind(activeTrack)
    if (activeTrackKind === 'audio') {
      if (!hasAudioDestination) {
        setSourcePatchAudioTrackId(activeTrackId.current)
      }
      return
    }

    if (activeTrackKind === 'video') {
      if (!hasVideoDestination) {
        setSourcePatchVideoTrackId(activeTrackId.current)
      }
      return
    }

    if (mediaType === 'audio' && !hasAudioDestination) {
      setSourcePatchAudioTrackId(activeTrackId.current)
    } else if (mediaType !== 'audio' && !hasVideoDestination) {
      setSourcePatchVideoTrackId(activeTrackId.current)
    }
  })

  const patchTargetPreview = $derived.by(() => {
    const resolvedTargets = resolveSourceEditTrackTargets({
      tracks: tracks.current,
      activeTrackId: activeTrackId.current,
      preferredVideoTrackId: sourcePatchVideoTrackId.current,
      preferredAudioTrackId: sourcePatchAudioTrackId.current,
      mediaType,
      hasAudio,
      patchVideo: sourcePatchVideoEnabled.current,
      patchAudio: sourcePatchAudioEnabled.current,
      preferredTrackHeight:
        activeTrack?.height ??
        selectedVideoTrack?.height ??
        selectedAudioTrack?.height ??
        tracks.current[0]?.height ??
        64,
    })

    if (!resolvedTargets) {
      return {
        videoTargetName: null,
        audioTargetName: null,
        status: null,
      }
    }

    const resolvedTracks = resolvedTargets.tracks
    return {
      videoTargetName: resolvedTargets.videoTrackId
        ? (resolvedTracks.find((track) => track.id === resolvedTargets.videoTrackId)?.name ?? null)
        : null,
      audioTargetName: resolvedTargets.audioTrackId
        ? (resolvedTracks.find((track) => track.id === resolvedTargets.audioTrackId)?.name ?? null)
        : null,
      status: null,
    }
  })

  const videoDestinationLabel = $derived(selectedVideoTrack?.name ?? patchTargetPreview.videoTargetName ?? 'Auto')
  const audioDestinationLabel = $derived(selectedAudioTrack?.name ?? patchTargetPreview.audioTargetName ?? 'Auto')

  const videoPatchTooltip = $derived(patchTargetPreview.videoTargetName
    ? `Video Source Patch On -> ${patchTargetPreview.videoTargetName}`
    : sourcePatchVideoEnabled.current
      ? 'Video Source Patch On'
      : 'Video Source Patch Off')
  const audioPatchTooltip = $derived(patchTargetPreview.audioTargetName
    ? `Audio Source Patch On -> ${patchTargetPreview.audioTargetName}`
    : sourcePatchAudioEnabled.current
      ? 'Audio Source Patch On'
      : 'Audio Source Patch Off')
</script>

<div class="@container flex flex-col shrink-0">
  <!-- Seek bar row with I/O region above and editing buttons -->
  <div
    class="border-t border-border panel-header flex items-center gap-2 px-4 h-7 shrink-0"
  >
    <div class="flex-1 flex flex-col justify-center gap-0.5 min-w-0">
      <!-- I/O region strip — styled like timeline I/O controls -->
      {#if interactive && (inPct !== null || outPct !== null)}
        <div
          {@attach measuredWidth.measureRef}
          class="w-full h-2.5 relative shrink-0"
        >
          {#if inPct !== null && outPct !== null}
            <IoRangeStrip
              left={`${inPct}%`}
              width={`${outPct - inPct}%`}
              height={SOURCE_IO_LANE_HEIGHT}
              onDragStart={handleIORangeDragStart}
             />
          {/if}
          <IoRangeHandles
            inLeft={inPct !== null ? `${inPct}%` : null}
            outLeft={outPct !== null ? `${outPct}%` : null}
            spanPx={inPct !== null && outPct !== null ? ((outPct - inPct) / 100) * ioStripWidth : null}
            laneHeight={SOURCE_IO_LANE_HEIGHT}
            onInDragStart={(e) => handleIODragStart(e, 'in')}
            onOutDragStart={(e) => handleIODragStart(e, 'out')}
           />
        </div>
      {/if}
      <!-- Seek bar -->
      <div
        bind:this={barRef.current}
        data-testid="source-monitor-seek-bar"
        class="w-full h-1.5 bg-muted rounded cursor-pointer relative"
        onmousedown={handleBarMouseDown}
      >
        <div
          bind:this={progressRef.current}
          class="absolute inset-y-0 left-0 bg-primary transition-none pointer-events-none rounded-l"
          style:width={`${lastFrame > 0 ? (clock.currentFrame / lastFrame) * 100 : 0}%`}
        ></div>
      </div>
    </div>
    {#if interactive}
      <div class="flex items-center gap-0.5 shrink-0">
        <Tooltip>
          <TooltipTrigger>
            {#snippet child({ props })}
              <Button {...props}
                variant="ghost"
                size="icon"
                style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
                disabled={inPoint.current === null && outPoint.current === null}
                onclick={handleReplaySegment}
                aria-label="Play In to Out"
              >
                <Repeat class="w-3 h-3" />
              </Button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent side="top">
            Play In to Out
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            {#snippet child({ props })}
              <Button {...props}
                variant="ghost"
                size="icon"
                style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
                onclick={handleMarkIn}
                aria-label="Mark In (I)"
              >
                <ArrowLeftToLine class="w-3 h-3" />
              </Button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent side="top">
            Mark In (I)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            {#snippet child({ props })}
              <Button {...props}
                variant="ghost"
                size="icon"
                style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
                onclick={handleMarkOut}
                aria-label="Mark Out (O)"
              >
                <ArrowRightToLine class="w-3 h-3" />
              </Button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent side="top">
            Mark Out (O)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            {#snippet child({ props })}
              <Button {...props}
                variant="ghost"
                size="icon"
                style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
                onclick={handleClearIO}
                aria-label="Clear In/Out (Alt+X)"
              >
                <XCircle class="w-3 h-3" />
              </Button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent side="top">
            Clear In/Out (Alt+X)
          </TooltipContent>
        </Tooltip>
      </div>
    {/if}
  </div>
  <!-- Transport row -->
  <div
    class="border-t border-border panel-header flex items-center justify-between px-4 shrink-0"
    style:height={EDITOR_LAYOUT_CSS_VALUES.previewControlsHeight}
  >
    <div class="flex min-w-0 shrink-0 items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 bg-transparent p-0 font-mono text-[11px] tabular-nums text-left transition-colors select-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm shrink-0"
        onclick={() => setShowFrames((prev) => !prev)}
      >
        <span bind:this={currentTimeRef.current} class="text-primary font-semibold">
          {formatTime(clock.currentFrame)}
        </span>
        <span class="text-muted-foreground">
          /
        </span>
        <span>
          {formatTime(lastFrame)}
        </span>
      </button>
      <ShuttleIndicator
        active={playing.current && shuttleActiveRef.current}
        playbackRate={playbackRate.current}
       />
    </div>
    <span
      class="text-[11px] font-mono text-primary/70 shrink-0 hidden @min-[480px]:inline"
    >
      {#if ioDuration}
        {`[${ioDuration}]`}
      {:else}
        
      {/if}
    </span>
    <div class="flex items-center gap-0.5 shrink-0">
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button {...props}
              variant="ghost"
              size="icon"
              style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
              onclick={handleGoToStart}
              aria-label="Go to start (Home)"
            >
              <SkipBack class="w-3.5 h-3.5" />
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="top">
          Go to start (Home)
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button {...props}
              variant="ghost"
              size="icon"
              style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
              onclick={handleStepBack}
              aria-label="Previous frame (Left Arrow)"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="top">
          Previous frame (Left Arrow)
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button {...props}
              size="icon"
              style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
              onclick={handleTogglePlayback}
              aria-label={playing.current ? 'Pause (Space)' : 'Play (Space)'}
            >
              {#if playing.current}
                <Pause class="w-3.5 h-3.5" />
              {:else}
                <Play class="w-3.5 h-3.5 ml-0.5" />
              {/if}
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="top">
          {#if playing.current}
            Pause
          {:else}
            Play
          {/if}
          (Space)
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button {...props}
              variant="ghost"
              size="icon"
              style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
              onclick={handleStepForward}
              aria-label="Next frame (Right Arrow)"
            >
              <ChevronRight class="w-3.5 h-3.5" />
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="top">
          Next frame (Right Arrow)
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <Button {...props}
              variant="ghost"
              size="icon"
              style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
              onclick={handleGoToEnd}
              aria-label="Go to end (End)"
            >
              <SkipForward class="w-3.5 h-3.5" />
            </Button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent side="top">
          Go to end (End)
        </TooltipContent>
      </Tooltip>
    </div>
    {#if interactive}
      <div class="flex items-center gap-0.5 shrink-0">
        <div class="flex items-center gap-1 shrink-0">
          <div
            class="flex items-center gap-0.5 rounded-md border border-border bg-secondary/50 px-1 py-0.5"
          >
            <Tooltip>
              <TooltipTrigger>
                {#snippet child({ props })}
                  <Button {...props}
                    variant="ghost"
                    size="sm"
                    class={`h-6 min-w-6 px-1.5 font-mono text-[11px] ${
                      sourcePatchVideoEnabled.current
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : ''
                    }`}
                    onclick={toggleSourcePatchVideoEnabled}
                    aria-label={sourcePatchVideoEnabled.current
                      ? 'Disable video source patch target'
                      : 'Enable video source patch target'}
                    aria-pressed={sourcePatchVideoEnabled.current}
                  >
                    V
                  </Button>
                {/snippet}
              </TooltipTrigger>
              <TooltipContent side="top">
                {videoPatchTooltip}
              </TooltipContent>
            </Tooltip>
            <SourcePatchDestinationPicker
              kind="video"
              label={videoDestinationLabel}
              selectedTrackId={sourcePatchVideoTrackId.current}
              options={videoDestinationOptions}
              onSelectTrack={setSourcePatchVideoTrackId}
             />
            <Tooltip>
              <TooltipTrigger>
                {#snippet child({ props })}
                  <Button {...props}
                    variant="ghost"
                    size="sm"
                    class={`h-6 min-w-6 px-1.5 font-mono text-[11px] ${
                      sourcePatchAudioEnabled.current
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : ''
                    }`}
                    onclick={toggleSourcePatchAudioEnabled}
                    aria-label={sourcePatchAudioEnabled.current
                      ? 'Disable audio source patch target'
                      : 'Enable audio source patch target'}
                    aria-pressed={sourcePatchAudioEnabled.current}
                  >
                    A
                  </Button>
                {/snippet}
              </TooltipTrigger>
              <TooltipContent side="top">
                {audioPatchTooltip}
              </TooltipContent>
            </Tooltip>
            <SourcePatchDestinationPicker
              kind="audio"
              label={audioDestinationLabel}
              selectedTrackId={sourcePatchAudioTrackId.current}
              options={audioDestinationOptions}
              onSelectTrack={setSourcePatchAudioTrackId}
             />
          </div>
          <!-- V/A preview labels: hidden at narrow widths, info still in menus/tooltips -->
          {#if patchTargetPreview.videoTargetName || patchTargetPreview.audioTargetName}
            <div
              class="hidden @min-[560px]:flex items-center gap-1 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
            >
              {#if patchTargetPreview.videoTargetName}
                <span class="rounded border border-border/70 bg-secondary/60 px-1.5 py-0.5">
                  V->
                  {patchTargetPreview.videoTargetName}
                </span>
              {/if}
              {#if patchTargetPreview.audioTargetName}
                <span class="rounded border border-border/70 bg-secondary/60 px-1.5 py-0.5">
                  A->
                  {patchTargetPreview.audioTargetName}
                </span>
              {/if}
            </div>
          {/if}
        </div>
        <div class="w-px h-4 bg-border mx-0.5"></div>
        <Tooltip>
          <TooltipTrigger>
            {#snippet child({ props })}
              <Button {...props}
                variant="ghost"
                size="icon"
                style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
                onclick={() => performInsertEdit()}
                aria-label="Insert (,)"
              >
                <ArrowDownToLine class="w-3.5 h-3.5" />
              </Button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent side="top">
            Insert (,)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            {#snippet child({ props })}
              <Button {...props}
                variant="ghost"
                size="icon"
                style={`width: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}; height: ${EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize}`}
                onclick={() => performOverwriteEdit()}
                aria-label="Overwrite (.)"
              >
                <Replace class="w-3.5 h-3.5" />
              </Button>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent side="top">
            Overwrite (.)
          </TooltipContent>
        </Tooltip>
      </div>
    {:else}
      <div class="w-[11ch] shrink-0" aria-hidden="true"></div>
    {/if}
  </div>
</div>

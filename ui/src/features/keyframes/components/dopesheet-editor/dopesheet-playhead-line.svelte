<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  /**
   * Self-positioning unified playhead for the dope sheet timeline.
   *
   * The flag and full-height line are rendered by one element. During playback
   * this component updates its position directly so the editor does not need to
   * re-render on every frame.
   */
  import { mainTimelineScrubHandoffFrameRef } from '@/shared/timeline/main-timeline-scrub'
  import type { Ref } from '../ref-state.svelte'

  function setTranslateXIfChanged(element: HTMLElement, left: number): void {
    const transform = `translate3d(${left}px, 0, 0)`
    if (element.style.transform !== transform) element.style.transform = transform
  }

  interface PlayheadPositionState {
    itemFrom: number
    totalFrames: number
    relativeFrame: number
    clampToItemBounds: boolean
    followPreviewFrame: boolean
  }

  function clampRelativeFrame(frame: number, pos: PlayheadPositionState): number {
    if (!pos.clampToItemBounds) return frame
    const lastFrame = Math.max(0, (pos.totalFrames || 1) - 1)
    return Math.max(0, Math.min(lastFrame, frame))
  }

  function resolveScrubHandoffFrame(
    pos: PlayheadPositionState,
    currentFrame: number,
    previewFrame: number | null,
    isMainTimelineScrubbing: boolean,
  ): number | null {
    if (isMainTimelineScrubbing) {
      mainTimelineScrubHandoffFrameRef.current = previewFrame ?? currentFrame
      return null
    }

    const handoffFrame = mainTimelineScrubHandoffFrameRef.current
    if (handoffFrame === null) return null
    if (pos.itemFrom + pos.relativeFrame === handoffFrame) {
      mainTimelineScrubHandoffFrameRef.current = null
      return null
    }

    return clampRelativeFrame(handoffFrame - pos.itemFrom, pos)
  }

  function resolveLocalScrubHandoffFrame(
    pos: PlayheadPositionState,
    isLocalTimelineScrubbing: boolean,
    handoffFrameRef?: Ref<number | null>,
  ): number | null {
    if (isLocalTimelineScrubbing || !handoffFrameRef) return null
    const handoffFrame = handoffFrameRef.current
    if (handoffFrame === null) return null
    if (pos.relativeFrame === handoffFrame) {
      handoffFrameRef.current = null
      return null
    }
    return clampRelativeFrame(handoffFrame, pos)
  }

  function shouldFollowTransientFrame(
    pos: PlayheadPositionState,
    isMainTimelineScrubbing: boolean,
    isLocalTimelineScrubbing: boolean,
  ): boolean {
    return pos.followPreviewFrame || isMainTimelineScrubbing || isLocalTimelineScrubbing
  }

  function resolveLiveRelativeFrame(
    pos: PlayheadPositionState,
    currentFrame: number,
    previewFrame: number | null,
    isPlaying: boolean,
    isMainTimelineScrubbing: boolean,
    followTransientFrame: boolean,
  ): number | null {
    const hasFollowedPreview = previewFrame !== null && followTransientFrame
    if (!isPlaying && !isMainTimelineScrubbing && !hasFollowedPreview) return null
    const frame = followTransientFrame ? (previewFrame ?? currentFrame) : currentFrame
    return clampRelativeFrame(frame - pos.itemFrom, pos)
  }

  interface DopesheetPlayheadLineProps {
    /** Clip-relative playhead frame for paused seek and zoom updates. */
    relativeFrame: number
    /** Absolute timeline frame where the edited item starts. */
    itemFrom: number
    /** Item duration in frames. */
    totalFrames: number
    /** Whether live playback should stop at the edited clip's bounds. */
    clampToItemBounds?: boolean
    /** Whether the committed playhead should follow transient preview/skim frames. */
    followPreviewFrame?: boolean
    /** Local ruler ownership allows scrub previews without following ordinary hover skims. */
    localScrubActiveRef?: Ref<boolean>
    /** Last local ruler frame held until the deferred editor prop catches up. */
    localScrubHandoffFrameRef?: Ref<number | null>
    /** Convert a clip-relative frame to x within the timeline viewport. */
    frameToX: (frame: number) => number
    /** Exact shared Edit-axis mapper. Receives an absolute timeline frame. */
    globalFrameToX?: (globalFrame: number) => number
    /** Live scroll surface that should reposition this playhead before the editor updates. */
    positionSyncTargetRef?: Ref<HTMLElement | null>
    /** Upper clamp for the playhead's left position. */
    maxLeft: number
    /** Pin the playhead to the visible viewport instead of letting its clip hide it. */
    clampToViewport?: boolean
    class?: string
  }
</script>

<script lang="ts">
  import { usePlaybackStore } from '@/shared/state/playback'
  import { mainTimelineScrubActiveRef } from '@/shared/timeline/main-timeline-scrub'
  import { TIMELINE_LIVE_SCROLL_EVENT, TIMELINE_SCRUB_VISUAL_FRAME_EVENT, getTimelineScrubViewportX, type TimelineScrubVisualFrameDetail } from '@/shared/timeline/live-scroll-sync'
  import PlayheadMarks from '@/shared/ui/playhead-marks.svelte'

  let {
    relativeFrame,
    itemFrom,
    totalFrames,
    clampToItemBounds = true,
    followPreviewFrame = true,
    localScrubActiveRef,
    localScrubHandoffFrameRef,
    frameToX,
    globalFrameToX,
    positionSyncTargetRef,
    maxLeft,
    clampToViewport = true,
    class: className,
  }: DopesheetPlayheadLineProps = $props()

  let element = $state<HTMLDivElement | null>(null)

  // Positioning inputs, read through props at call time so the store
  // subscription below stays stable.
  const pos = {
    get frameToX() {
      return frameToX
    },
    get maxLeft() {
      return maxLeft
    },
    get itemFrom() {
      return itemFrom
    },
    get totalFrames() {
      return totalFrames
    },
    get relativeFrame() {
      return relativeFrame
    },
    get clampToItemBounds() {
      return clampToItemBounds
    },
    get followPreviewFrame() {
      return followPreviewFrame
    },
    get globalFrameToX() {
      return globalFrameToX
    },
    get clampToViewport() {
      return clampToViewport
    },
  }

  const clampLeft = (frame: number): number => {
    const mappedX = pos.globalFrameToX
      ? pos.globalFrameToX(pos.itemFrom + frame)
      : pos.frameToX(frame)
    return pos.clampToViewport ? Math.max(0, Math.min(pos.maxLeft, mappedX)) : mappedX
  }

  const livePlaybackRelFrame = (): number | null => {
    const state = usePlaybackStore.getState()
    const isMainTimelineScrubbing = mainTimelineScrubActiveRef.current
    const isLocalTimelineScrubbing = localScrubActiveRef?.current === true
    const followTransientFrame = shouldFollowTransientFrame(
      pos,
      isMainTimelineScrubbing,
      isLocalTimelineScrubbing,
    )

    const localHandoffFrame = resolveLocalScrubHandoffFrame(
      pos,
      isLocalTimelineScrubbing,
      localScrubHandoffFrameRef,
    )
    if (localHandoffFrame !== null) return localHandoffFrame

    const handoffFrame = resolveScrubHandoffFrame(
      pos,
      state.currentFrame,
      state.previewFrame,
      isMainTimelineScrubbing,
    )
    if (handoffFrame !== null) return handoffFrame
    return resolveLiveRelativeFrame(
      pos,
      state.currentFrame,
      state.previewFrame,
      state.isPlaying,
      isMainTimelineScrubbing,
      followTransientFrame,
    )
  }

  // Re-place on every change of the positioning inputs (React ran this after
  // every render).
  $effect.pre(() => {
    void [
      frameToX,
      maxLeft,
      itemFrom,
      totalFrames,
      relativeFrame,
      clampToItemBounds,
      followPreviewFrame,
      globalFrameToX,
      clampToViewport,
    ]
    const node = element
    if (!node) return
    // The local ruler drag owns the visual position until its queued scrub
    // frame catches up with a live edge-scroll. Reapplying settled props here
    // would briefly map the previous frame against the new scroll position.
    if (localScrubActiveRef?.current === true || mainTimelineScrubActiveRef.current) return
    const liveRelativeFrame = livePlaybackRelFrame()
    setTranslateXIfChanged(node, clampLeft(liveRelativeFrame ?? pos.relativeFrame))
  })

  $effect(() => {
    const target = positionSyncTargetRef?.current
    void localScrubActiveRef
    void localScrubHandoffFrameRef
    const update = () => {
      const liveRelativeFrame = livePlaybackRelFrame()
      const frame = liveRelativeFrame ?? pos.relativeFrame
      if (element) {
        setTranslateXIfChanged(element, clampLeft(frame))
      }
    }
    const updateFromScroll = () => {
      // Edge scrolling broadcasts scrollLeft before the coalesced scrub frame.
      // Preserve the cursor-locked visual until the playback-store update.
      if (localScrubActiveRef?.current === true || mainTimelineScrubActiveRef.current) return
      update()
    }
    const updateFromScrubVisualFrame = (event: Event) => {
      const { viewportProgress } = (event as CustomEvent<TimelineScrubVisualFrameDetail>).detail
      if (!element) return
      const viewportX = getTimelineScrubViewportX(viewportProgress, pos.maxLeft)
      setTranslateXIfChanged(element, viewportX)
    }
    const unsubscribe = usePlaybackStore.subscribe(update)
    target?.addEventListener('scroll', updateFromScroll, { passive: true })
    target?.addEventListener(TIMELINE_LIVE_SCROLL_EVENT, updateFromScroll)
    target?.addEventListener(TIMELINE_SCRUB_VISUAL_FRAME_EVENT, updateFromScrubVisualFrame)
    return () => {
      unsubscribe()
      target?.removeEventListener('scroll', updateFromScroll)
      target?.removeEventListener(TIMELINE_LIVE_SCROLL_EVENT, updateFromScroll)
      target?.removeEventListener(TIMELINE_SCRUB_VISUAL_FRAME_EVENT, updateFromScrubVisualFrame)
    }
  })
</script>

<div bind:this={element} data-testid="dopesheet-playhead-line" class={className}>
  <PlayheadMarks handle="flag" />
</div>

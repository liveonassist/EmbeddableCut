<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import type { CompositionInputProps } from '@/types/export'
  import { type PlayerRef } from '@/features/preview/deps/player-core'


  interface DomTextScrubOverlayProps {
    playerRef: { current: PlayerRef | null }
    visible: boolean
    durationInFrames: number
    fps: number
    renderSize: { width: number; height: number }
    layoutSize: { width: number; height: number }
    inputProps: CompositionInputProps
  }

  const ignoreFrameChange = () => undefined

  const ignorePlayStateChange = () => undefined
</script>

<script lang="ts">
  import { HeadlessPlayer } from '@/features/preview/deps/player-core'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { getResolvedPlaybackFrame } from '@/shared/state/playback/frame-resolution'
  import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
  import { MainComposition } from '@/features/preview/deps/composition-runtime-ui'
  import { useItemsStore } from '@/features/preview/deps/timeline-store'
  let { playerRef, visible, durationInFrames, fps, renderSize, layoutSize, inputProps }: DomTextScrubOverlayProps = $props()
  const pendingFrameRef: { current: number | null } = { current: null }
  const rafRef: { current: number | null } = { current: null }
  const lastFrameRef: { current: number | null } = { current: null }

  const flushFrame = () => {
    rafRef.current = null
    const frame = pendingFrameRef.current
    pendingFrameRef.current = null
    if (frame === null || frame === lastFrameRef.current || !playerRef.current) return
    playerRef.current.seekTo(frame)
    lastFrameRef.current = frame
  }

  $effect(() => {
    if (!visible) return

    const queueFrame = (frame: number) => {
      pendingFrameRef.current = Math.max(0, Math.round(frame))
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flushFrame)
      }
    }
    const getVisibleFrame = () => {
      const playbackState = usePlaybackStore.getState()
      return getResolvedPlaybackFrame({
        currentFrame: playbackState.currentFrame,
        currentFrameEpoch: playbackState.currentFrameEpoch,
        previewFrame: playbackState.previewFrame,
        previewFrameEpoch: playbackState.previewFrameEpoch,
        isPlaying: playbackState.isPlaying,
        displayedFrame: usePreviewBridgeStore.getState().displayedFrame,
      })
    }
    let resolvedFrame = getVisibleFrame()
    queueFrame(resolvedFrame)

    const syncVisibleFrame = () => {
      const frame = getVisibleFrame()
      if (frame === resolvedFrame) return
      resolvedFrame = frame
      queueFrame(frame)
    }
    const unsubscribePlayback = usePlaybackStore.subscribe(syncVisibleFrame)
    const unsubscribePreviewBridge = usePreviewBridgeStore.subscribe(syncVisibleFrame)

    return () => {
      unsubscribePlayback()
      unsubscribePreviewBridge()
      pendingFrameRef.current = null
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  })
</script>

<div
  aria-hidden="true"
  data-dom-text-scrub-overlay
  class="absolute inset-0 pointer-events-none"
  style:z-index="6"
  style:visibility={visible ? 'visible' : 'hidden'}
  style:contain="layout paint style"
>
  <HeadlessPlayer
    bind:ref={playerRef.current}
    durationInFrames={durationInFrames}
    fps={fps}
    width={renderSize.width}
    height={renderSize.height}
    autoPlay={false}
    loop={false}
    layoutSize={layoutSize}
    style={`width: 100%; height: 100%; background-color: transparent`}
    onFrameChange={ignoreFrameChange}
    onPlayStateChange={ignorePlayStateChange}
  >
    <MainComposition
      {...inputProps}
      backgroundColor="transparent"
      useProxyMedia
      transparentBackground
      liveItemTransformSource={useItemsStore}
     />
  </HeadlessPlayer>
</div>

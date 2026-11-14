<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { mockPlayer, mockPlayerFrame } from './video-preview.sync.mock-state.svelte'

  let {
    children,
    width,
    height,
    onFrameChange,
    ref = $bindable(null),
  }: {
    children?: Snippet
    width?: number
    height?: number
    onFrameChange?: (frame: number) => void
    ref?: unknown
  } & Record<string, unknown> = $props()

  $effect.pre(() => {
    const safeWidth = Number.isFinite(width) ? Number(width) : 0
    const safeHeight = Number.isFinite(height) ? Number(height) : 0
    mockPlayer.lastDimensions = { width: safeWidth, height: safeHeight }
    mockPlayer.dimensionsHistory.push(mockPlayer.lastDimensions)
  })

  ref = {
    seekTo: (frame: number) => {
      const nextFrame = Math.round(frame)
      mockPlayer.seekToMock(nextFrame)
      if (mockPlayer.deferSeekCompletion) {
        mockPlayer.completeDeferredSeek = (frameOverride) => {
          const resolvedFrame = frameOverride ?? nextFrame
          mockPlayerFrame.value = resolvedFrame
          onFrameChange?.(resolvedFrame)
          if (resolvedFrame === nextFrame) {
            mockPlayer.completeDeferredSeek = null
          }
        }
        return
      }
      mockPlayerFrame.value = nextFrame
      onFrameChange?.(nextFrame)
    },
    play: () => {
      mockPlayer.isPlaying = true
      mockPlayer.playMock()
    },
    pause: () => {
      mockPlayer.isPlaying = false
      mockPlayer.pauseMock()
    },
    // A real player reads its clock here, which nothing subscribes to.
    getCurrentFrame: () => untrack(() => mockPlayerFrame.value),
    isPlaying: () => mockPlayer.isPlaying,
    setPlaybackRate: () => {},
  }
</script>

<div data-testid="mock-player">
  {@render children?.()}
</div>
